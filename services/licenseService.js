import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const initialStore = () => ({ version: '1.0', lastUpdated: null, licenses: [] });
const codePattern = /^NWC-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/;
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
        if (!existsSync(this.adminPath)) await writeFile(this.adminPath, `${JSON.stringify({ version: '1.0', lastUpdated: null, admin: {} }, null, 2)}\n`, 'utf8');
    }

    async list() { return clone((await this.#read()).licenses); }

    async getByCode(code) {
        const requested = normalizeCode(code);
        if (!requested) return null;
        const license = (await this.#read()).licenses.find(item => item.code === requested);
        return license ? clone(license) : null;
    }

    async create({ clientName, organization = '', email = '', phone = '', tournamentsPurchased }) {
        const name = clean(clientName); const purchased = credits(tournamentsPurchased);
        if (!name) throw new Error('INVALID_CLIENT');
        return this.#mutate(data => {
            const now = new Date().toISOString();
            const license = {
                id: this.#nextId(data.licenses),
                code: this.#nextCode(data.licenses),
                clientName: name,
                organization: clean(organization),
                email: clean(email),
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
            const license = data.licenses.find(item => item.code === requested);
            if (!license || !license.active) throw new Error('LICENSE_INVALID');
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

    async update(id, { clientName, organization = '', email = '', phone = '', active }) {
        const name = clean(clientName);
        if (!name) throw new Error('INVALID_CLIENT');
        return this.#mutate(data => {
            const license = data.licenses.find(item => item.id === id);
            if (!license) throw new Error('LICENSE_NOT_FOUND');
            license.clientName = name;
            license.organization = clean(organization);
            license.email = clean(email);
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
        if (item.clientName !== undefined) return item;
        const now = item.license?.createdAt || new Date().toISOString();
        return {
            id: item.id,
            code: normalizeCode(item.code),
            clientName: clean(item.client?.name),
            organization: clean(item.client?.organization),
            email: clean(item.client?.email),
            phone: clean(item.client?.phone),
            tournamentsPurchased: Number(item.license?.tournamentsPurchased || 0),
            tournamentsUsed: Number(item.license?.tournamentsUsed || 0),
            tournamentsRemaining: Math.max(0, Number(item.license?.tournamentsRemaining || 0)),
            active: item.license?.active !== false,
            createdAt: now,
            activatedAt: item.license?.activatedAt || null,
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

    #nextCode(licenses) {
        let code;
        do {
            const groups = Array.from({ length: 3 }, () => randomBytes(3).toString('hex').toUpperCase().slice(0, 4));
            code = `NWC-${groups.join('-')}`;
        } while (!codePattern.test(code) || licenses.some(license => license.code === code));
        return code;
    }
}
