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
        try {
            renderers[buttonId]?.();
        }
        catch (error) {
            console.error(error);
            alert('No se pudo cargar esta sección. Revise los datos del torneo e intente nuevamente.');
        }
    };

    Object.keys(renderers).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) button.addEventListener('click', () => render(buttonId));
    });

    render('btn-nav-torneos');
});
