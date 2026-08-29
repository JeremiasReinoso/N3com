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
    // Inicializar navegación (cambia clases active y muestra/oculta vistas)
    Navigation.init();

    // Cargar la vista de Torneos por defecto
    initTorneosVer();

    // Asignar cada botón a su función de carga
    document.getElementById('btn-nav-torneos').addEventListener('click', initTorneosVer);
    document.getElementById('btn-nav-equipos').addEventListener('click', initEquiposView);
    document.getElementById('btn-nav-zonas').addEventListener('click', initZonasView);
    document.getElementById('btn-nav-calendario').addEventListener('click', initCalendarView);
    document.getElementById('btn-nav-programacion').addEventListener('click', initScheduleView);
    document.getElementById('btn-nav-resultados').addEventListener('click', initResultadosView);
    document.getElementById('btn-nav-posiciones').addEventListener('click', initStandingsView);
    
    const btnEliminatorias = document.getElementById('btn-nav-eliminatorias');
    if (btnEliminatorias) {
        btnEliminatorias.addEventListener('click', initPlayoffsView);
    }
});
