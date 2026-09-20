import { Navigation } from './core/navigation.js';
import { AppState } from './core/state.js';
import { DataManager } from './data/dataManager.js';
import { goToTournament, goToTournamentList, readTournamentRoute } from './core/tournamentRoute.js';
import { initThemeToggle } from './core/theme.js';
import { renderCategoryWorkspace } from './core/categoryWorkspace.js';
import { LicenciaRepo } from './data/licenseRepo.js';
import { initTorneosVer } from './views/tournamentsView.js';
import { initTournamentHomeView } from './views/tournamentHomeView.js';
import { initEquiposView } from './views/teamsView.js';
import { initZonasView } from './views/zonesView.js';
import { initCalendarView } from './views/calendarView.js';
import { initScheduleView } from './views/scheduleView.js';
import { initResultadosView } from './views/resultsView.js';
import { initStandingsView } from './views/standingsView.js';
import { initPlayoffsView } from './views/playoffsView.js';

const showActivation = message => {
    document.querySelector('.app-header').hidden = true;
    document.getElementById('app-container').hidden = true;
    const gate = document.createElement('main');
    gate.className = 'license-gate';
    gate.innerHTML = `<section class="license-gate-card" aria-labelledby="license-title"><span class="calendar-chip">NEWCOM</span><p class="license-gate-product">Sistema de Torneos</p><h1 id="license-title">Para utilizar NEWCOM necesitás activar tu licencia.</h1><p>Ingresá el código permanente de tu licencia para continuar.</p><form id="license-activation-form"><label for="license-code">Código de licencia</label><input id="license-code" name="codigo" autocomplete="off" autocapitalize="characters" placeholder="NWC-XXXX-XXXX-XXXX" required><p id="license-error" class="license-error" aria-live="polite">${message || ''}</p><button class="btn-primary" type="submit">Activar</button></form></section>`;
    document.body.append(gate);
    gate.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const error = gate.querySelector('#license-error'); const button = gate.querySelector('button');
        button.disabled = true; error.textContent = '';
        try { await LicenciaRepo.activar(new FormData(event.currentTarget).get('codigo')); location.reload(); }
        catch { error.textContent = 'El código de licencia no es válido o está deshabilitado.'; button.disabled = false; }
    });
};

const showTournamentShell = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { return false; }
    const tournament = DataManager.getTournament(tournamentId);
    if (!tournament) return false;
    const nav = document.getElementById('main-nav');
    const header = document.querySelector('.app-header');
    if (nav) nav.hidden = false;
    header?.classList.add('tournament-open');
    return true;
};

const showTournamentList = () => {
    AppState.clear();
    const nav = document.getElementById('main-nav');
    const workspace = document.getElementById('category-workspace-nav');
    const header = document.querySelector('.app-header');
    if (nav) nav.hidden = true;
    if (workspace) { workspace.hidden = true; workspace.innerHTML = ''; }
    header?.classList.remove('tournament-open');
};

document.addEventListener('DOMContentLoaded', async () => {
    initThemeToggle();
    let license;
    try { license = await LicenciaRepo.obtenerActiva(); } catch { showActivation('El código de licencia no es válido o está deshabilitado.'); return; }
    if (!license) { showActivation(); return; }

    Navigation.init();
    const renderers = {
        'btn-nav-torneos': initTorneosVer,
        'btn-nav-inicio': initTournamentHomeView,
        'btn-nav-equipos': initEquiposView,
        'btn-nav-zonas': initZonasView,
        'btn-nav-calendario': initCalendarView,
        'btn-nav-programacion': initScheduleView,
        'btn-nav-resultados': initResultadosView,
        'btn-nav-posiciones': initStandingsView,
        'btn-nav-eliminatorias': initPlayoffsView
    };
    const renderRoute = async () => {
        try {
            const route = readTournamentRoute();
            if (route.type === 'home') {
                showTournamentList();
                Navigation.activate('btn-nav-torneos');
                await initTorneosVer();
                return;
            }
            let currentTournamentId;
            try { currentTournamentId = AppState.getTournament(); } catch { currentTournamentId = null; }
            if (currentTournamentId !== route.tournamentId) AppState.setTournament(route.tournamentId);
            const categories = DataManager.getCategoriesByTournament(route.tournamentId);
            if (categories.length && !categories.some(category => category.id === AppState.getCategory())) AppState.setCategory(categories[0].id);
            if (!showTournamentShell()) {
                goToTournamentList();
                return;
            }
            const buttonId = `btn-nav-${route.section}`;
            Navigation.activate(buttonId);
            renderCategoryWorkspace();
            await renderers[buttonId]?.();
            renderCategoryWorkspace();
        }
        catch (error) { console.error(error); alert('No se pudo cargar esta sección. Revise los datos del torneo e intente nuevamente.'); }
    };
    Object.keys(renderers).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.addEventListener('click', () => {
            if (buttonId === 'btn-nav-torneos') {
                if (!goToTournamentList()) void renderRoute();
                return;
            }
            let tournamentId;
            try { tournamentId = AppState.getTournament(); } catch { return; }
            if (!goToTournament(tournamentId, buttonId.replace('btn-nav-', ''))) void renderRoute();
        });
    });
    window.addEventListener('hashchange', () => { void renderRoute(); });
    window.addEventListener('focus', () => {
        void renderRoute();
    });
    await renderRoute();
});
