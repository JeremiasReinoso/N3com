import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { LicenciaRepo } from '../data/licenseRepo.js';
import { goToTournament } from '../core/tournamentRoute.js';

const formatLabel = mode => mode === 'points' ? 'Por puntos' : 'Por sets ganados';
const methodLabel = method => method === 'all_vs_all' ? 'Todos contra todos' : 'Método actual';

export const initTorneosVer = async () => {
    const view = document.getElementById('view-torneos');
    const license = await LicenciaRepo.obtenerActiva();
    if (!license) { location.reload(); return; }
    const tournaments = DataManager.getTournaments();
    view.innerHTML = `
        <div class="form-card panel-control">
            <div class="form-title"><div><h2>Mis torneos</h2><p>Creá un torneo y luego organizá sus categorías, equipos y fixture.</p></div><span class="calendar-chip">${license.disponibles} DISPONIBLES</span></div>
            <form id="form-nuevo-torneo" class="form-grid">
                <label class="form-field">Nombre del torneo<input id="torneo-nombre" type="text" required maxlength="70" placeholder="Ej.: Copa Primavera"></label>
                <label class="form-field">Partidos por equipo<input id="torneo-partidos" type="number" required min="1" value="3"></label>
                <fieldset class="classification-selector"><legend>Método de torneo</legend><label><input type="radio" name="tournament-method" value="standard" checked><span><strong>Método actual</strong><small>Conserva el flujo y las eliminatorias actuales.</small></span></label><label><input type="radio" name="tournament-method" value="all_vs_all"><span><strong>Todos contra todos</strong><small>Garantizados por zona, tabla general, cruces libres y semifinales.</small></span></label></fieldset>
                <fieldset class="classification-selector"><legend>Criterio de clasificación</legend><label><input type="radio" name="classification-mode" value="sets" checked><span><strong>Por sets ganados</strong><small>La tabla usa los puntos 3/2/1 existentes.</small></span></label><label><input type="radio" name="classification-mode" value="points"><span><strong>Por rendimiento</strong><small>La tabla usa partidos ganados, sets y puntos reales.</small></span></label></fieldset>
                <div class="form-actions"><button class="btn-primary" type="submit" ${license.disponibles < 1 ? 'disabled' : ''}>Crear torneo</button></div>
            </form>${license.disponibles < 1 ? '<div class="license-credit-warning"><p>No tenés torneos disponibles. Contactá al administrador para adquirir más.</p><button id="btn-renovar-licencia" type="button" class="btn-secondary">Renovar licencia</button></div>' : ''}
        </div>
        <div id="torneos-list" class="grid-cards">${tournaments.length ? tournaments.map(tournament => `
            <article class="card torneo-card">
                <span class="calendar-chip">TORNEO</span><h3>${tournament.nombre}</h3>
                <p>${methodLabel(tournament.method)} · ${tournament.partidos_asegurados} partidos por equipo · ${formatLabel(tournament.classificationMode)}</p>
                <button class="btn-primary seleccionar-torneo" data-id="${tournament.id}">Abrir torneo</button>
            </article>`).join('') : '<div class="empty-state">Todavía no hay torneos. Completá el formulario para crear el primero.</div>'}</div>`;

    view.querySelector('#form-nuevo-torneo').addEventListener('submit', async event => {
        event.preventDefault();
        const name = view.querySelector('#torneo-nombre').value.trim();
        const assured = Number(view.querySelector('#torneo-partidos').value);
        const classificationMode = new FormData(event.currentTarget).get('classification-mode');
        const method = new FormData(event.currentTarget).get('tournament-method');
        if (!name || !Number.isInteger(assured) || assured < 1) return alert('Ingrese un nombre y una cantidad válida de partidos.');
        const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
        try {
            await LicenciaRepo.consumirTorneo();
            DataManager.createTournament(name, assured, classificationMode, method);
            AppState.clear();
            await initTorneosVer();
        } catch (error) { alert(error.message); button.disabled = false; }
    });
    view.querySelector('#btn-renovar-licencia')?.addEventListener('click', () => {
        LicenciaRepo.cerrarActivacion();
        location.reload();
    });
    view.querySelectorAll('.seleccionar-torneo').forEach(button => button.addEventListener('click', () => {
        AppState.setTournament(button.dataset.id);
        const categories = DataManager.getCategoriesByTournament(button.dataset.id);
        if (categories.length) AppState.setCategory(categories[0].id);
        goToTournament(button.dataset.id);
    }));
};
