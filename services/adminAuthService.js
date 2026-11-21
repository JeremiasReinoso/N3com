// Autenticación administrativa del servidor local.
// - Contraseñas hasheadas con scrypt + sal aleatoria por cuenta (nunca en texto plano ni en frontend).
// - Sesiones aleatorias en memoria con cookie HttpOnly + SameSite=Strict y token CSRF separado.
// - Rate limiting progresivo contra fuerza bruta.

import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';

const SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64 });
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas
const RATE_WINDOW_MS = 5 * 60 * 1000;      // 5 minutos
const MAX_FAILED_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;

const clean = value => String(value || '').trim();

const atomicWriteJson = async (filePath, payload) => {
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}`;
    await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tmpPath, filePath);
    try { await chmod(filePath, 0o600); } catch { /* plataformas sin POSIX chmod */ }
};

export const hashPassword = (password, saltHex = randomBytes(16).toString('hex')) => {
    const raw = String(password || '');
    const derived = scryptSync(raw, saltHex, SCRYPT_PARAMS.keylen, {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p
    });
    return {
        algorithm: 'scrypt',
        salt: saltHex,
        hash: derived.toString('hex'),
        params: { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p, keylen: SCRYPT_PARAMS.keylen }
    };
};

export const verifyPassword = (password, record) => {
    if (!record?.salt || !record?.hash) return false;
    try {
        const params = record.params || SCRYPT_PARAMS;
        const derived = scryptSync(String(password || ''), record.salt, params.keylen || 64, {
            N: params.N || SCRYPT_PARAMS.N,
            r: params.r || SCRYPT_PARAMS.r,
            p: params.p || SCRYPT_PARAMS.p
        });
        const stored = Buffer.from(record.hash, 'hex');
        return derived.length === stored.length && timingSafeEqual(derived, stored);
    } catch {
        return false;
    }
};

export const parseCookies = cookieHeader => {
    const map = new Map();
    String(cookieHeader || '').split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx < 0) return;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (key) map.set(key, val);
    });
    return map;
};

export class AdminAuthService {
    constructor(privateDirectory, options = {}) {
        this.privateDirectory = resolve(privateDirectory);
        this.adminPath = resolve(this.privateDirectory, 'admin.json');
        this.envUsername = clean(options.envUsername ?? process.env.N3COM_ADMIN_USER);
        this.envPassword = String(options.envPassword ?? process.env.N3COM_ADMIN_PASSWORD ?? '');
        this.sessions = new Map();
        this.failedAttempts = new Map();
    }

    async initialize() {
        await mkdir(this.privateDirectory, { recursive: true });
        let data = { version: '2.0', lastUpdated: null, admin: {} };
        if (existsSync(this.adminPath)) {
            try {
                const parsed = JSON.parse(await readFile(this.adminPath, 'utf8'));
                if (parsed && typeof parsed === 'object') data = { version: '2.0', lastUpdated: parsed.lastUpdated || null, admin: parsed.admin || {} };
            } catch { /* re-inicializa estructura limpia */ }
        }
        // Si se proveen variables de entorno explícitas, sincroniza el hash scrypt sin guardar texto plano.
        if (this.envUsername && this.envPassword) {
            data.admin = {
                username: this.envUsername,
                credentials: hashPassword(this.envPassword),
                configuredAt: new Date().toISOString()
            };
            data.lastUpdated = new Date().toISOString();
            await atomicWriteJson(this.adminPath, data);
        } else if (!existsSync(this.adminPath)) {
            await atomicWriteJson(this.adminPath, data);
        }
    }

    async isConfigured() {
        const record = await this.#readAdmin();
        return Boolean(record?.username && record?.credentials?.hash);
    }

    async setupInitialAdmin(username, password) {
        if (await this.isConfigured()) {
            const error = new Error('ADMIN_ALREADY_CONFIGURED');
            error.status = 403;
            throw error;
        }
        const user = clean(username);
        const pass = String(password || '');
        if (!user || user.length < 3 || user.length > 64) {
            const error = new Error('INVALID_ADMIN_SETUP');
            error.status = 400;
            throw error;
        }
        if (pass.length < MIN_PASSWORD_LENGTH || pass.length > 128) {
            const error = new Error('WEAK_ADMIN_PASSWORD');
            error.status = 400;
            throw error;
        }
        const now = new Date().toISOString();
        const payload = {
            version: '2.0',
            lastUpdated: now,
            admin: {
                username: user,
                credentials: hashPassword(pass),
                configuredAt: now
            }
        };
        await atomicWriteJson(this.adminPath, payload);
        return this.#createSession(user);
    }

    async login(username, password, clientKey = 'local') {
        this.#assertNotRateLimited(clientKey);
        const record = await this.#readAdmin();
        if (!record?.username || !record?.credentials?.hash) {
            const error = new Error('ADMIN_NOT_CONFIGURED');
            error.status = 403;
            throw error;
        }
        const user = clean(username);
        const validUser = user.length === record.username.length
            && timingSafeEqual(Buffer.from(user, 'utf8'), Buffer.from(record.username, 'utf8'));
        const validPass = verifyPassword(String(password || '').trim(), record.credentials);
        if (!validUser || !validPass) {
            this.#recordFailure(clientKey);
            const error = new Error('INVALID_CREDENTIALS');
            error.status = 401;
            throw error;
        }
        this.failedAttempts.delete(clientKey);
        return this.#createSession(record.username);
    }

    validateSession(request) {
        const cookies = parseCookies(request.headers?.cookie);
        const sid = cookies.get('n3com_admin_sid');
        if (!sid) return null;
        const session = this.sessions.get(sid);
        if (!session) return null;
        if (Date.now() > session.expiresAt) {
            this.sessions.delete(sid);
            return null;
        }
        session.expiresAt = Date.now() + SESSION_TTL_MS;
        return session;
    }

    validateCsrf(request, session) {
        if (!session?.csrfToken) return false;
        const headerToken = String(request.headers?.['x-csrf-token'] || '');
        if (!headerToken || headerToken.length !== session.csrfToken.length) return false;
        return timingSafeEqual(Buffer.from(headerToken, 'utf8'), Buffer.from(session.csrfToken, 'utf8'));
    }

    logout(request) {
        const cookies = parseCookies(request.headers?.cookie);
        const sid = cookies.get('n3com_admin_sid');
        if (sid) this.sessions.delete(sid);
    }

    sessionCookieHeader(sessionId, clear = false) {
        if (clear) return 'n3com_admin_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
        return `n3com_admin_sid=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
    }

    #createSession(username) {
        const sid = randomBytes(32).toString('base64url');
        const csrfToken = randomBytes(32).toString('base64url');
        const session = {
            sid,
            username,
            csrfToken,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL_MS
        };
        this.sessions.set(sid, session);
        return session;
    }

    #assertNotRateLimited(clientKey) {
        const entry = this.failedAttempts.get(clientKey);
        if (!entry) return;
        if (Date.now() - entry.firstFailureAt > RATE_WINDOW_MS) {
            this.failedAttempts.delete(clientKey);
            return;
        }
        if (entry.count >= MAX_FAILED_ATTEMPTS) {
            const error = new Error('TOO_MANY_ATTEMPTS');
            error.status = 429;
            throw error;
        }
    }

    #recordFailure(clientKey) {
        const now = Date.now();
        const current = this.failedAttempts.get(clientKey);
        if (!current || now - current.firstFailureAt > RATE_WINDOW_MS) {
            this.failedAttempts.set(clientKey, { count: 1, firstFailureAt: now });
        } else {
            current.count += 1;
        }
    }

    async #readAdmin() {
        if (!existsSync(this.adminPath)) return null;
        try {
            const parsed = JSON.parse(await readFile(this.adminPath, 'utf8'));
            return parsed?.admin || null;
        } catch {
            return null;
        }
    }
}
