import { Navigation } from './core/navigation.js';
import { AppContext, AppState } from './core/state.js';
import { escapeHtml } from './core/escapeHtml.js';
import { DataManager } from './data/dataManager.js';
import { goToTournament, goToTournamentList, readTournamentRoute } from './core/tournamentRoute.js';
import { renderCategoryWorkspace, setCategoryChangeHandler } from './core/categoryWorkspace.js';
import { LicenciaRepo } from './data/licenseRepo.js';
import { initDropdownController } from './ui/dropdown.js';
import { openModal, showToast } from './ui/feedback.js';
import { LogisticsService, fixtureCompare } from './services/logistics.js';
import { downloadFixturePdf, downloadFixtureCsv, downloadFixtureSpreadsheet, fixtureRows } from './services/fixturePdf.js';
import { downloadStandingsPdf, downloadStandingsCsv, downloadResultsPdf, downloadResultsCsv } from './services/reportsExport.js';
import { CompetitionEngine } from './engine/index.js';
import { formatLabelFor } from './views/formatConfigurator.js';
import { initTorneosVer } from './views/tournamentsView.js';
import { initTournamentHomeView } from './views/tournamentHomeView.js';
import { initEquiposView } from './views/teamsView.js';
import { initZonasView } from './views/zonesView.js';
import { initCalendarView } from './views/calendarView.js';
import { initPlanningView } from './views/planningView.js';
import { initScheduleView, PHASE_LABELS } from './views/scheduleView.js';
import { initResultadosView } from './views/resultsView.js';
import { initStandingsView } from './views/standingsView.js';
import { initPlayoffsView } from './views/playoffsView.js';

const LAST_BACKUP_UI_KEY = 'n3com_last_backup_at';

