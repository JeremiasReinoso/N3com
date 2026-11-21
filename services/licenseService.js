import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createPortableLicenseCode, parsePortableLicenseCode } from '../js/core/portableLicense.js';
import { SignedLicenseService, verifySignedLicenseToken } from './signedLicenseService.js';

const initialStore = () => ({ version: '1.0', lastUpdated: null, licenses: [] });
const clean = value => String(value || '').trim();
const credits = value => {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new Error('INVALID_CREDITS');
    return amount;
};
const normalizeCode = code => clean(code).toUpperCase();
const isSignedV2 = value => clean(value).startsWith('NWC2-');
const clone = value => JSON.parse(JSON.stringify(value));
const atomicWriteJson = async (filePath, payload) => {
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}`;
    await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tmpPath, filePath);
    try { await chmod(filePath, 0o600); } catch { /* sin POSIX chmod */ }
};

// Única capa que conoce el formato de private/licenses.json. El servidor local
// sólo traduce HTTP; una API futura puede reemplazar este servicio por otro
// adaptador sin modificar admin.html ni el cliente.
export class LocalLicenseService {
    constructor(privateDirectory) {
        this.privateDirectory = resolve(privateDirectory);
        this.licensesPath = resolve(this.privateDirectory, 'licenses.json');
        this.adminPath = resolve(this.privateDirectory, 'admin.json');
        this.signingService = new SignedLicenseService(this.privateDirectory);
        this.queue = Promise.resolve();
    }

    async initialize() {
        await mkdir(this.privateDirectory, { recursive: true });
        await this.signingService.initialize();
        if (!existsSync(this.licensesPath)) await atomicWriteJson(this.licensesPath, initialStore());
        else {
            const data = await this.#read();
            await atomicWriteJson(this.licensesPath, data);
        }
        if (!existsSync(this.adminPath)) await atomicWriteJson(this.adminPath, { version: '1.0', lastUpdated: null, admin: {} });
    }

    getPublicKeyPem() {
        return this.signingService.getPublicKeyPem();
    }

    async list() { return clone((await this.#read()).licenses); }

    async getByCode(code) {
        const raw = clean(code);
        const requested = normalizeCode(code);
        if (!requested) return null;
        const license = (await this.#read()).licenses.find(item => item.code === requested || (item.signedToken && item.signedToken === raw));
        return license ? clone(license) : null;
    }

    async create({ clientName, organization = '', phone = '', tournamentsPurchased, edition = 'club' }) {
        const name = clean(clientName); const purchased = credits(tournamentsPurchased);
        if (!name) throw new Error('INVALID_CLIENT');
        const safeEdition = ['club', 'asociacion', 'federacion'].includes(clean(edition).toLowerCase()) ? clean(edition).toLowerCase() : 'club';
        return this.#mutate(data => {
            const now = new Date().toISOString();
            const id = this.#nextId(data.licenses);
            const signedToken = this.signingService.issueToken({
                id,
                tournamentsPurchased: purchased,
                organization: clean(organization),
                edition: safeEdition
            });
            const license = {
                id,
                code: this.#nextCode(data.licenses, purchased),
                signedToken,
                clientName: name,
                organization: clean(organization),
                phone: clean(phone),
                edition: safeEdition,
                tournamentsPurchased: purchased,
                tournamentsUsed: 0,
                tournamentsRemaining: purchased,
                active: true,
                createdAt: now,
                activatedAt: null,
                history: [{ at: now, type: 'LICENSE_CREATED', tournaments: purchased, edition: safeEdition }]
            };
            data.licenses.push(license);
            return license;
        });
    }

    async activate(code, externalPublicKeyPem = null) {
        const raw = clean(code);
        const requested = normalizeCode(code);
        return this.#mutate(data => {
            let license = data.licenses.find(item => item.code === requested || (item.signedToken && item.signedToken === raw));
            if (!license) {
                if (isSignedV2(raw)) {
                    const verified = externalPublicKeyPem
                        ? verifySignedLicenseToken(raw, externalPublicKeyPem)
                        : this.signingService.verifyToken(raw);
                    if (!verified) throw new Error('LICENSE_INVALID');
                    license = this.#signedLicenseV2(verified);
                    data.licenses.push(license);
                } else {
                    const portable = parsePortableLicenseCode(requested);
                    if (!portable) throw new Error('LICENSE_INVALID');
                    license = this.#portableLicense(portable);
                    data.licenses.push(license);
                }
            }
            if (!license.active) throw new Error('LICENSE_INVALID');
            if (!license.activatedAt) {
                license.activatedAt = new Date().toISOString();
                license.history.push({ at: license.activatedAt, type: 'LICENSE_ACTIVATED' });
            }
            return license;
        });
    }

    async consumeTournament(code) {
        const raw = clean(code);
        const requested = normalizeCode(code);
        return this.#mutate(data => {
            const license = data.licenses.find(item => item.code === requested || (item.signedToken && item.signedToken === raw));
            if (!license || !license.active || license.tournamentsRemaining < 1) throw new Error('NO_CREDITS');
            license.tournamentsUsed += 1;
            license.tournamentsRemaining -= 1;
            license.history.push({ at: new Date().toISOString(), type: 'TOURNAMENT_CONSUMED', tournaments: 1 });
            return license;
        });
    }

    async addTournaments(id, quantity) {
        const amount = credits(quantity);
        return this.#mutate(data => {
            const license = data.licenses.find(item => item.id === id);
            if (!license) throw new Error('LICENSE_NOT_FOUND');
            license.tournamentsPurchased += amount;
            license.tournamentsRemaining += amount;
            license.history.push({ at: new Date().toISOString(), type: 'CREDITS_ADDED', tournaments: amount });
            return license;
        });
    }

    async clear() {
        return this.#mutate(data => {
            const deleted = data.licenses.length;
            data.licenses = [];
            return { deleted };
        });
    }

    async remove(id) {
        return this.#mutate(data => {
            const index = data.licenses.findIndex(item => item.id === id);
            if (index < 0) throw new Error('LICENSE_NOT_FOUND');
            const [license] = data.licenses.splice(index, 1);
            return { id: license.id, code: license.code };
        });
    }

    async update(id, { clientName, organization = '', phone = '', active }) {
        const name = clean(clientName);
        if (!name) throw new Error('INVALID_CLIENT');
        return this.#mutate(data => {
            const license = data.licenses.find(item => item.id === id);
            if (!license) throw new Error('LICENSE_NOT_FOUND');
            license.clientName = name;
            license.organization = clean(organization);
            license.phone = clean(phone);
            license.active = Boolean(active);
            license.history.push({ at: new Date().toISOString(), type: 'LICENSE_UPDATED', active: license.active });
            return license;
        });
    }

    async #read() {
        const raw = JSON.parse(await readFile(this.licensesPath, 'utf8'));
        const data = raw && Array.isArray(raw.licenses) ? { version: '1.0', lastUpdated: raw.lastUpdated || null, licenses: raw.licenses } : initialStore();
        // Compatibilidad con la estructura anidada de la versión local previa.
        data.licenses = data.licenses.map(item => this.#normalizeLegacy(item));
        return data;
    }

    #normalizeLegacy(item) {
        const modern = item.clientName !== undefined;
        const source = modern ? item : item.license || {};
        const now = source.createdAt || new Date().toISOString();
        return {
            id: item.id,
            code: normalizeCode(item.code),
            signedToken: item.signedToken || null,
            clientName: clean(modern ? source.clientName : item.client?.name),
            organization: clean(modern ? source.organization : item.client?.organization),
            phone: clean(modern ? source.phone : item.client?.phone),
            edition: clean(item.edition || 'club') || 'club',
            tournamentsPurchased: Number(source.tournamentsPurchased || 0),
            tournamentsUsed: Number(source.tournamentsUsed || 0),
            tournamentsRemaining: Math.max(0, Number(source.tournamentsRemaining || 0)),
            active: source.active !== false,
            createdAt: now,
            activatedAt: source.activatedAt || null,
            history: Array.isArray(item.history) ? item.history : []
        };
    }

    #mutate(operation) {
        const next = this.queue.then(async () => {
            const data = await this.#read();
            const result = operation(data);
            data.lastUpdated = new Date().toISOString();
            await atomicWriteJson(this.licensesPath, data);
            return clone(result);
        });
        this.queue = next.catch(() => {});
        return next;
    }

    #nextId(licenses) {
        const max = Math.max(0, ...licenses.map(license => Number(String(license.id || '').replace(/^CLI-/, '')) || 0));
        return `CLI-${String(max + 1).padStart(4, '0')}`;
    }

    #nextCode(licenses, tournamentsPurchased) {
        return createPortableLicenseCode(this.#nextId(licenses), tournamentsPurchased);
    }

    #signedLicenseV2({ id, token, tournamentsPurchased, organization, edition }) {
        const now = new Date().toISOString();
        return {
            id,
            code: token,
            signedToken: token,
            clientName: organization || 'Licencia firmada Ed25519',
            organization: organization || '',
            phone: '',
            edition: edition || 'club',
            tournamentsPurchased,
            tournamentsUsed: 0,
            tournamentsRemaining: tournamentsPurchased,
            active: true,
            createdAt: now,
            activatedAt: null,
            history: [{ at: now, type: 'SIGNED_V2_LICENSE_IMPORTED', edition: edition || 'club' }]
        };
    }

    #portableLicense({ id, code, tournamentsPurchased }) {
        const now = new Date().toISOString();
        return {
            id,
            code,
            signedToken: null,
            clientName: 'Licencia portátil',
            organization: '',
            phone: '',
            edition: 'club',
            tournamentsPurchased,
            tournamentsUsed: 0,
            tournamentsRemaining: tournamentsPurchased,
            active: true,
            createdAt: now,
            activatedAt: null,
            history: [{ at: now, type: 'PORTABLE_LICENSE_IMPORTED' }]
        };
    }
}
