import { Navigation } from './core/navigation.js';
import { AppContext, AppState } from './core/state.js';
import { escapeHtml } from './core/escapeHtml.js';
import { DataManager } from './data/dataManager.js';
import { goToTournament, goToTournamentList, readTournamentRoute } from './core/tournamentRoute.js';
import { initThemeToggle } from './core/theme.js';
import { renderCategoryWorkspace, setCategoryChangeHandler } from './core/categoryWorkspace.js';
import { LicenciaRepo } from './data/licenseRepo.js';
import { initDropdownController } from './ui/dropdown.js';
import { showToast } from './ui/feedback.js';
import { initTorneosVer } from './views/tournamentsView.js';
import { initTournamentHomeView } from './views/tournamentHomeView.js';
import { initEquiposView } from './views/teamsView.js';
import { initZonasView } from './views/zonesView.js';
import { initCalendarView } from './views/calendarView.js';
import { initPlanningView } from './views/planningView.js';
import { initScheduleView } from './views/scheduleView.js';
import { initResultadosView } from './views/resultsView.js';
import { initStandingsView } from './views/standingsView.js';
import { initPlayoffsView } from './views/playoffsView.js';

const showActivation = message => {
    const shell = document.getElementById('app-shell');
    if (shell) shell.hidden = true;
    const header = document.querySelector('.app-header');
    if (header) header.hidden = true;
    const container = document.getElementById('app-container');
    if (container) container.hidden = true;
    const gate = document.createElement('main');
    gate.className = 'license-gate';
    gate.innerHTML = `<section class="license-gate-card" aria-labelledby="license-title"><span class="calendar-chip">N3com</span><p class="license-gate-product">Sistema de Torneos</p><h1 id="license-title">Para utilizar NEWCOM necesitás activar tu licencia.</h1><p>Ingresá el código permanente de tu licencia para continuar.</p><form id="license-activation-form"><label for="license-code">Código de licencia</label><input id="license-code" name="codigo" type="text" autocomplete="off" autocapitalize="characters" placeholder="NWC-XXXX-XXXX-XXXX" required><p id="license-error" class="license-error" aria-live="polite">${escapeHtml(message || '')}</p><button class="btn-primary" type="submit">Activar licencia</button></form></section>`;
    document.body.append(gate);
    gate.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const error = gate.querySelector('#license-error'); const button = gate.querySelector('button');
        button.disabled = true; error.textContent = '';
        try { await LicenciaRepo.activar(new FormData(event.currentTarget).get('codigo')); location.reload(); }
        catch { error.textContent = 'El código de licencia no es válido o está deshabilitado.'; button.disabled = false; }
    });
};

const enterTournamentList = () => {
    AppState.clear();
    const workspace = document.getElementById('category-workspace-nav');
    if (workspace) { workspace.hidden = true; workspace.innerHTML = ''; }
};

// Vistas puente para Exportaciones y Configuración (se desarrollan completas en Fase 4).
const initExportsBridgeView = () => {
    const view = document.getElementById('view-exportaciones');
    if (!view) return;
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">Centro documental</span>
                <h2>Exportaciones e informes</h2>
                <p>Descargá documentos oficiales de fixture, posiciones, resultados y respaldos de ${escapeHtml(tournament?.nombre || 'tu torneo')}.</p>
            </div>
        </div>
        <div class="grid-cards">
            <article class="card">
                <span class="calendar-chip">FIXTURE Y CANCHAS</span>
                <h3>Programación general</h3>
                <p>Exportá PDF por jornada, categoría o cancha, planilla Excel (.xlsx), CSV o imprimí directamente.</p>
                <div class="card-actions"><button type="button" class="btn-primary" data-jump-section="programacion">Abrir en Programación</button></div>
            </article>
            <article class="card">
                <span class="calendar-chip">TABLAS Y PODIO</span>
                <h3>Posiciones oficiales</h3>
                <p>Generá el reporte PDF o CSV de posiciones por zona, tabla general o clasificación definitiva.</p>
                <div class="card-actions"><button type="button" class="btn-secondary" data-jump-section="posiciones">Abrir en Posiciones</button></div>
            </article>
            <article class="card">
                <span class="calendar-chip">MARCADORES</span>
                <h3>Reporte de resultados</h3>
                <p>Exportá el detalle set por set y puntos acumulados en formato PDF o CSV.</p>
                <div class="card-actions"><button type="button" class="btn-secondary" data-jump-section="resultados">Abrir en Resultados</button></div>
            </article>
        </div>`;
    view.querySelectorAll('[data-jump-section]').forEach(btn => btn.addEventListener('click', () => {
        if (tournamentId) goToTournament(tournamentId, btn.dataset.jumpSection);
    }));
};

const initSettingsBridgeView = () => {
    const view = document.getElementById('view-configuracion');
    if (!view) return;
    // En Fase 2 delegamos directamente el calendario en su contenedor o damos acceso inmediato;
    // en Fase 4 se unifica el panel completo de Configuración.
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">Ajustes del torneo</span>
                <h2>Configuración — ${escapeHtml(tournament?.nombre || '')}</h2>
                <p>Administrá fechas, disponibilidad horaria, identidad del torneo y respaldos.</p>
            </div>
        </div>
        <div class="grid-cards">
            <article class="card">
                <span class="calendar-chip">DISPONIBILIDAD</span>
                <h3>Calendario y horarios</h3>
                <p>Configurá el período del torneo, duración de bloques, intervalos y horarios por jornada.</p>
                <div class="card-actions"><button type="button" class="btn-primary" id="btn-open-calendar-config">Configurar calendario</button></div>
            </article>
            <article class="card">
                <span class="calendar-chip">IDENTIDAD Y DATOS</span>
                <h3>Datos generales del torneo</h3>
                <p>Editá nombre, organización, marca para reportes PDF y respaldos desde el panel general.</p>
                <div class="card-actions"><button type="button" class="btn-secondary" id="btn-open-home-config">Editar datos del torneo</button></div>
            </article>
        </div>`;
    view.querySelector('#btn-open-calendar-config')?.addEventListener('click', () => {
        if (tournamentId) goToTournament(tournamentId, 'calendario');
    });
    view.querySelector('#btn-open-home-config')?.addEventListener('click', () => {
        if (tournamentId) goToTournament(tournamentId, 'inicio');
    });
};

document.addEventListener('DOMContentLoaded', async () => {
    initThemeToggle();
    initDropdownController();

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
        exportaciones: initExportsBridgeView,
        configuracion: initSettingsBridgeView
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
    document.getElementById('sidebar-back-tournaments')?.addEventListener('click', () => {
        navigateToTournamentList();
    });
    window.addEventListener('hashchange', () => { void renderRoute(); });
    await renderRoute();
});
