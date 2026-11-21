// Cliente de autenticación administrativa sin credenciales embebidas.
// En modo servidor/Electron delega 100% en /api/admin/* (scrypt + cookie HttpOnly + CSRF).
// En hosting estático puro (sin servidor) permite configurar un acceso local con hash SHA-256 + sal.

const STATIC_ADMIN_KEY = 'newcom_static_admin_v2';
let currentCsrfToken = null;
let staticAuthenticated = false;

const clean = value => String(value || '').trim();
const unavailable = () => Object.assign(new Error('ADMIN_API_UNAVAILABLE'), { code: 'ADMIN_API_UNAVAILABLE' });

const sha256Hex = async text => {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
};

const randomHex = (byteCount = 16) => {
    const bytes = new Uint8Array(byteCount);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

const readStaticAdmin = () => {
    try { return JSON.parse(localStorage.getItem(STATIC_ADMIN_KEY) || 'null'); }
    catch { return null; }
};

const apiCall = async (path, method = 'GET', body) => {
    let response;
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (currentCsrfToken && method !== 'GET') headers['X-CSRF-Token'] = currentCsrfToken;
        response = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch {
        throw unavailable();
    }
    const payload = await response.json().catch(() => ({}));
    if ([404, 405, 501].includes(response.status)) throw unavailable();
    if (!response.ok) throw new Error(payload.error || 'No se pudo validar el acceso administrativo.');
    return payload;
};

export const obtenerCsrfToken = () => currentCsrfToken;
export const establecerCsrfToken = token => { currentCsrfToken = token || null; };

export const obtenerSesionAdmin = async () => {
    try {
        const session = await apiCall('/api/admin/session');
        if (typeof session.configured !== 'boolean') throw unavailable();
        currentCsrfToken = session.csrfToken || null;
        return { ...session, mode: 'server' };
    } catch (error) {
        if (error?.code !== 'ADMIN_API_UNAVAILABLE') throw error;
        const stored = readStaticAdmin();
        return {
            configured: Boolean(stored?.username && stored?.hash),
            authenticated: staticAuthenticated,
            username: staticAuthenticated ? stored?.username || null : null,
            csrfToken: null,
            mode: 'browser'
        };
    }
};

export const configurarAdminInicial = async (username, password) => {
    const user = clean(username);
    const pass = String(password || '');
    if (user.length < 3 || pass.length < 8) {
        throw new Error('Ingresá un usuario (mín. 3 caracteres) y una contraseña segura (mín. 8 caracteres).');
    }
    try {
        const result = await apiCall('/api/admin/setup', 'POST', { username: user, password: pass });
        currentCsrfToken = result.csrfToken || null;
        return result;
    } catch (error) {
        if (error?.code !== 'ADMIN_API_UNAVAILABLE') throw error;
        if (readStaticAdmin()?.hash) throw new Error('La cuenta administrativa local ya fue configurada.');
        const salt = randomHex(16);
        const hash = await sha256Hex(`${salt}:${pass}`);
        localStorage.setItem(STATIC_ADMIN_KEY, JSON.stringify({ username: user, salt, hash, createdAt: new Date().toISOString() }));
        staticAuthenticated = true;
        return { authenticated: true, username: user, csrfToken: null };
    }
};

export const iniciarSesionAdmin = async (username, password) => {
    const user = clean(username);
    const pass = String(password || '').trim();
    try {
        const result = await apiCall('/api/admin/login', 'POST', { username: user, password: pass });
        currentCsrfToken = result.csrfToken || null;
        return result;
    } catch (error) {
        if (error?.code !== 'ADMIN_API_UNAVAILABLE') throw error;
        const stored = readStaticAdmin();
        if (!stored?.hash || stored.username !== user) throw new Error('Usuario o contraseña incorrectos.');
        const computed = await sha256Hex(`${stored.salt}:${pass}`);
        if (computed !== stored.hash) throw new Error('Usuario o contraseña incorrectos.');
        staticAuthenticated = true;
        return { authenticated: true, username: stored.username, csrfToken: null };
    }
};

export const cerrarSesionAdmin = async () => {
    try {
        await apiCall('/api/admin/logout', 'POST', {});
    } catch { /* sin servidor */ }
    currentCsrfToken = null;
    staticAuthenticated = false;
};
