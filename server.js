import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalLicenseService } from './services/licenseService.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const privateDirectory = resolve(process.env.NEWCOM_PRIVATE_DIR || resolve(root, 'private'));
const licenseService = new LocalLicenseService(privateDirectory);
const port = Number(process.env.PORT || 4173);
const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const send = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
};
const readBody = request => new Promise((resolveBody, reject) => {
    let content = '';
    request.on('data', chunk => { content += chunk; if (content.length > 1_000_000) reject(new Error('INVALID_BODY')); });
    request.on('end', () => { try { resolveBody(JSON.parse(content || '{}')); } catch { reject(new Error('INVALID_BODY')); } });
    request.on('error', reject);
});
const fail = (response, status, message) => send(response, status, { error: message });

const api = async (request, response, url) => {
    if (request.method === 'GET' && url.pathname === '/api/licenses') return send(response, 200, { licenses: await licenseService.list() });
    if (request.method === 'POST' && url.pathname === '/api/licenses') {
        const body = await readBody(request);
        return send(response, 201, await licenseService.create(body));
    }
    if (request.method === 'POST' && url.pathname === '/api/licenses/activate') {
        return send(response, 200, await licenseService.activate((await readBody(request)).code));
    }
    if (request.method === 'POST' && url.pathname === '/api/licenses/consume') {
        return send(response, 200, await licenseService.consumeTournament((await readBody(request)).code));
    }
    const id = url.pathname.match(/^\/api\/licenses\/([^/]+)$/)?.[1];
    if (request.method === 'PATCH' && id) {
        const body = await readBody(request); const licenseId = decodeURIComponent(id);
        const license = body.action === 'add-credits'
            ? await licenseService.addTournaments(licenseId, body.amount)
            : await licenseService.update(licenseId, body);
        return send(response, 200, license);
    }
    return fail(response, 404, 'Recurso no encontrado.');
};

const serveStatic = async (response, url) => {
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if (requested === '/private' || requested.startsWith('/private/')) { response.writeHead(404); response.end(); return; }
    const filePath = resolve(root, `.${requested}`);
    if (relative(root, filePath).startsWith('..') || filePath === privateDirectory || (!relative(privateDirectory, filePath).startsWith('..') && relative(privateDirectory, filePath) !== '')) { response.writeHead(404); response.end(); return; }
    try {
        const content = await readFile(filePath);
        response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(content);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('No encontrado'); }
};

await licenseService.initialize();
createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    try { if (url.pathname.startsWith('/api/')) await api(request, response, url); else await serveStatic(response, url); }
    catch (error) {
        const messages = {
            LICENSE_INVALID: 'El código de licencia no es válido o está deshabilitado.',
            NO_CREDITS: 'No tenés torneos disponibles. Contactá al administrador para adquirir más.',
            INVALID_CREDITS: 'Ingrese una cantidad de torneos válida.',
            INVALID_CLIENT: 'Ingrese los datos del cliente.',
            INVALID_BODY: 'Los datos enviados no son válidos.',
            LICENSE_NOT_FOUND: 'No se encontró la licencia seleccionada.'
        };
        fail(response, 400, messages[error.message] || 'No se pudo actualizar la licencia.');
    }
}).listen(port, '127.0.0.1', () => console.log(`NEWCOM local: http://127.0.0.1:${port}`));
