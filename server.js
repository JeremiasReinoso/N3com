import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LocalLicenseService } from './services/licenseService.js';
import { AdminAuthService } from './services/adminAuthService.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};
const MAX_BODY_BYTES = 256_000;
const PUBLIC_EXACT_PATHS = new Set(['/index.html', '/admin.html']);
const PUBLIC_DIR_PREFIXES = ['/css/', '/js/', '/assets/'];

const SECURITY_HEADERS = Object.freeze({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Resource-Policy': 'same-origin'
});

const send = (response, status, body, extraHeaders = {}) => {
    response.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extraHeaders
    });
    response.end(JSON.stringify(body));
};

const readBody = request => new Promise((resolveBody, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    const abort = err => {
        if (settled) return;
        settled = true;
        reject(err);
    };
    request.on('data', chunk => {
        if (settled) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > MAX_BODY_BYTES) {
            request.destroy();
            abort(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 }));
            return;
        }
        chunks.push(buf);
    });
    request.on('end', () => {
        if (settled) return;
        settled = true;
        try {
            const raw = Buffer.concat(chunks).toString('utf8');
            resolveBody(raw ? JSON.parse(raw) : {});
        } catch {
            reject(Object.assign(new Error('INVALID_BODY'), { status: 400 }));
        }
    });
    request.on('error', abort);
});

const fail = (response, status, message) => send(response, status, { error: message });

const isAllowedHost = hostHeader => {
    if (!hostHeader) return true;
    return /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/i.test(String(hostHeader).trim());
};

const isSameOriginRequest = (request, listeningOrigin) => {
    const origin = request.headers.origin;
    if (!origin) return true;
    return origin === listeningOrigin || origin === listeningOrigin.replace('127.0.0.1', 'localhost');
};

const isPublicStaticPath = requested => {
    if (requested.includes('\0') || requested.includes('\\') || requested.includes('..')) return false;
    if (PUBLIC_EXACT_PATHS.has(requested)) return true;
    if (!PUBLIC_DIR_PREFIXES.some(prefix => requested.startsWith(prefix))) return false;
    return !requested.split('/').some(segment => segment.startsWith('.'));
};

const requireAdmin = (request, response, adminAuth, requireCsrf = false) => {
    const session = adminAuth.validateSession(request);
    if (!session) {
        fail(response, 401, 'Autenticación administrativa requerida.');
        return null;
    }
    if (requireCsrf && !adminAuth.validateCsrf(request, session)) {
        fail(response, 403, 'Token CSRF inválido o ausente.');
        return null;
    }
    return session;
};

const api = async (request, response, url, licenseService, adminAuth, listeningOrigin) => {
    const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
    if (isMutating && !isSameOriginRequest(request, listeningOrigin)) {
        return fail(response, 403, 'Solicitud bloqueada por política de origen.');
    }

    const clientKey = request.socket?.remoteAddress || 'local';

    // Endpoints de autenticación administrativa del servidor
    if (request.method === 'GET' && url.pathname === '/api/admin/session') {
        const configured = await adminAuth.isConfigured();
        const session = adminAuth.validateSession(request);
        return send(response, 200, {
            configured,
            authenticated: Boolean(session),
            username: session?.username || null,
            csrfToken: session?.csrfToken || null
        });
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/setup') {
        const body = await readBody(request);
        const session = await adminAuth.setupInitialAdmin(body.username, body.password);
        return send(response, 201, {
            authenticated: true,
            username: session.username,
            csrfToken: session.csrfToken
        }, { 'Set-Cookie': adminAuth.sessionCookieHeader(session.sid) });
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/login') {
        const body = await readBody(request);
        const session = await adminAuth.login(body.username, body.password, clientKey);
        return send(response, 200, {
            authenticated: true,
            username: session.username,
            csrfToken: session.csrfToken
        }, { 'Set-Cookie': adminAuth.sessionCookieHeader(session.sid) });
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
        const session = adminAuth.validateSession(request);
        if (session && !adminAuth.validateCsrf(request, session)) {
            return fail(response, 403, 'Token CSRF inválido o ausente.');
        }
        adminAuth.logout(request);
        return send(response, 200, { authenticated: false }, { 'Set-Cookie': adminAuth.sessionCookieHeader('', true) });
    }

    // Endpoints públicos del cliente de torneos (activación, consumo y clave pública de verificación)
    if (request.method === 'GET' && url.pathname === '/api/licenses/public-key') {
        return send(response, 200, { algorithm: 'Ed25519', publicKeyPem: licenseService.getPublicKeyPem() });
    }
    if (request.method === 'POST' && url.pathname === '/api/licenses/activate') {
        return send(response, 200, await licenseService.activate((await readBody(request)).code));
    }
    if (request.method === 'POST' && url.pathname === '/api/licenses/consume') {
        return send(response, 200, await licenseService.consumeTournament((await readBody(request)).code));
    }

    // Endpoints administrativos de licencias (exigen sesión HttpOnly + CSRF en mutaciones)
    if (request.method === 'GET' && url.pathname === '/api/licenses') {
        if (!requireAdmin(request, response, adminAuth, false)) return;
        return send(response, 200, { licenses: await licenseService.list() });
    }
    if (request.method === 'POST' && url.pathname === '/api/licenses') {
        if (!requireAdmin(request, response, adminAuth, true)) return;
        const body = await readBody(request);
        return send(response, 201, await licenseService.create(body));
    }
    if (request.method === 'DELETE' && url.pathname === '/api/licenses') {
        if (!requireAdmin(request, response, adminAuth, true)) return;
        return send(response, 200, await licenseService.clear());
    }
    const id = url.pathname.match(/^\/api\/licenses\/([^/]+)$/)?.[1];
    if (request.method === 'DELETE' && id) {
        if (!requireAdmin(request, response, adminAuth, true)) return;
        return send(response, 200, await licenseService.remove(decodeURIComponent(id)));
    }
    if (request.method === 'PATCH' && id) {
        if (!requireAdmin(request, response, adminAuth, true)) return;
        const body = await readBody(request); const licenseId = decodeURIComponent(id);
        const license = body.action === 'add-credits'
            ? await licenseService.addTournaments(licenseId, body.amount)
            : await licenseService.update(licenseId, body);
        return send(response, 200, license);
    }
    return fail(response, 404, 'Recurso no encontrado.');
};

