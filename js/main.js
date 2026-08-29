// js/main.js
import { Navigation } from './core/navigation.js';
import { initTorneosVer } from './views/tournamentsView.js';
import { initEquiposView } from './views/teamsView.js';
import { initZonasView } from './views/zonesView.js';
import { initCalendarView } from './views/calendarView.js';
import { initScheduleView } from './views/scheduleView.js';
import { initResultadosView } from './views/resultsView.js';
import { initStandingsView } from './views/standingsView.js';
import { initPlayoffsView } from './views/playoffsView.js';

document.addEventListener('DOMContentLoaded', () => {
    Navigation.init();
    const renderers = {
        'btn-nav-torneos': initTorneosVer,
        'btn-nav-equipos': initEquiposView,
        'btn-nav-zonas': initZonasView,
        'btn-nav-calendario': initCalendarView,
        'btn-nav-programacion': initScheduleView,
        'btn-nav-resultados': initResultadosView,
        'btn-nav-posiciones': initStandingsView,
        'btn-nav-eliminatorias': initPlayoffsView
    };
    const render = buttonId => {
        try { renderers[buttonId]?.(); }
        catch (error) {
            console.error(error);
            alert('No se pudo cargar esta sección. Actualice la página e intente nuevamente.');
        }
    };
    document.addEventListener('click', event => {
        const button = event.target.closest('button.nav-btn[id^="btn-nav-"]');
        if (button) render(button.id);
    });
    render('btn-nav-torneos');
});
