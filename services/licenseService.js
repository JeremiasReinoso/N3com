import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPortableLicenseCode, parsePortableLicenseCode } from '../js/core/portableLicense.js';

const initialStore = () => ({ version: '1.0', lastUpdated: null, licenses: [] });
const clean = value => String(value || '').trim();
const credits = value => {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new Error('INVALID_CREDITS');
    return amount;
};
const normalizeCode = code => clean(code).toUpperCase();
const clone = value => JSON.parse(JSON.stringify(value));

// Única capa que conoce el formato de private/licenses.json. El servidor local
// sólo traduce HTTP; una API futura puede reemplazar este servicio por otro
// adaptador sin modificar admin.html ni el cliente.
export class LocalLicenseService {
    constructor(privateDirectory) {
        this.privateDirectory = resolve(privateDirectory);
        this.licensesPath = resolve(this.privateDirectory, 'licenses.json');
        this.adminPath = resolve(this.privateDirectory, 'admin.json');
        this.queue = Promise.resolve();
    }

    async initialize() {
        await mkdir(this.privateDirectory, { recursive: true });
        if (!existsSync(this.licensesPath)) await writeFile(this.licensesPath, `${JSON.stringify(initialStore(), null, 2)}\n`, 'utf8');
        else {
            const data = await this.#read();
            await writeFile(this.licensesPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        }
        if (!existsSync(this.adminPath)) await writeFile(this.adminPath, `${JSON.stringify({ version: '1.0', lastUpdated: null, admin: {} }, null, 2)}\n`, 'utf8');
    }

    async list() { return clone((await this.#read()).licenses); }

    async getByCode(code) {
        const requested = normalizeCode(code);
        if (!requested) return null;
        const license = (await this.#read()).licenses.find(item => item.code === requested);
        return license ? clone(license) : null;
    }

    async create({ clientName, organization = '', phone = '', tournamentsPurchased }) {
        const name = clean(clientName); const purchased = credits(tournamentsPurchased);
        if (!name) throw new Error('INVALID_CLIENT');
        return this.#mutate(data => {
            const now = new Date().toISOString();
            const license = {
                id: this.#nextId(data.licenses),
                code: this.#nextCode(data.licenses, purchased),
                clientName: name,
                organization: clean(organization),
                phone: clean(phone),
                tournamentsPurchased: purchased,
                tournamentsUsed: 0,
                tournamentsRemaining: purchased,
                active: true,
                createdAt: now,
                activatedAt: null,
                history: [{ at: now, type: 'LICENSE_CREATED', tournaments: purchased }]
            };
            data.licenses.push(license);
            return license;
        });
    }

    async activate(code) {
        const requested = normalizeCode(code);
        return this.#mutate(data => {
            let license = data.licenses.find(item => item.code === requested);
            if (!license) {
                const portable = parsePortableLicenseCode(requested);
                if (!portable) throw new Error('LICENSE_INVALID');
                license = this.#portableLicense(portable);
                data.licenses.push(license);
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
        const requested = normalizeCode(code);
        return this.#mutate(data => {
            const license = data.licenses.find(item => item.code === requested);
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
            clientName: clean(modern ? source.clientName : item.client?.name),
            organization: clean(modern ? source.organization : item.client?.organization),
            phone: clean(modern ? source.phone : item.client?.phone),
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
            await writeFile(this.licensesPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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

    #portableLicense({ id, code, tournamentsPurchased }) {
        const now = new Date().toISOString();
        return {
            id,
            code,
            clientName: 'Licencia portátil',
            organization: '',
            phone: '',
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
