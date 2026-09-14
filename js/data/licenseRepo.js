// Adaptador de licencias local. Cuando NEWCOM se inicia con server.js usa el
// archivo privado; en un sitio estático usa localStorage del mismo navegador.
// Cada ejecución escoge una sola fuente de verdad, sin servicios externos.
const ACTIVE_CODE_KEY = 'newcom_active_license_code_v1';
const BROWSER_STORE_KEY = 'newcom_local_licenses_v1';
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let backend = null;

const normalizeCode = code => String(code || '').trim().toUpperCase();
const clean = value => String(value || '').trim();
const credits = value => {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new Error('Ingrese una cantidad de torneos válida.');
    return amount;
};
const clone = value => JSON.parse(JSON.stringify(value));
const emptyStore = () => ({ version: '1.0', lastUpdated: null, licenses: [] });
const unavailable = () => Object.assign(new Error('LOCAL_SERVICE_UNAVAILABLE'), { code: 'LOCAL_SERVICE_UNAVAILABLE' });
const numberOrZero = value => Math.max(0, Number(value || 0));

const apiRequest = async (path, method = 'GET', payload) => {
    let response;
    try {
        response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    } catch { throw unavailable(); }
    const body = await response.json().catch(() => ({}));
    if ([404, 405, 501].includes(response.status)) throw unavailable();
    if (!response.ok) throw new Error(body.error || 'No se pudo actualizar la licencia.');
    return body;
};
const normalizeStoredLicense = item => {
    const legacy = item?.license || {};
    const purchased = numberOrZero(item?.tournamentsPurchased ?? legacy.tournamentsPurchased ?? item?.cupo_total);
    const used = numberOrZero(item?.tournamentsUsed ?? legacy.tournamentsUsed ?? item?.cupo_utilizado);
    const storedActive = item?.active ?? legacy.active ?? item?.activa;
    return {
        id: item?.id,
        code: normalizeCode(item?.code ?? item?.codigo),
        clientName: clean(item?.clientName ?? item?.client?.name ?? item?.cliente),
        organization: clean(item?.organization ?? item?.client?.organization ?? item?.organizacion),
        email: clean(item?.email ?? item?.client?.email),
        phone: clean(item?.phone ?? item?.client?.phone ?? item?.telefono),
        tournamentsPurchased: purchased,
        tournamentsUsed: used,
        tournamentsRemaining: numberOrZero(item?.tournamentsRemaining ?? legacy.tournamentsRemaining ?? item?.disponibles ?? (purchased - used)),
        active: storedActive !== false && storedActive !== 'false',
        createdAt: item?.createdAt ?? legacy.createdAt ?? item?.creado ?? new Date().toISOString(),
        activatedAt: item?.activatedAt ?? legacy.activatedAt ?? item?.activado ?? null,
        history: Array.isArray(item?.history) ? item.history : []
    };
};
const browserStore = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(BROWSER_STORE_KEY) || 'null');
        return stored && Array.isArray(stored.licenses) ? { ...stored, licenses: stored.licenses.map(normalizeStoredLicense) } : emptyStore();
    } catch { return emptyStore(); }
};
const saveBrowserStore = store => {
    store.lastUpdated = new Date().toISOString();
    localStorage.setItem(BROWSER_STORE_KEY, JSON.stringify(store));
};
const nextId = licenses => `CLI-${String(Math.max(0, ...licenses.map(license => Number(String(license.id || '').replace(/^CLI-/, '')) || 0)) + 1).padStart(4, '0')}`;
const randomGroup = () => {
    const bytes = new Uint8Array(4);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return [...bytes].map(byte => codeAlphabet[byte % codeAlphabet.length]).join('');
};
const nextCode = licenses => {
    let code;
    do { code = `NWC-${[randomGroup(), randomGroup(), randomGroup()].join('-')}`; }
    while (licenses.some(license => license.code === code));
    return code;
};
const browserOperation = operation => {
    const store = browserStore();
    const result = operation(store);
    saveBrowserStore(store);
    return clone(result);
};
const browserLicenses = () => clone(browserStore().licenses);
const requireLicense = value => {
    if (!value?.id || !value?.code) throw unavailable();
    return value;
};
const requireLicenseList = value => {
    if (!Array.isArray(value?.licenses)) throw unavailable();
    return value.licenses;
};
const useSource = async (remoteOperation, localOperation) => {
    if (backend === 'browser') return localOperation();
    try {
        const result = await remoteOperation();
        backend = 'server';
        return result;
    } catch (error) {
        if (error?.code !== 'LOCAL_SERVICE_UNAVAILABLE') throw error;
        backend = 'browser';
        return localOperation();
    }
};
const normalize = raw => raw && ({
    id: raw.id,
    codigo: normalizeCode(raw.code),
    cliente: clean(raw.clientName),
    organizacion: clean(raw.organization),
    email: clean(raw.email),
    telefono: clean(raw.phone),
    cupo_total: Number(raw.tournamentsPurchased || 0),
    cupo_utilizado: Number(raw.tournamentsUsed || 0),
    disponibles: Math.max(0, Number(raw.tournamentsRemaining || 0)),
    activa: Boolean(raw.active),
    creado: raw.createdAt || null,
    activado: raw.activatedAt || null,
    history: Array.isArray(raw.history) ? raw.history : []
});
const toClient = license => ({ name: license.cliente, organization: license.organizacion, email: license.email, phone: license.telefono });

