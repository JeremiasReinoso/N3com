// Adaptador local de licencias. La UI sólo conoce este contrato; una futura
// API puede reemplazar apiRequest sin alterar activación ni torneos.
const ACTIVE_CODE_KEY = 'newcom_active_license_code_v1';
const normalizeCode = code => String(code || '').trim().toUpperCase();
const credits = value => { const amount = Number(value); if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new Error('Ingrese una cantidad de torneos válida.'); return amount; };
const apiRequest = async (path, method = 'GET', payload) => {
    let response;
    try {
        response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    } catch { throw new Error('No se pudo acceder al servicio local de licencias. Inicie NEWCOM con el servidor local.'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'No se pudo actualizar la licencia.');
    return body;
};
const normalize = raw => raw && ({
    id: raw.id,
    codigo: normalizeCode(raw.code),
    cliente: String(raw.clientName || '').trim(),
    organizacion: String(raw.organization || '').trim(),
    email: String(raw.email || '').trim(),
    telefono: String(raw.phone || '').trim(),
    cupo_total: Number(raw.tournamentsPurchased || 0),
    cupo_utilizado: Number(raw.tournamentsUsed || 0),
    disponibles: Math.max(0, Number(raw.tournamentsRemaining || 0)),
    activa: Boolean(raw.active),
    creado: raw.createdAt || null,
    activado: raw.activatedAt || null,
    history: Array.isArray(raw.history) ? raw.history : []
});
const toClient = license => ({ name: license.cliente, organization: license.organizacion, email: license.email, phone: license.telefono });

export const LicenciaRepo = {
    disponible: license => Math.max(0, Number(license.disponibles ?? (license.cupo_total - license.cupo_utilizado) ?? 0)),
    async obtenerTodas() {
        const data = await apiRequest('/api/licenses');
        return (data.licenses || []).map(normalize);
    },
    async obtenerPorCodigo(codigo) {
        const code = normalizeCode(codigo); if (!code) return null;
        const licenses = await this.obtenerTodas(); return licenses.find(license => license.codigo === code) || null;
    },
    async crear({ cliente, organization = '', email = '', phone = '', cupoTotal }) {
        if (!String(cliente || '').trim()) throw new Error('Ingrese el nombre del cliente.');
        return normalize(await apiRequest('/api/licenses', 'POST', { clientName: String(cliente).trim(), organization, email, phone, tournamentsPurchased: credits(cupoTotal) }));
    },
    async actualizar(id, changes) {
        if (!id || !String(changes.cliente || '').trim()) throw new Error('Ingrese los datos del cliente.');
        return normalize(await apiRequest(`/api/licenses/${encodeURIComponent(id)}`, 'PATCH', { clientName: String(changes.cliente).trim(), organization: String(changes.organizacion || '').trim(), email: String(changes.email || '').trim(), phone: String(changes.telefono || '').trim(), active: Boolean(changes.activa) }));
    },
    async agregarTorneos(id, cantidad) {
        return normalize(await apiRequest(`/api/licenses/${encodeURIComponent(id)}`, 'PATCH', { action: 'add-credits', amount: credits(cantidad) }));
    },
    async activar(codigo) {
        const license = normalize(await apiRequest('/api/licenses/activate', 'POST', { code: normalizeCode(codigo) }));
        localStorage.setItem(ACTIVE_CODE_KEY, license.codigo); return license;
    },
    async obtenerActiva() {
        const code = normalizeCode(localStorage.getItem(ACTIVE_CODE_KEY)); if (!code) return null;
        try { return normalize(await apiRequest('/api/licenses/activate', 'POST', { code })); }
        catch { localStorage.removeItem(ACTIVE_CODE_KEY); return null; }
    },
    cerrarActivacion() { localStorage.removeItem(ACTIVE_CODE_KEY); },
    async consumirTorneo() {
        const code = normalizeCode(localStorage.getItem(ACTIVE_CODE_KEY));
        if (!code) throw new Error('Activá una licencia válida para crear torneos.');
        return normalize(await apiRequest('/api/licenses/consume', 'POST', { code }));
    },
    aCliente: toClient
};
