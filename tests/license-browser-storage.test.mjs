import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const originalFetch = globalThis.fetch;
globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, String(value)); },
    removeItem(key) { this.values.delete(key); }
};
// Algunos hostings estáticos responden su HTML principal con estado 200 para
// una ruta inexistente. El adaptador debe reconocer que eso no es una API.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

try {
    const { LicenciaRepo } = await import(`${pathToFileURL(resolve(root, 'js/data/licenseRepo.js')).href}?browser-storage-test=1`);
    const created = await LicenciaRepo.crear({ cliente: 'Prueba', organization: 'Club', email: '', phone: '', cupoTotal: 3 });
    if (!/^NWC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(created.codigo) || created.disponibles !== 3) throw new Error('La licencia no se creó en el almacenamiento local del navegador.');
    const listed = await LicenciaRepo.obtenerTodas();
    if (listed.length !== 1 || listed[0].codigo !== created.codigo) throw new Error('El listado no leyó la licencia persistida en el navegador.');
    const activated = await LicenciaRepo.activar(`  ${created.codigo.toLowerCase()} `);
    if (activated.disponibles !== 3) throw new Error('La licencia local no se activó correctamente.');
    const consumed = await LicenciaRepo.consumirTorneo();
    if (consumed.disponibles !== 2 || consumed.cupo_utilizado !== 1) throw new Error('El consumo local no actualizó los créditos.');
    const expanded = await LicenciaRepo.agregarTorneos(created.id, 5);
    if (expanded.codigo !== created.codigo || expanded.disponibles !== 7) throw new Error('Agregar torneos no conservó la licencia local.');

    // Compatibilidad con datos locales producidos por versiones anteriores.
    localStorage.setItem('newcom_local_licenses_v1', JSON.stringify({ licenses: [{ id: 'CLI-0099', code: 'NWC-U3GC-CRTY-BAMJ', client: { name: 'Jeremias' }, license: { tournamentsPurchased: 4, tournamentsUsed: 0, tournamentsRemaining: 4, active: true, createdAt: '2026-01-01T00:00:00.000Z' } }] }));
    const { LicenciaRepo: LegacyRepo } = await import(`${pathToFileURL(resolve(root, 'js/data/licenseRepo.js')).href}?browser-storage-test=legacy`);
    const legacyLicense = await LegacyRepo.activar(' nwc-u3gc-crty-bamj ');
    if (legacyLicense.codigo !== 'NWC-U3GC-CRTY-BAMJ' || legacyLicense.disponibles !== 4 || !legacyLicense.activa) throw new Error('No se pudo validar una licencia local creada por una versión anterior.');
    console.log('La administración funciona también como sitio estático con almacenamiento local del navegador.');
} finally {
    globalThis.fetch = originalFetch;
}
