import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalServer } from '../server.js';
import { LocalLicenseService } from '../services/licenseService.js';
import { verifySignedLicenseToken } from '../services/signedLicenseService.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('servidor local: allowlist estático bloquea código fuente, .git y private; cabeceras CSP y seguridad presentes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'n3com-sec-static-'));
    const srv = await startLocalServer({
        port: 0,
        privateDirectory: dir,
        adminCredentials: { envUsername: 'sec_admin', envPassword: 'SecPassword#2026' }
    });
    try {
        for (const blocked of ['/server.js', '/package.json', '/.git/HEAD', '/electron/main.js', '/services/licenseService.js', '/private/licenses.json', '/private/admin.json', '/private/license-signing.json', '/tests/admin-auth.test.mjs']) {
            const res = await fetch(`${srv.url}${blocked}`);
            assert.equal(res.status, 404, `${blocked} jamás debe servirse por HTTP`);
        }

        const okRes = await fetch(`${srv.url}/index.html`);
        assert.equal(okRes.status, 200);
        const csp = okRes.headers.get('content-security-policy') || '';
        assert(csp.includes("script-src 'self'"), 'CSP debe restringir scripts a self');
        assert(!/script-src[^;]*unsafe-inline/.test(csp), 'script-src no debe permitir unsafe-inline');
        assert.equal(okRes.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(okRes.headers.get('x-frame-options'), 'DENY');
        assert.equal(okRes.headers.get('referrer-policy'), 'no-referrer');
        assert.equal(okRes.headers.get('cross-origin-resource-policy'), 'same-origin');

        // Verifica ausencia de scripts inline en index.html y admin.html
        const indexHtml = await readFile(resolve(root, 'index.html'), 'utf8');
        const adminHtml = await readFile(resolve(root, 'admin.html'), 'utf8');
        assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(indexHtml), false, 'index.html no debe contener scripts inline');
        assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(adminHtml), false, 'admin.html no debe contener scripts inline');

        // Malformed URL encoding no debe filtrar errores de licencias
        const badEnc = await fetch(`${srv.url}/%E0%A4%A`);
        assert.equal(badEnc.status, 400);
    } finally {
        srv.server.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test('API administrativa: exige sesión HttpOnly, valida CSRF, bloquea cross-origin y aplica rate limiting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'n3com-sec-api-'));
    const srv = await startLocalServer({
        port: 0,
        privateDirectory: dir,
        adminCredentials: { envUsername: 'sec_admin', envPassword: 'SecPassword#2026' }
    });
    try {
        // Sin sesión: bloqueado
        assert.equal((await fetch(`${srv.url}/api/licenses`)).status, 401);
        assert.equal((await fetch(`${srv.url}/api/licenses`, { method: 'DELETE' })).status, 401);
        assert.equal((await fetch(`${srv.url}/api/licenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientName: 'Intruso', tournamentsPurchased: 100 })
        })).status, 401);

        // Cross-origin CSRF bloqueado
        const crossOrigin = await fetch(`${srv.url}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
            body: JSON.stringify({ username: 'sec_admin', password: 'SecPassword#2026' })
        });
        assert.equal(crossOrigin.status, 403);

        // Login correcto
        const login = await fetch(`${srv.url}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'sec_admin', password: 'SecPassword#2026' })
        });
        assert.equal(login.status, 200);
        const setCookie = login.headers.get('set-cookie') || '';
        assert(setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Strict'));
        const cookie = setCookie.split(';')[0];
        const { csrfToken } = await login.json();
        assert(csrfToken && csrfToken.length >= 32);

        // Mutación sin CSRF header: 403
        const noCsrf = await fetch(`${srv.url}/api/licenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ clientName: 'Sin CSRF', tournamentsPurchased: 2 })
        });
        assert.equal(noCsrf.status, 403);

        // Mutación con cookie + CSRF: 201
        const created = await fetch(`${srv.url}/api/licenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ clientName: 'Club Seguro', organization: 'Asoc. Norte', edition: 'asociacion', tournamentsPurchased: 5 })
        });
        assert.equal(created.status, 201);
        const license = await created.json();
        assert(license.signedToken?.startsWith('NWC2-'));

        // Logout invalida la sesión
        const logout = await fetch(`${srv.url}/api/admin/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
            body: '{}'
        });
        assert.equal(logout.status, 200);
        assert.equal((await fetch(`${srv.url}/api/licenses`, { headers: { Cookie: cookie } })).status, 401);

        // Rate limiting tras 5 fallos consecutivos
        for (let i = 0; i < 5; i += 1) {
            const failLogin = await fetch(`${srv.url}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'sec_admin', password: 'wrong' })
            });
            assert.equal(failLogin.status, 401);
        }
        const rateLimited = await fetch(`${srv.url}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'sec_admin', password: 'SecPassword#2026' })
        });
        assert.equal(rateLimited.status, 429);
    } finally {
        srv.server.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test('licencias firmadas Ed25519 (v2): infalsificables, verificables con clave pública y sin exponer clave privada', async () => {
    const issuerDir = await mkdtemp(join(tmpdir(), 'n3com-ed-issuer-'));
    const clientDir = await mkdtemp(join(tmpdir(), 'n3com-ed-client-'));
    try {
        const issuer = new LocalLicenseService(issuerDir);
        await issuer.initialize();
        const issued = await issuer.create({
            clientName: 'Federación Sur',
            organization: 'Federación Sur',
            edition: 'federacion',
            tournamentsPurchased: 10
        });
        assert(issued.signedToken.startsWith('NWC2-'));

        const publicKeyPem = issuer.getPublicKeyPem();
        assert(publicKeyPem.includes('BEGIN PUBLIC KEY'));
        assert(!publicKeyPem.includes('PRIVATE KEY'));

        const verified = verifySignedLicenseToken(issued.signedToken, publicKeyPem);
        assert(verified);
        assert.equal(verified.tournamentsPurchased, 10);
        assert.equal(verified.edition, 'federacion');

        // Manipular el payload (subir créditos de 10 a 9999) invalida la firma Ed25519
        const [, sig] = issued.signedToken.slice(5).split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ v: 2, id: issued.id, credits: 9999, org: 'Hack', edition: 'federacion' })).toString('base64url');
        const forgedToken = `NWC2-${forgedPayload}.${sig}`;
        assert.equal(verifySignedLicenseToken(forgedToken, publicKeyPem), null, 'Un token adulterado debe rechazarse');

        // Activación en otra instalación usando solo la clave pública
        const recipient = new LocalLicenseService(clientDir);
        await recipient.initialize();
        const activated = await recipient.activate(issued.signedToken, publicKeyPem);
        assert.equal(activated.tournamentsRemaining, 10);
        assert.equal(activated.edition, 'federacion');
        const afterConsume = await recipient.consumeTournament(issued.signedToken);
        assert.equal(afterConsume.tournamentsRemaining, 9);
    } finally {
        await rm(issuerDir, { recursive: true, force: true });
        await rm(clientDir, { recursive: true, force: true });
    }
});

test('Electron: endurecimiento de aislamiento, permisos, navegación y bloqueo de instancia única', async () => {
    const electronSource = await readFile(resolve(root, 'electron/main.js'), 'utf8');
    assert(electronSource.includes('contextIsolation: true'));
    assert(electronSource.includes('nodeIntegration: false'));
    assert(electronSource.includes('sandbox: true'));
    assert(electronSource.includes('webSecurity: true'));
    assert(electronSource.includes('allowRunningInsecureContent: false'));
    assert(electronSource.includes('setPermissionRequestHandler'));
    assert(electronSource.includes('requestSingleInstanceLock'));
    assert(electronSource.includes('will-redirect'));
    assert(electronSource.includes('setWindowOpenHandler'));
});
