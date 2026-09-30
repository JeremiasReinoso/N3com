// Verificación de escritorio (Electron) de la vista Programación y Fixture.
// Se ejecuta con el binario de Electron de Windows:
//   electron tests/smoke/app
// No forma parte de `npm test`; sirve para comprobar la interfaz real
// (filtros, vistas, exportación, responsive y hoja de impresión).
import { app, BrowserWindow } from 'electron';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

const checks = [];
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) });
const consoleEntries = [];
const downloads = [];
const pageProblems = [];
const mark = message => console.error(`[smoke] ${message}`);

// Cualquier falla fuera del flujo principal termina el proceso con código de error.
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error); app.exit(1); });

// En esta máquina la inicialización de GPU bloquea el arranque y el `await`
// a nivel de módulo sobre `whenReady()` nunca se resuelve: se corre sin
// aceleración por hardware y el flujo se lanza desde `then`.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
mark('proceso iniciado');

const main = async () => {
    mark('app ready');
    const { startLocalServer } = await import(pathToFileURL(resolve(root, 'server.js')).href);
    const server = await startLocalServer({ port: 0, privateDirectory: resolve(app.getPath('temp'), 'n3com-smoke-private') });
    mark(`servidor en ${server.url}`);

    const window = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    window.webContents.on('console-message', (...args) => {
        const detail = args[1];
        const entry = detail && typeof detail === 'object'
            ? { level: Number(detail.level) || 0, message: String(detail.message || '') }
            : { level: Number(detail) || 0, message: String(args[2] ?? '') };
        consoleEntries.push(entry);
        if (entry.level >= 3) pageProblems.push(`consola: ${entry.message}`);
    });
    window.webContents.on('render-process-gone', (event, details) => pageProblems.push(`proceso: ${details.reason}`));
    window.webContents.session.on('will-download', (event, item) => { downloads.push(item.getFilename()); item.cancel(); });

    const evaluate = source => window.webContents.executeJavaScript(source, true);
    const reload = async () => {
        const loaded = new Promise(resolveLoad => window.webContents.once('did-finish-load', resolveLoad));
        window.webContents.reload();
        await loaded;
        await delay(350);
    };
    const layoutState = () => evaluate(`(() => {
        const card = document.querySelector('#fixture-list .fixture-match');
        const head = document.querySelector('.fixture-table-head');
        const tracks = value => String(value || '').split(/\\s+/).filter(Boolean).length;
        return card ? { columns: tracks(getComputedStyle(card).gridTemplateColumns), head: getComputedStyle(head).display } : null;
    })()`);
    const printState = () => evaluate(`(() => {
        const display = selector => getComputedStyle(document.querySelector(selector)).display;
        const card = document.querySelector('#fixture-list .fixture-match');
        return {
            filters: display('.fixture-filters'),
            config: display('.schedule-global-config'),
            exportActions: display('.fixture-export-actions'),
            editor: display('.schedule-editor'),
            head: display('.fixture-table-head'),
            columns: String(getComputedStyle(card).gridTemplateColumns).split(/\\s+/).filter(Boolean).length
        };
    })()`);

    let report = null;
    let removed = null;
    let credits = null;
    try {
        mark('cargando la aplicación');
        await window.loadURL(`${server.url}/index.html`);
        mark('aplicación cargada');
        await delay(700);

        const licenseCode = await evaluate(`(async () => {
            localStorage.clear();
            const { LicenciaRepo } = await import('/js/data/licenseRepo.js');
            const license = await LicenciaRepo.crear({ cliente: 'Cliente Smoke', cupoTotal: 5 });
            await LicenciaRepo.activar(license.codigo);
            return license.codigo;
        })()`);
        mark(`licencia: ${licenseCode}`);
        check('se creó y activó una licencia de prueba', Boolean(licenseCode));

        await reload();
        mark('recarga con licencia');

        report = await evaluate(await readFile(resolve(here, 'probe.js'), 'utf8'));
        mark('sonda de interfaz terminada');
        window.setSize(700, 900);
        await delay(550);
        const narrow = await layoutState();
        window.setSize(1440, 960);
        await delay(550);
        const wide = await layoutState();
        mark('mediciones de ancho listas');

        const debug = window.webContents.debugger;
        let print = null;
        try {
            await debug.attach('1.3');
            await debug.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
            await delay(250);
            print = await printState();
        } catch (error) { pageProblems.push(`print: ${error.message}`); }
        finally { try { await debug.sendCommand('Emulation.setEmulatedMedia', { media: '' }); debug.detach(); } catch { /* sin debugger */ } }

        mark('eliminando el torneo de la prueba');
        removed = await evaluate(await readFile(resolve(here, 'probe-delete.js'), 'utf8'));
        mark('verificando créditos de licencia');
        credits = await evaluate(await readFile(resolve(here, 'probe-credits.js'), 'utf8'));

        const initial = report?.initial || {};
        const paired = report?.afterPairing || {};
        const confirmed = report?.afterConfirm || {};
        const programmed = report?.afterProgram || {};
        const alerts = report?.alerts || [];

        check('la vista Programación se activa', initial.viewActive);
        check('hay un control de descanso por categoría', initial.restInputs === 2);
        check('las canchas globales se listan', initial.courts === 2);
        check('sin partidos el fixture informa que no hay borradores', initial.drafts === 0);
        check('los emparejamientos generan borradores', paired.drafts > 0);
        check('al confirmar los borradores pasan al fixture', confirmed.cards > 0);
        check('el panel de conflictos se dibuja cuando faltan datos', confirmed.conflictGroups > 0 && /\d+ ALERTA/.test(confirmed.statusChip || ''));
        check('las alertas de conflictos nombran el problema', /sin día|sin horario|sin cancha/i.test(confirmed.conflictSample || ''));
        check('programar informa cuántos partidos se ubicaron', alerts.some(message => /partido\(s\) programado\(s\)/.test(message)));
        check('programar no informa partidos sin lugar', !alerts.some(message => /No se encontró un horario disponible/.test(message)));
        check('todos los partidos programados tienen hora', programmed.cards > 0 && programmed.withTime === programmed.cards);
        check('todos los partidos programados tienen cancha', programmed.withCourt === programmed.cards);
        check('sin conflictos el estado queda en LISTO', programmed.statusChip === 'LISTO');
        check('el filtro por día muestra sólo esa jornada', report.filterDay > 0 && report.filterOtherDay === 0);
        check('los filtros día y cancha se combinan', report.filterDayCourt > 0 && report.filterDayCourt <= report.filterDay);
        check('limpiar filtros restaura todos los partidos', report.filterCleared === programmed.cards);
        check('la vista por cancha agrupa bajo encabezados de cancha', report.courtView.headers.length > 0 && report.courtView.headers.every(label => label === 'CANCHA'));
        check('la vista por día agrupa bajo encabezados de jornada', report.dayHeaders.every(label => label === 'JORNADA'));
        check('el descanso por categoría se guarda en el torneo', report.restSaved.length === 2 && report.restSaved.every(item => Number(item.value) === 1));
        check('exportar el día sin filtro avisa en lugar de fallar', /Seleccioná un día/.test(report.dayExportWithoutDate || ''));
        check('la exportación completa entrega un PDF al navegador', downloads.some(name => /^fixture-.*\.pdf$/.test(name)));
        check('el ancho reducido pasa a tarjetas y oculta la cabecera', Boolean(narrow && narrow.columns === 2 && narrow.head === 'none'));
        check('en ancho normal la tabla mantiene sus seis columnas', Boolean(wide && wide.columns === 6 && wide.head === 'grid'));
        if (print) {
            check('la impresión oculta filtros, configuración y exportación', print.filters === 'none' && print.config === 'none' && print.exportActions === 'none' && print.editor === 'none');
            check('la impresión muestra la cabecera de la tabla', print.head === 'grid');
            check('la impresión conserva las seis columnas', print.columns === 6);
        } else {
            check('la hoja de impresión pudo emularse', false);
        }
        check('la página no registra errores', (report.errors || []).length === 0 && (removed.errors || []).length === 0 && pageProblems.length === 0);
        check('la lista de torneos ofrece eliminar', removed.listBefore === 1 && removed.removeLabel === 'Eliminar');
        check('eliminar el torneo vacía la lista y el almacenamiento', removed.listAfter === 0 && removed.tournamentsLeft === 0);
        check('al no quedar torneos se muestra el estado vacío', /Todavía no hay torneos/.test(removed.emptyMessage || ''));
        check('con un crédito disponible se habilita crear torneo', credits.beforeCreate.remaining === 1 && credits.beforeCreate.createDisabled === false && credits.beforeCreate.warning === 0 && /^1 DISPONIBLES$/.test(credits.beforeCreate.chip));
        check('crear el torneo desde el formulario consume el crédito', credits.afterCreate.remaining === 0 && credits.afterCreate.cards === 1 && credits.afterCreate.tournaments.length === 1 && /^0 DISPONIBLES$/.test(credits.afterCreate.chip));
        check('sin créditos aparece el aviso y se bloquea el alta', credits.afterCreate.warning === 1 && credits.afterCreate.createDisabled === true && /No tenés torneos disponibles/.test(credits.afterCreate.warningText || ''));
        check('eliminar el torneo vacía la lista sin devolver el crédito', credits.afterDelete.cards === 0 && credits.afterDelete.tournaments === 0 && credits.afterDelete.remaining === 0);
        check('el aviso de licencia permanece tras eliminar', credits.afterDelete.warning === 1 && /Todavía no hay torneos/.test(credits.afterDelete.empty || ''));
        check('la verificación de créditos no registra errores', (credits.errors || []).length === 0 && !credits.alerts.some(message => /alert:/.test(message)));
        check('la consola no registra errores', consoleEntries.filter(entry => entry.level >= 3).length === 0);
    } catch (error) {
        checks.push({ label: `ejecución del smoke: ${error.message}`, ok: false });
    } finally {
        console.log(JSON.stringify({ checks, report, removed, credits, downloads, pageProblems, consoleErrors: consoleEntries.filter(entry => entry.level >= 3) }, null, 2));
        app.exit(checks.every(item => item.ok) ? 0 : 1);
    }
};

setTimeout(() => { mark('timeout general'); app.exit(2); }, 180000);
app.whenReady().then(main, error => { console.error(error); app.exit(1); });
