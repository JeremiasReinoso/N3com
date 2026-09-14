import { Navigation } from './core/navigation.js';
import { LicenciaRepo } from './data/licenseRepo.js';
import { initTorneosVer } from './views/tournamentsView.js';
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
    gate.innerHTML = `<section class="license-gate-card" aria-labelledby="license-title"><span class="calendar-chip">NEWCOM</span><p class="license-gate-product">Sistema de Torneos</p><h1 id="license-title">Activá tu licencia para comenzar</h1><p>Ingresá el código permanente entregado por administración para continuar.</p><form id="license-activation-form"><label for="license-code">Código de licencia</label><input id="license-code" name="codigo" autocomplete="off" autocapitalize="characters" placeholder="NWC-XXXX-XXXX-XXXX" required><p id="license-error" class="license-error" aria-live="polite">${message || ''}</p><button class="btn-primary" type="submit">Activar</button></form></section>`;
    document.body.append(gate);
    gate.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const error = gate.querySelector('#license-error'); const button = gate.querySelector('button');
        button.disabled = true; error.textContent = '';
        try { await LicenciaRepo.activar(new FormData(event.currentTarget).get('codigo')); location.reload(); }
        catch { error.textContent = 'El código de licencia no es válido o está deshabilitado.'; button.disabled = false; }
    });
};

document.addEventListener('DOMContentLoaded', async () => {
    let license;
    try { license = await LicenciaRepo.obtenerActiva(); } catch { showActivation('El código de licencia no es válido o está deshabilitado.'); return; }
    if (!license) { showActivation(); return; }

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
    const render = async buttonId => {
        try { await renderers[buttonId]?.(); }
        catch (error) { console.error(error); alert('No se pudo cargar esta sección. Revise los datos del torneo e intente nuevamente.'); }
    };
    Object.keys(renderers).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) button.addEventListener('click', () => { void render(buttonId); });
    });
    window.addEventListener('focus', () => {
        const active = document.querySelector('.nav-btn.active[id]');
        if (active) void render(active.id);
    });
    await render('btn-nav-torneos');
});
