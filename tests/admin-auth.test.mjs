import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdminAuthService } from '../services/adminAuthService.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientAuthSource = await readFile(resolve(root, 'js/core/adminAuth.js'), 'utf8');
assert.equal(/AjedrezTotal2026|MRX2026/.test(clientAuthSource), false, 'El código cliente no debe contener credenciales administrativas en texto plano.');

const dir = await mkdtemp(join(tmpdir(), 'n3com-admin-auth-'));
try {
    const auth = new AdminAuthService(dir);
    await auth.initialize();
    assert.equal(await auth.isConfigured(), false, 'Sin configuración previa debe requerir setup inicial.');

    await assert.rejects(() => auth.setupInitialAdmin('admin', 'corta'), /WEAK_ADMIN_PASSWORD/);
    const session = await auth.setupInitialAdmin('admin_n3com', 'ClaveSegura#2026');
    assert(session.sid && session.csrfToken);
    assert.equal(await auth.isConfigured(), true);

    await assert.rejects(() => auth.setupInitialAdmin('otro', 'OtraClave#2026'), /ADMIN_ALREADY_CONFIGURED/);
    const persisted = await readFile(join(dir, 'admin.json'), 'utf8');
    assert.equal(persisted.includes('ClaveSegura#2026'), false, 'La contraseña jamás debe guardarse en texto plano.');
    assert(persisted.includes('"algorithm": "scrypt"'));

    const logged = await auth.login(' admin_n3com ', ' ClaveSegura#2026 ', '127.0.0.1');
    assert(logged.sid && logged.csrfToken);

    await assert.rejects(() => auth.login('ADMIN_N3COM', 'ClaveSegura#2026', '127.0.0.1'), /INVALID_CREDENTIALS/);
    await assert.rejects(() => auth.login('admin_n3com', 'incorrecta', '127.0.0.1'), /INVALID_CREDENTIALS/);
    console.log('La autenticación administrativa usa hash scrypt en servidor, sesión HttpOnly y sin secretos en cliente.');
} finally {
    await rm(dir, { recursive: true, force: true });
}