// Enmascara códigos de licencia para no exponer claves completas en pantalla (ej.: NWC-PAAB-····).
const maskLicenseCode = rawCode => {
    const clean = String(rawCode || '').trim().toUpperCase();
    if (!clean) return 'NWC-····';
    const parts = clean.split('-').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}-${parts[1]}-····`;
    return `${clean.slice(0, Math.min(8, clean.length))}-····`;
};

const downloadJsonFile = (filename, payload) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// TODO: El modelo de datos persistente (DataManager) no guarda un campo de fecha del último respaldo en la base.
// Se consulta únicamente si hubo una descarga registrada en el almacenamiento local de la interfaz; si no existe, se informa explícitamente sin inventar una fecha.
const formatLastBackupLabel = () => {
    try {
        const raw = localStorage.getItem(LAST_BACKUP_UI_KEY);
        if (!raw) return 'Sin respaldos descargados todavía';
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return 'Sin respaldos descargados todavía';
        const now = new Date();
        const sameDay = dt.toDateString() === now.toDateString();
        const time = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        if (sameDay) return `Último respaldo: hoy, ${time}`;
        const day = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `Último respaldo: ${day}, ${time}`;
    } catch {
        return 'Sin respaldos descargados todavía';
    }
};

const recordBackupTimestamp = () => {
    try { localStorage.setItem(LAST_BACKUP_UI_KEY, new Date().toISOString()); } catch { /* opcional */ }
};

const categoryParts = category => {
    const name = category?.nombre || 'Sin categoría';
    const age = category?.edad || name.match(/\+\s*\d+/)?.[0]?.replace(/\s/g, '') || name;
    const modality = category?.modalidad || name.match(/femenino|masculino|mixto/i)?.[0] || '';
    return { age, modality: modality ? modality[0].toUpperCase() + modality.slice(1).toLowerCase() : '', name };
};

const showActivation = message => {
    const shell = document.getElementById('app-shell');
    if (shell) shell.hidden = true;
    const header = document.querySelector('.app-header');
    if (header) header.hidden = true;
    const container = document.getElementById('app-container');
    if (container) container.hidden = true;
    const gate = document.createElement('main');
    gate.className = 'license-gate';
    gate.innerHTML = `
        <div class="gate-top-brand n3-brand">
            <span class="n3-brand-mark" aria-hidden="true">N</span>
            <span class="n3-brand-text">
                <span class="n3-brand-name">N3com</span>
                <span class="n3-brand-sub">TORNEOS</span>
            </span>
        </div>
        <section class="license-gate-card" aria-labelledby="license-title">
            <h1 id="license-title">Para utilizar NEWCOM necesitás activar tu licencia.</h1>
            <p>Ingresá el código permanente de tu licencia para continuar.</p>
            <form id="license-activation-form">
                <div class="license-gate-field">
                    <label for="license-code">Código de licencia</label>
                    <input id="license-code" name="codigo" type="password" autocomplete="off" placeholder="NWC-····-····-····" required>
                </div>
                <p id="license-error" class="license-error" aria-live="polite">${escapeHtml(message || '')}</p>
                <button class="btn-primary license-gate-submit" type="submit">Activar licencia</button>
            </form>
        </section>`;
    document.body.append(gate);
    gate.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const error = gate.querySelector('#license-error');
        const button = gate.querySelector('button');
        button.disabled = true;
        error.textContent = '';
        try {
            await LicenciaRepo.activar(new FormData(event.currentTarget).get('codigo'));
            location.reload();
        } catch {
            error.textContent = 'El código de licencia no es válido o está deshabilitado.';
            button.disabled = false;
        }
    });
};

const enterTournamentList = () => {
    AppState.clear();
    const workspace = document.getElementById('category-workspace-nav');
    if (workspace) { workspace.hidden = true; workspace.innerHTML = ''; }
};

// PANTALLA 10 — EXPORTACIONES E INFORMES
const initExportsView = () => {
    const view = document.getElementById('view-exportaciones');
    if (!view) return;
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    if (!tournament) {
        view.innerHTML = '<div class="empty-state"><strong>Elegí un torneo</strong><p>Seleccioná un torneo desde Mis torneos para descargar sus informes.</p></div>';
        return;
    }

    const categories = DataManager.getCategoriesByTournament(tournamentId);
    const activeCatId = AppState.getCategory() || categories[0]?.id || null;
    const activeCategory = categories.find(item => item.id === activeCatId) || categories[0] || null;

    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">CENTRO DOCUMENTAL</span>
                <h2>Exportaciones e informes</h2>
                <p>Documentos oficiales del ${escapeHtml(tournament.nombre)}.</p>
            </div>
        </div>
        <div class="exports-grid">
            <article class="export-card">
                <span class="chip-pill chip-blue">FIXTURE Y CANCHAS</span>
                <h3>Programación general</h3>
                <p>Exportá PDF por jornada, categoría o cancha, planilla Excel, CSV o imprimí directamente.</p>
                <div class="export-card-actions">
                    <button type="button" id="exp-fixture-pdf" class="btn-primary">PDF</button>
                    <button type="button" id="exp-fixture-xlsx" class="btn-secondary">Excel</button>
                    <button type="button" id="exp-fixture-csv" class="btn-secondary">CSV</button>
                </div>
            </article>
            <article class="export-card">
                <span class="chip-pill chip-amber">TABLAS Y PODIO</span>
                <h3>Posiciones oficiales</h3>
                <p>Reporte PDF o CSV de posiciones por zona, tabla general o clasificación definitiva.</p>
                <div class="export-card-actions">
                    <button type="button" id="exp-standings-pdf" class="btn-primary">PDF</button>
                    <button type="button" id="exp-standings-csv" class="btn-secondary">CSV</button>
                </div>
            </article>
            <article class="export-card">
                <span class="chip-pill chip-green">MARCADORES</span>
                <h3>Reporte de resultados</h3>
                <p>Detalle set por set y puntos acumulados, en PDF o CSV.</p>
                <div class="export-card-actions">
                    <button type="button" id="exp-results-pdf" class="btn-primary">PDF</button>
                    <button type="button" id="exp-results-csv" class="btn-secondary">CSV</button>
                </div>
            </article>
        </div>`;

    const buildOfficialFixtureRows = () => {
        const isOfficial = match => match.confirmado || ['pendiente', 'programado', 'confirmado', 'en_juego', 'finalizado'].includes(match.estado);
        let official;
        try { official = LogisticsService.getGeneralFixture(tournamentId).filter(isOfficial); }
        catch { official = LogisticsService.getTournamentMatches(tournamentId).filter(isOfficial).sort(fixtureCompare); }
        const allTeams = categories.flatMap(cat => DataManager.getTeamsByTournamentAndCategory(tournamentId, cat.id));
        const allZones = categories.flatMap(cat => DataManager.getZonesByTournamentAndCategory(tournamentId, cat.id));
        return fixtureRows({
            matches: official,
            categories: categories.map(item => ({
                ...item,
                categoryAge: categoryParts(item).age,
                modality: categoryParts(item).modality,
                edad: categoryParts(item).age,
                modalidad: categoryParts(item).modality
            })),
            teams: allTeams,
            zones: allZones,
            phaseLabels: PHASE_LABELS,
            filters: {}
        });
    };

    const buildStandingsPayload = () => {
        if (!activeCategory) return null;
        const { config } = CompetitionEngine.getCategoryFormat(tournamentId, activeCategory.id);
        const standingsData = CompetitionEngine.getStandings(tournamentId, activeCategory.id);
        const sections = [];
        if (standingsData.finalClassification) {
            sections.push({ title: 'Clasificación final', note: formatLabelFor(config), rows: standingsData.finalClassification });
        }
        if (standingsData.finalGroup) {
            sections.push({ title: 'Zona Final', rows: standingsData.finalGroup });
        }
        if (standingsData.byZone.length > 1) {
            standingsData.byZone.forEach(({ zone, standings }) => sections.push({ title: `Posiciones — ${zone.nombre}`, rows: standings }));
        }
        if (!standingsData.finalClassification || standingsData.byZone.length <= 1) {
            sections.push({ title: 'Clasificación general', rows: standingsData.general });
        }
        return { category: activeCategory, formatLabel: formatLabelFor(config), sections, showPointsColumn: true };
    };

    const buildResultsPayload = () => {
        if (!activeCategory) return null;
        const { config } = CompetitionEngine.getCategoryFormat(tournamentId, activeCategory.id);
        const isOfficial = match => match.confirmado || ['pendiente', 'programado', 'confirmado', 'en_juego', 'finalizado'].includes(match.estado);
        const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, activeCategory.id).filter(isOfficial);
        const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, activeCategory.id);
        const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, activeCategory.id);
        return { category: activeCategory, formatLabel: formatLabelFor(config), matches, teams, zones, phaseLabels: PHASE_LABELS };
    };

    view.querySelector('#exp-fixture-pdf')?.addEventListener('click', () => {
        downloadFixturePdf(tournament, buildOfficialFixtureRows(), 'completo', 'TODAS LAS JORNADAS DEL TORNEO', {});
    });
    view.querySelector('#exp-fixture-xlsx')?.addEventListener('click', () => {
        const courts = DataManager.getTournamentCourts(tournamentId);
        downloadFixtureSpreadsheet(tournament, buildOfficialFixtureRows(), courts, {});
    });
    view.querySelector('#exp-fixture-csv')?.addEventListener('click', () => {
        downloadFixtureCsv(tournament, buildOfficialFixtureRows(), 'completo');
    });

    view.querySelector('#exp-standings-pdf')?.addEventListener('click', () => {
        const payload = buildStandingsPayload();
        if (!payload) { showToast('Creá al menos una categoría para exportar posiciones.', { type: 'warning' }); return; }
        downloadStandingsPdf({ tournament, ...payload });
    });
    view.querySelector('#exp-standings-csv')?.addEventListener('click', () => {
        const payload = buildStandingsPayload();
        if (!payload) { showToast('Creá al menos una categoría para exportar posiciones.', { type: 'warning' }); return; }
        downloadStandingsCsv({ tournament, ...payload });
    });

    view.querySelector('#exp-results-pdf')?.addEventListener('click', () => {
        const payload = buildResultsPayload();
        if (!payload) { showToast('Creá al menos una categoría para exportar resultados.', { type: 'warning' }); return; }
        downloadResultsPdf({ tournament, ...payload });
    });
    view.querySelector('#exp-results-csv')?.addEventListener('click', () => {
        const payload = buildResultsPayload();
        if (!payload) { showToast('Creá al menos una categoría para exportar resultados.', { type: 'warning' }); return; }
        downloadResultsCsv({ tournament, ...payload });
    });
};