const createBrowserLicense = ({ clientName, organization = '', email = '', phone = '', tournamentsPurchased }) => browserOperation(store => {
    const name = clean(clientName); const purchased = credits(tournamentsPurchased);
    if (!name) throw new Error('Ingrese el nombre del cliente.');
    const now = new Date().toISOString();
    const license = { id: nextId(store.licenses), code: nextCode(store.licenses), clientName: name, organization: clean(organization), email: clean(email), phone: clean(phone), tournamentsPurchased: purchased, tournamentsUsed: 0, tournamentsRemaining: purchased, active: true, createdAt: now, activatedAt: null, history: [{ at: now, type: 'LICENSE_CREATED', tournaments: purchased }] };
    store.licenses.push(license);
    return license;
});
const activateBrowserLicense = code => browserOperation(store => {
    const license = store.licenses.find(item => item.code === normalizeCode(code));
    if (!license || !license.active) throw new Error('El código de licencia no es válido o está deshabilitado.');
    if (!license.activatedAt) {
        license.activatedAt = new Date().toISOString();
        license.history.push({ at: license.activatedAt, type: 'LICENSE_ACTIVATED' });
    }
    return license;
});
const consumeBrowserLicense = code => browserOperation(store => {
    const license = store.licenses.find(item => item.code === normalizeCode(code));
    if (!license || !license.active || license.tournamentsRemaining < 1) throw new Error('No tenés torneos disponibles. Contactá al administrador para adquirir más.');
    license.tournamentsUsed += 1;
    license.tournamentsRemaining -= 1;
    license.history.push({ at: new Date().toISOString(), type: 'TOURNAMENT_CONSUMED', tournaments: 1 });
    return license;
});
const addBrowserTournaments = (id, amount) => browserOperation(store => {
    const license = store.licenses.find(item => item.id === id);
    if (!license) throw new Error('No se encontró la licencia seleccionada.');
    const quantity = credits(amount);
    license.tournamentsPurchased += quantity;
    license.tournamentsRemaining += quantity;
    license.history.push({ at: new Date().toISOString(), type: 'CREDITS_ADDED', tournaments: quantity });
    return license;
});
const updateBrowserLicense = (id, changes) => browserOperation(store => {
    const license = store.licenses.find(item => item.id === id);
    const name = clean(changes.clientName);
    if (!license) throw new Error('No se encontró la licencia seleccionada.');
    if (!name) throw new Error('Ingrese los datos del cliente.');
    license.clientName = name;
    license.organization = clean(changes.organization);
    license.email = clean(changes.email);
    license.phone = clean(changes.phone);
    license.active = Boolean(changes.active);
    license.history.push({ at: new Date().toISOString(), type: 'LICENSE_UPDATED', active: license.active });
    return license;
});

export const LicenciaRepo = {
    disponible: license => Math.max(0, Number(license.disponibles ?? (license.cupo_total - license.cupo_utilizado) ?? 0)),
    async obtenerTodas() {
        const licenses = await useSource(() => apiRequest('/api/licenses').then(requireLicenseList), browserLicenses);
        return licenses.map(normalize);
    },
    async obtenerPorCodigo(codigo) {
        const code = normalizeCode(codigo); if (!code) return null;
        return (await this.obtenerTodas()).find(license => license.codigo === code) || null;
    },
    async crear({ cliente, organization = '', email = '', phone = '', cupoTotal }) {
        if (!clean(cliente)) throw new Error('Ingrese el nombre del cliente.');
        const payload = { clientName: clean(cliente), organization, email, phone, tournamentsPurchased: credits(cupoTotal) };
        return normalize(await useSource(() => apiRequest('/api/licenses', 'POST', payload).then(requireLicense), () => createBrowserLicense(payload)));
    },
    async actualizar(id, changes) {
        if (!id || !clean(changes.cliente)) throw new Error('Ingrese los datos del cliente.');
        const payload = { clientName: clean(changes.cliente), organization: clean(changes.organizacion), email: clean(changes.email), phone: clean(changes.telefono), active: Boolean(changes.activa) };
        return normalize(await useSource(() => apiRequest(`/api/licenses/${encodeURIComponent(id)}`, 'PATCH', payload).then(requireLicense), () => updateBrowserLicense(id, payload)));
    },
    async agregarTorneos(id, cantidad) {
        const amount = credits(cantidad);
        return normalize(await useSource(() => apiRequest(`/api/licenses/${encodeURIComponent(id)}`, 'PATCH', { action: 'add-credits', amount }).then(requireLicense), () => addBrowserTournaments(id, amount)));
    },
    async activar(codigo) {
        const code = normalizeCode(codigo);
        const license = normalize(await useSource(() => apiRequest('/api/licenses/activate', 'POST', { code }).then(requireLicense), () => activateBrowserLicense(code)));
        localStorage.setItem(ACTIVE_CODE_KEY, license.codigo);
        return license;
    },
    async obtenerActiva() {
        const code = normalizeCode(localStorage.getItem(ACTIVE_CODE_KEY)); if (!code) return null;
        try { return await this.activar(code); }
        catch { localStorage.removeItem(ACTIVE_CODE_KEY); return null; }
    },
    cerrarActivacion() { localStorage.removeItem(ACTIVE_CODE_KEY); },
    async consumirTorneo() {
        const code = normalizeCode(localStorage.getItem(ACTIVE_CODE_KEY));
        if (!code) throw new Error('Activá una licencia válida para crear torneos.');
        return normalize(await useSource(() => apiRequest('/api/licenses/consume', 'POST', { code }).then(requireLicense), () => consumeBrowserLicense(code)));
    },
    aCliente: toClient
};
