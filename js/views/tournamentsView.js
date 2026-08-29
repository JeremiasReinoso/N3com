import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

export const initTorneosVer = () => {
<<<<<<< Updated upstream
    const container = document.getElementById('torneos-list');
    const tournaments = DataManager.getTournaments();
    container.innerHTML = tournaments.length ? tournaments.map(tournament => `
        <article class="card torneo-card">
            <h3>${tournament.nombre}</h3>
            <p>${tournament.partidos_asegurados} partidos asegurados por equipo</p>
            <button class="btn-primary seleccionar-torneo" data-id="${tournament.id}">Seleccionar torneo</button>
        </article>`).join('') : '<p>No hay torneos creados todavía.</p>';

    container.querySelectorAll('.seleccionar-torneo').forEach(button => button.addEventListener('click', () => {
=======
    const view = document.getElementById('view-torneos');
    const tournaments = DataManager.getTournaments();
    view.innerHTML = `
        <div class="form-card panel-control">
            <div class="form-title"><div><h2>Mis torneos</h2><p>Creá un torneo y luego organizá sus categorías, equipos y fixture.</p></div></div>
            <form id="form-nuevo-torneo" class="form-grid">
                <label class="form-field">Nombre del torneo<input id="torneo-nombre" type="text" required maxlength="70" placeholder="Ej.: Copa Primavera"></label>
                <label class="form-field">Partidos por equipo<input id="torneo-partidos" type="number" required min="1" value="3"></label>
                <div class="form-actions"><button class="btn-primary" type="submit">Crear torneo</button></div>
            </form>
        </div>
        <div id="torneos-list" class="grid-cards">${tournaments.length ? tournaments.map(tournament => `
            <article class="card torneo-card">
                <span class="calendar-chip">TORNEO</span><h3>${tournament.nombre}</h3>
                <p>${tournament.partidos_asegurados} partidos por equipo</p>
                <button class="btn-primary seleccionar-torneo" data-id="${tournament.id}">Abrir torneo</button>
            </article>`).join('') : '<div class="empty-state">Todavía no hay torneos. Completá el formulario para crear el primero.</div>'}</div>`;

    view.querySelector('#form-nuevo-torneo').addEventListener('submit', event => {
        event.preventDefault();
        const name = view.querySelector('#torneo-nombre').value.trim();
        const assured = Number(view.querySelector('#torneo-partidos').value);
        if (!name || !Number.isInteger(assured) || assured < 1) return alert('Ingrese un nombre y una cantidad válida de partidos.');
        const tournament = DataManager.createTournament(name, assured);
        AppState.setTournament(tournament.id);
        initTorneosVer();
    });
    view.querySelectorAll('.seleccionar-torneo').forEach(button => button.addEventListener('click', () => {
>>>>>>> Stashed changes
        AppState.setTournament(button.dataset.id);
        const categories = DataManager.getCategoriesByTournament(button.dataset.id);
        if (categories.length) AppState.setCategory(categories[0].id);
        document.getElementById('btn-nav-equipos').click();
    }));
<<<<<<< Updated upstream

    const create = () => {
        const name = prompt('Nombre del torneo:');
        if (!name?.trim()) return;
        const assured = Number(prompt('Partidos asegurados por equipo:', '4'));
        if (!Number.isInteger(assured) || assured < 1) return alert('Ingrese un número entero mayor que cero.');
        const tournament = DataManager.createTournament(name, assured);
        AppState.setTournament(tournament.id);
        initTorneosVer();
    };
    const button = document.getElementById('btn-nuevo-torneo');
    button.replaceWith(button.cloneNode(true));
    document.getElementById('btn-nuevo-torneo').addEventListener('click', create);
=======
>>>>>>> Stashed changes
};