const serveStatic = async (response, url, privateDirectory) => {
    let requested;
    try {
        requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    } catch {
        response.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Solicitud inválida');
        return;
    }
    if (!isPublicStaticPath(requested)) {
        response.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('No encontrado');
        return;
    }
    const filePath = resolve(root, `.${requested}`);
    const relRoot = relative(root, filePath);
    const relPrivate = relative(privateDirectory, filePath);
    if (
        !relRoot
        || relRoot.startsWith('..')
        || isAbsolute(relRoot)
        || filePath === privateDirectory
        || (!relPrivate.startsWith('..') && !isAbsolute(relPrivate))
    ) {
        response.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('No encontrado');
        return;
    }
    try {
        const content = await readFile(filePath);
        response.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        response.end(content);
    } catch {
        response.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('No encontrado');
    }
};

// Electron reutiliza exactamente este servidor para no duplicar el frontend ni
// la API de licencias. En escritorio los datos privados viven bajo userData;
// al ejecutar `node server.js` se conserva el directorio local histórico.
export const startLocalServer = async ({
    port = Number(process.env.PORT || 4173),
    privateDirectory = resolve(process.env.NEWCOM_PRIVATE_DIR || resolve(root, 'private')),
    adminCredentials = {}
} = {}) => {
    const resolvedPrivateDirectory = resolve(privateDirectory);
    const licenseService = new LocalLicenseService(resolvedPrivateDirectory);
    await licenseService.initialize();
    const adminAuth = new AdminAuthService(resolvedPrivateDirectory, adminCredentials);
    await adminAuth.initialize();

    let listeningOrigin = `http://127.0.0.1:${port}`;
    const server = createServer(async (request, response) => {
        if (!isAllowedHost(request.headers.host)) {
            return fail(response, 403, 'Host no permitido.');
        }
        let url;
        try {
            url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
        } catch {
            return fail(response, 400, 'URL inválida.');
        }
        try {
            if (url.pathname.startsWith('/api/')) await api(request, response, url, licenseService, adminAuth, listeningOrigin);
            else await serveStatic(response, url, resolvedPrivateDirectory);
        }
        catch (error) {
            const messages = {
                LICENSE_INVALID: 'El código de licencia no es válido o está deshabilitado.',
                NO_CREDITS: 'No tenés torneos disponibles. Contactá al administrador para adquirir más.',
                INVALID_CREDITS: 'Ingrese una cantidad de torneos válida.',
                INVALID_CLIENT: 'Ingrese los datos del cliente.',
                INVALID_BODY: 'Los datos enviados no son válidos.',
                PAYLOAD_TOO_LARGE: 'El tamaño de la solicitud excede el límite permitido.',
                LICENSE_NOT_FOUND: 'No se encontró la licencia seleccionada.',
                INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos.',
                TOO_MANY_ATTEMPTS: 'Demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.',
                ADMIN_ALREADY_CONFIGURED: 'La cuenta administrativa ya fue configurada.',
                ADMIN_NOT_CONFIGURED: 'Primero configurá la cuenta de administrador.',
                INVALID_ADMIN_SETUP: 'Ingresá un usuario válido (entre 3 y 64 caracteres).',
                WEAK_ADMIN_PASSWORD: 'La contraseña administrativa debe tener al menos 8 caracteres.'
            };
            const status = error.status || 400;
            fail(response, status, messages[error.message] || 'No se pudo procesar la solicitud.');
        }
    });

    await new Promise((resolveListening, rejectListening) => {
        server.once('error', rejectListening);
        server.listen(port, '127.0.0.1', resolveListening);
    });
    const address = server.address();
    const listeningPort = typeof address === 'object' && address ? address.port : port;
    listeningOrigin = `http://127.0.0.1:${listeningPort}`;
    return { server, port: listeningPort, url: listeningOrigin, licenseService, adminAuth };
};

const isDirectExecution = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
    const localServer = await startLocalServer();
    console.log(`NEWCOM local: ${localServer.url}`);
}
