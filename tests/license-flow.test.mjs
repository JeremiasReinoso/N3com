import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4800 + Math.floor(Math.random() * 300);
const dataDir = await mkdtemp(join(tmpdir(), 'newcom-license-test-'));
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), NEWCOM_PRIVATE_DIR: dataDir }, stdio: 'ignore' });
const origin = `http://127.0.0.1:${port}`;
const nativeFetch = globalThis.fetch;

try {
    const indexMarkup = await readFile(join(root, 'index.html'), 'utf8');
    const mainSource = await readFile(join(root, 'js', 'main.js'), 'utf8');
    if (/admin\.html|Administración/i.test(indexMarkup)) throw new Error('El cliente todavía muestra un acceso al panel administrativo.');
    if (!mainSource.includes('Para utilizar NEWCOM necesitás activar tu licencia.')) throw new Error('La pantalla de activación no contiene el texto requerido.');
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try { if ((await nativeFetch(`${origin}/api/licenses`)).ok) break; } catch {}
        await new Promise(resolveWait => setTimeout(resolveWait, 50));
        if (attempt === 29) throw new Error('El servidor local no inició.');
    }
    if ((await nativeFetch(`${origin}/private/licenses.json`)).status !== 404) throw new Error('Los archivos privados quedaron expuestos por el servidor local.');
    globalThis.localStorage = {
        values: new Map(),
        getItem(key) { return this.values.get(key) || null; },
        setItem(key, value) { this.values.set(key, value); },
        removeItem(key) { this.values.delete(key); }
    };
    globalThis.fetch = (path, options) => nativeFetch(`${origin}${path}`, options);
    const { LicenciaRepo } = await import(`${pathToFileURL(resolve(root, 'js/data/licenseRepo.js')).href}?local-license-test=2`);

    const created = await LicenciaRepo.crear({ cliente: 'Club X', organization: 'Club X', email: 'club@example.test', phone: '1234', cupoTotal: 3 });
    if (created.id !== 'CLI-0001' || !/^NWC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(created.codigo) || created.disponibles !== 3 || !created.history.length) throw new Error('La licencia inicial no se creó con la estructura local requerida.');

    const stored = JSON.parse(await readFile(join(dataDir, 'licenses.json'), 'utf8')).licenses[0];
    const adminStore = JSON.parse(await readFile(join(dataDir, 'admin.json'), 'utf8'));
    if (stored.clientName !== 'Club X' || stored.tournamentsPurchased !== 3 || stored.tournamentsUsed !== 0 || stored.tournamentsRemaining !== 3 || !stored.active) throw new Error('licenses.json no conserva el modelo local plano.');
    if (adminStore.version !== '1.0') throw new Error('El almacenamiento administrativo local no fue inicializado.');

    const invalid = await nativeFetch(`${origin}/api/licenses/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'NWC-0000-0000-0000' }) });
    if (invalid.status !== 400 || (await invalid.json()).error !== 'El código de licencia no es válido o está deshabilitado.') throw new Error('La validación de códigos inválidos no devuelve el mensaje requerido.');

    const active = await LicenciaRepo.activar(`  ${created.codigo.toLowerCase()}  `);
    if (active.disponibles !== 3) throw new Error('La activación no mostró tres torneos disponibles.');
    const afterFirstTournament = await LicenciaRepo.consumirTorneo();
    if (afterFirstTournament.disponibles !== 2 || afterFirstTournament.cupo_utilizado !== 1) throw new Error('El primer torneo no actualizó el saldo de 3 a 2.');
    const reopened = await LicenciaRepo.obtenerActiva();
    if (!reopened || reopened.codigo !== created.codigo || reopened.disponibles !== 2) throw new Error('La activación local no persistió al volver a abrir NEWCOM.');
    const expanded = await LicenciaRepo.agregarTorneos(created.id, 5);
    if (expanded.codigo !== created.codigo || expanded.disponibles !== 7 || expanded.cupo_total !== 8) throw new Error('Agregar cinco torneos no conservó el código o el saldo de 2 a 7.');
    for (const remaining of [6, 5, 4, 3, 2, 1, 0]) {
        const consumed = await LicenciaRepo.consumirTorneo();
        if (consumed.disponibles !== remaining || consumed.cupo_utilizado !== 8 - remaining) throw new Error(`El consumo no actualizó el saldo a ${remaining}.`);
    }
    let blocked = false;
    try { await LicenciaRepo.consumirTorneo(); } catch (error) { blocked = error.message === 'No tenés torneos disponibles. Contactá al administrador para adquirir más.'; }
    if (!blocked) throw new Error('Se permitió crear un torneo sin créditos o se mostró un mensaje incorrecto.');

    const replenished = await LicenciaRepo.agregarTorneos(created.id, 5);
    if (replenished.codigo !== created.codigo || replenished.disponibles !== 5) throw new Error('Agregar cinco torneos desde cero no restauró el saldo ni conservó el código.');

    await LicenciaRepo.actualizar(created.id, { cliente: 'Club X', organizacion: 'Club X', email: 'club@example.test', telefono: '1234', activa: false });
    if (await LicenciaRepo.obtenerActiva()) throw new Error('Una licencia deshabilitada siguió activa en el cliente.');
    console.log('El flujo local de licencia activa, persiste 3→2, amplía 2→7, bloquea en cero y conserva el código.');
} finally {
    globalThis.fetch = nativeFetch;
    server.kill();
    await rm(dataDir, { recursive: true, force: true });
}
