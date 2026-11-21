// Servicio criptográfico de licencias firmadas v2 con Ed25519 (asimétrico).
// La clave privada vive exclusivamente en `private/license-signing.json` (modo 0600)
// y jamás se expone al navegador. Los tokens v2 (`NWC2-<payload>.<firma>`) pueden
// verificarse sin conexión con la clave pública sin permitir falsificación.

import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { resolve } from 'node:path';

const TOKEN_PREFIX = 'NWC2-';

const atomicWrite = async (filePath, payload) => {
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}`;
    await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tmpPath, filePath);
    try { await chmod(filePath, 0o600); } catch { /* sin POSIX chmod */ }
};

export const verifySignedLicenseToken = (token, publicKeyPem) => {
    const raw = String(token || '').trim();
    if (!raw.startsWith(TOKEN_PREFIX) || !publicKeyPem) return null;
    const body = raw.slice(TOKEN_PREFIX.length);
    const parts = body.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;
    try {
        const payloadBytes = Buffer.from(payloadB64, 'base64url');
        const sigBytes = Buffer.from(sigB64, 'base64url');
        const publicKey = createPublicKey(publicKeyPem);
        if (!verify(null, payloadBytes, publicKey, sigBytes)) return null;
        const parsed = JSON.parse(payloadBytes.toString('utf8'));
        if (parsed?.v !== 2 || !parsed.id || !Number.isInteger(parsed.credits) || parsed.credits < 1) return null;
        return {
            version: 2,
            id: String(parsed.id),
            tournamentsPurchased: parsed.credits,
            organization: String(parsed.org || ''),
            edition: String(parsed.edition || 'club'),
            issuedAt: parsed.iat || null,
            token: raw
        };
    } catch {
        return null;
    }
};

export class SignedLicenseService {
    constructor(privateDirectory) {
        this.privateDirectory = resolve(privateDirectory);
        this.keyPath = resolve(this.privateDirectory, 'license-signing.json');
        this.privateKeyPem = null;
        this.publicKeyPem = null;
    }

    async initialize() {
        await mkdir(this.privateDirectory, { recursive: true });
        if (existsSync(this.keyPath)) {
            const stored = JSON.parse(await readFile(this.keyPath, 'utf8'));
            if (stored?.privateKeyPem && stored?.publicKeyPem) {
                this.privateKeyPem = stored.privateKeyPem;
                this.publicKeyPem = stored.publicKeyPem;
                return;
            }
        }
        const { privateKey, publicKey } = generateKeyPairSync('ed25519');
        this.privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        this.publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
        await atomicWrite(this.keyPath, {
            algorithm: 'Ed25519',
            createdAt: new Date().toISOString(),
            publicKeyPem: this.publicKeyPem,
            privateKeyPem: this.privateKeyPem
        });
    }

    getPublicKeyPem() {
        return this.publicKeyPem;
    }

    issueToken({ id, tournamentsPurchased, organization = '', edition = 'club' }) {
        if (!this.privateKeyPem) throw new Error('SIGNING_KEY_NOT_READY');
        const payload = {
            v: 2,
            id: String(id),
            credits: Number(tournamentsPurchased),
            org: String(organization || '').slice(0, 120),
            edition: String(edition || 'club'),
            iat: new Date().toISOString()
        };
        const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
        const privateKey = createPrivateKey(this.privateKeyPem);
        const signature = sign(null, payloadBytes, privateKey);
        return `${TOKEN_PREFIX}${payloadBytes.toString('base64url')}.${signature.toString('base64url')}`;
    }

    verifyToken(token) {
        return verifySignedLicenseToken(token, this.publicKeyPem);
    }
}