// PANTALLA 11 — CONFIGURACIÓN
const initSettingsView = () => {
    const view = document.getElementById('view-configuracion');
    if (!view) return;
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    if (!tournament) {
        view.innerHTML = '<div class="empty-state"><strong>Elegí un torneo</strong><p>Seleccioná un torneo desde Mis torneos para editar su configuración.</p></div>';
        return;
    }

    const period = DataManager.getTournamentPeriod(tournamentId);
    const fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';
    const periodText = period?.startDate && period?.endDate
        ? `${fmtDate(period.startDate)} → ${fmtDate(period.endDate)}`
        : 'Sin fechas definidas';

    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">AJUSTES DEL TORNEO</span>
                <h2>Configuración</h2>
                <p>Fechas, horarios, identidad del torneo y respaldos.</p>
            </div>
        </div>

        <div class="settings-grid-two">
            <article class="settings-card">
                <span class="page-eyebrow">DISPONIBILIDAD</span>
                <h3>Calendario y horarios</h3>
                <p>Período del torneo, duración de bloques, intervalos y horarios por jornada.</p>
                <label class="form-field">Período
                    <input type="text" value="${escapeHtml(periodText)}" readonly aria-readonly="true">
                </label>
                <button type="button" class="btn-primary btn-block" id="btn-open-calendar-config">Configurar calendario</button>
            </article>

            <article class="settings-card">
                <span class="page-eyebrow">IDENTIDAD Y DATOS</span>
                <h3>Datos generales del torneo</h3>
                <p>Nombre, organización y marca para reportes PDF y respaldos.</p>
                <label class="form-field">Organización
                    <input type="text" id="cfg-org-preview" value="${escapeHtml(tournament.organizacion || '')}" placeholder="Ej.: Club Los Pioneros · S. C. de Bariloche" maxlength="90">
                </label>
                <button type="button" class="btn-secondary btn-block" id="btn-edit-tournament-data">Editar datos del torneo</button>
            </article>
        </div>

        <section class="backups-banner-card" aria-label="Respaldos del torneo">
            <div>
                <h3>Respaldos</h3>
                <p id="cfg-last-backup-label">${escapeHtml(formatLastBackupLabel())}</p>
            </div>
            <button type="button" class="btn-secondary" id="btn-download-tournament-backup">Descargar respaldo</button>
        </section>`;

    view.querySelector('#btn-open-calendar-config')?.addEventListener('click', () => {
        goToTournament(tournamentId, 'calendario');
    });

    view.querySelector('#btn-edit-tournament-data')?.addEventListener('click', () => {
        const currentOrg = view.querySelector('#cfg-org-preview')?.value.trim() ?? (tournament.organizacion || '');
        openModal({
            title: 'Editar datos del torneo',
            subtitle: 'Actualizá el nombre, la organización y la marca para encabezados PDF.',
            bodyHtml: `
                <form id="form-edit-tournament-modal" class="format-config-form">
                    <label class="form-field">Nombre del torneo
                        <input id="edit-t-nombre" type="text" required maxlength="70" value="${escapeHtml(tournament.nombre)}">
                    </label>
                    <label class="form-field">Organización / Sede
                        <input id="edit-t-org" type="text" maxlength="90" value="${escapeHtml(currentOrg)}" placeholder="Ej.: Club Los Pioneros · S. C. de Bariloche">
                    </label>
                    <label class="form-field">Marca en reportes PDF (opcional)
                        <input id="edit-t-brand" type="text" maxlength="70" value="${escapeHtml(tournament.branding?.brandName || '')}" placeholder="Dejá vacío para usar la organización">
                    </label>
                    <label class="form-field">Partidos garantizados base
                        <input id="edit-t-assured" type="number" min="1" max="20" required value="${Number(tournament.partidos_asegurados || 3)}">
                    </label>
                    <div class="form-actions" style="justify-content:flex-end;margin-top:6px;">
                        <button type="submit" class="btn-primary">Guardar cambios</button>
                    </div>
                </form>`,
            onMount: (dialog, close) => {
                dialog.querySelector('#form-edit-tournament-modal')?.addEventListener('submit', event => {
                    event.preventDefault();
                    try {
                        const nombre = dialog.querySelector('#edit-t-nombre').value.trim();
                        const organizacion = dialog.querySelector('#edit-t-org').value.trim();
                        const brandName = dialog.querySelector('#edit-t-brand').value.trim();
                        const partidos_asegurados = Number(dialog.querySelector('#edit-t-assured').value);
                        const updated = DataManager.updateTournament(tournamentId, {
                            nombre,
                            organizacion,
                            partidos_asegurados,
                            branding: brandName ? { brandName, accentColor: tournament.branding?.accentColor || '' } : null
                        });
                        const sideName = document.querySelector('.sidebar-tournament-name');
                        if (sideName) sideName.textContent = updated.nombre;
                        close();
                        showToast('Datos del torneo actualizados.', { type: 'success' });
                        initSettingsView();
                    } catch (error) {
                        showToast(error.message, { type: 'error' });
                    }
                });
            }
        });
    });

    view.querySelector('#btn-download-tournament-backup')?.addEventListener('click', () => {
        try {
            const snapshot = DataManager.exportBackupSnapshot(tournamentId);
            recordBackupTimestamp();
            downloadJsonFile(`n3com-respaldo-${new Date().toISOString().slice(0, 10)}.json`, snapshot);
            const label = view.querySelector('#cfg-last-backup-label');
            if (label) label.textContent = formatLastBackupLabel();
            showToast('Respaldo descargado correctamente.', { type: 'success' });
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });
};

const bindListSidebarModals = () => {
    const closeMobileIfOpen = () => {
        document.querySelector('.app-header')?.classList.remove('is-mobile-open');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.hidden = true;
    };

    document.getElementById('btn-list-torneos')?.addEventListener('click', () => {
        closeMobileIfOpen();
        goToTournamentList();
    });

    document.getElementById('btn-list-licencias')?.addEventListener('click', async () => {
        closeMobileIfOpen();
        const active = await LicenciaRepo.obtenerActiva();
        if (!active) return;
        const available = LicenciaRepo.disponible(active);
        openModal({
            title: 'Tu licencia activa',
            subtitle: 'Resumen de club y cupos habilitados en este equipo.',
            bodyHtml: `
                <div class="license-card" style="padding:18px;">
                    <div class="license-card-head">
                        <span class="chip-pill ${active.activa ? 'chip-green' : 'chip-amber'}">${active.activa ? 'Activa' : 'Deshabilitada'}</span>
                        <span class="license-masked-code">${escapeHtml(maskLicenseCode(active.codigo))}</span>
                    </div>
                    <div class="license-card-title-block">
                        <h3>${escapeHtml(active.cliente || 'Cliente activo')}</h3>
                        <p>${escapeHtml(active.organizacion || 'Organización registrada')}</p>
                    </div>
                    <dl class="license-balance">
                        <div><dt>Comprados</dt><dd>${Number(active.cupo_total || 0)}</dd></div>
                        <div><dt>Usados</dt><dd>${Number(active.cupo_utilizado || 0)}</dd></div>
                        <div><dt>Disponibles</dt><dd class="${available > 0 ? 'is-available' : ''}">${available}</dd></div>
                    </dl>
                    <div class="form-actions" style="justify-content:flex-end;">
                        <button type="button" id="modal-change-license" class="btn-secondary">Cambiar licencia</button>
                    </div>
                </div>`,
            onMount: dialog => {
                dialog.querySelector('#modal-change-license')?.addEventListener('click', () => {
                    LicenciaRepo.cerrarActivacion();
                    location.reload();
                });
            }
        });
    });

    document.getElementById('btn-list-ajustes')?.addEventListener('click', () => {
        closeMobileIfOpen();
        const tournamentsCount = DataManager.getTournaments().length;
        openModal({
            title: 'Ajustes y respaldos',
            subtitle: 'Exportá o restaurá una copia de seguridad completa de tus torneos (.json).',
            bodyHtml: `
                <div class="backups-banner-card" style="padding:16px;">
                    <div>
                        <h3>Copia de seguridad general</h3>
                        <p>${escapeHtml(formatLastBackupLabel())}</p>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="modal-export-backup" class="btn-primary" ${tournamentsCount ? '' : 'disabled'}>Descargar respaldo</button>
                        <label class="btn-secondary backup-import-label" style="margin:0;">
                            <span>Importar JSON</span>
                            <input id="modal-import-backup" type="file" accept="application/json,.json" hidden>
                        </label>
                    </div>
                </div>`,
            onMount: (dialog, close) => {
                dialog.querySelector('#modal-export-backup')?.addEventListener('click', () => {
                    const snapshot = DataManager.exportBackupSnapshot();
                    recordBackupTimestamp();
                    downloadJsonFile(`n3com-respaldo-${new Date().toISOString().slice(0, 10)}.json`, snapshot);
                    showToast('Respaldo general descargado.', { type: 'success' });
                    close();
                });
                dialog.querySelector('#modal-import-backup')?.addEventListener('change', async event => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const result = DataManager.importBackupSnapshot(text, { mode: 'merge' });
                        showToast(`Importación completada: ${result.importedTournaments} torneo(s) agregado(s).`, { type: 'success' });
                        close();
                        await initTorneosVer();
                    } catch (error) {
                        showToast(error.message || 'No se pudo importar el archivo.', { type: 'error' });
                    }
                });
            }
        });
    });
};

document.addEventListener('DOMContentLoaded', async () => {
    initDropdownController();
    bindListSidebarModals();

    let license;
    try { license = await LicenciaRepo.obtenerActiva(); } catch { showActivation('El código de licencia no es válido o está deshabilitado.'); return; }
    if (!license) { showActivation(); return; }

    const renderers = {
        inicio: initTournamentHomeView,
        equipos: initEquiposView,
        zonas: initZonasView,
        calendario: initCalendarView,
        planificacion: initPlanningView,
        programacion: initScheduleView,
        resultados: initResultadosView,
        posiciones: initStandingsView,
        eliminatorias: initPlayoffsView,
        exportaciones: initExportsView,
        configuracion: initSettingsView
    };
    const renderRoute = async () => {
        try {
            const route = readTournamentRoute();
            if (route.context === AppContext.TOURNAMENT_LIST) {
                enterTournamentList();
                Navigation.render({ context: AppContext.TOURNAMENT_LIST });
                Navigation.activateView('view-torneos');
                await initTorneosVer();
                return;
            }
            const tournament = DataManager.getTournament(route.tournamentId);
            if (!tournament) {
                if (!goToTournamentList()) {
                    enterTournamentList();
                    Navigation.render({ context: AppContext.TOURNAMENT_LIST });
                    Navigation.activateView('view-torneos');
                    await initTorneosVer();
                }
                return;
            }
            let currentTournamentId;
            try { currentTournamentId = AppState.getTournament(); } catch { currentTournamentId = null; }
            if (currentTournamentId !== route.tournamentId) AppState.setTournament(route.tournamentId);
            const categories = DataManager.getCategoriesByTournament(route.tournamentId);
            if (categories.length && !categories.some(category => category.id === AppState.getCategory())) AppState.setCategory(categories[0].id);
            Navigation.render({
                context: AppContext.TOURNAMENT,
                section: route.section,
                tournamentName: tournament.nombre,
                onSectionChange: section => {
                    const tournamentId = AppState.getTournament();
                    if (!goToTournament(tournamentId, section)) void renderRoute();
                }
            });
            Navigation.activateView(`view-${route.section}`);
            renderCategoryWorkspace({ section: route.section });
            await renderers[route.section]?.();
            renderCategoryWorkspace({ section: route.section });
        }
        catch (error) {
            console.error(error);
            showToast('No se pudo cargar esta sección. Revisá los datos del torneo e intentá nuevamente.', { type: 'error' });
        }
    };

    setCategoryChangeHandler(() => {
        void renderRoute();
    });

    const navigateToTournamentList = () => {
        if (!goToTournamentList()) void renderRoute();
    };
    document.getElementById('newcom-home')?.addEventListener('click', event => {
        event.preventDefault();
        navigateToTournamentList();
    });
    document.getElementById('sidebar-back-tournaments')?.addEventListener('click', event => {
        event.preventDefault();
        navigateToTournamentList();
    });
    window.addEventListener('hashchange', () => { void renderRoute(); });
    await renderRoute();
});
