import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

const CATEGORY_GROUPS = {
    '+40': ['+40 Masculino', '+40 Femenino', '+40 Mixto'],
    '+50': ['+50 Masculino', '+50 Femenino', '+50 Mixto'],
    '+60': ['+60 Masculino', '+60 Femenino', '+60 Mixto'],
    '+68': ['+68 Masculino', '+68 Femenino', '+68 Mixto']
};
const CATEGORY_OPTIONS = Object.values(CATEGORY_GROUPS).flat();
const categoryTabs = (categories, activeId) => categories.map(category =>
    `<button type="button" class="btn-tab categoria-tab ${category.id === activeId ? 'active' : ''}" data-id="${category.id}">${category.nombre}</button>`).join('');

export const initEquiposView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-equipos');
    if (!tournamentId) {
        view.innerHTML = '<h2>Gestión de equipos</h2><div class="empty-state">Seleccione un torneo desde la sección Torneos para empezar.</div>';
        return;
    }
    const tournament = DataManager.getTournament(tournamentId);
    const categories = DataManager.getCategoriesByTournament(tournamentId);
    let categoryId = AppState.getCategory();
    if (!categories.some(category => category.id === categoryId)) {
        categoryId = categories[0]?.id || null;
        if (categoryId) AppState.setCategory(categoryId);
    }
    const category = categoryId ? DataManager.getCategory(categoryId) : null;
    const zones = categoryId ? DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId) : [];
    const teams = categoryId ? DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId) : [];
    const existingNames = new Set(categories.map(item => item.nombre.trim().toLocaleLowerCase('es')));
    const categoryPicker = Object.entries(CATEGORY_GROUPS).map(([age, names]) => `<section class="category-picker-group"><header><span>Edad</span><strong>${age}</strong></header><div>${names.map(name => {
        const exists = existingNames.has(name.toLocaleLowerCase('es'));
        const mode = name.replace(`${age} `, '');
        return `<button type="button" class="category-choice" data-category="${name}" ${exists ? 'disabled' : ''} aria-pressed="false"><b>${mode}</b><small>${exists ? 'Ya agregada' : `Categoría ${age}`}</small></button>`;
    }).join('')}</div></section>`).join('');
    const allCategoriesAdded = CATEGORY_OPTIONS.every(name => existingNames.has(name.toLocaleLowerCase('es')));
    view.innerHTML = `
        <h2>Equipos</h2>
        <section class="form-card panel-control">
            <div class="form-title"><div><h3>Nueva categoría</h3><p>Las categorías funcionan como subpáginas dentro de este torneo.</p></div><span class="calendar-chip">${tournament.nombre}</span></div>
            <form id="form-nueva-categoria" class="category-picker-form">
                <input id="categoria-nombre" type="hidden" required>
                <div class="category-picker" role="group" aria-label="Elegí una categoría">${categoryPicker}</div>
                <div class="category-picker-footer"><p class="helper-text">Elegí la edad y modalidad para crear su espacio de equipos, zonas y fixture.</p><button id="agregar-categoria" class="btn-primary" type="submit" disabled ${allCategoriesAdded ? 'disabled' : ''}>Agregar categoría</button></div>
            </form>
        </section>
        <section class="category-workspace">
            <div class="category-workspace-header"><div><h3>Categorías del torneo</h3><span>Cambie de categoría sin salir de la página principal.</span></div></div>
            <div class="tabs-container">${categories.length ? categoryTabs(categories, categoryId) : '<span class="helper-text">Aún no hay categorías.</span>'}</div>
        </section>
        ${category ? `<section class="form-card panel-control">
            <div class="category-page-header"><div><h3>${category.nombre}</h3><p class="helper-text">${teams.length} equipo${teams.length === 1 ? '' : 's'} registrado${teams.length === 1 ? '' : 's'}.</p></div></div>
            <form id="form-nuevo-equipo" class="form-grid">
                <label class="form-field">Nombre del equipo<input id="equipo-nombre" type="text" maxlength="70" required placeholder="Ej.: Los Cóndores"></label>
                <div class="form-actions"><button class="btn-primary" type="submit">Agregar equipo</button></div>
            </form>
        </section>
        <div class="grid-cards">${teams.length ? teams.map(team => {
            const zone = zones.find(item => item.id === team.zonaId);
            return `<article class="card"><span class="calendar-chip">${zone ? zone.nombre : 'SIN ZONA'}</span><h3>${team.nombre}</h3><p>${zone ? 'Listo para programar' : 'Asignalo a una zona para generar el fixture.'}</p></article>`;
        }).join('') : '<div class="empty-state">Esta categoría todavía no tiene equipos.</div>'}</div>` : ''}`;

    view.querySelector('#form-nueva-categoria').addEventListener('submit', event => {
        event.preventDefault();
        const name = view.querySelector('#categoria-nombre').value;
        if (!name) return;
        try {
            const created = DataManager.createCategory(name, tournamentId);
            AppState.setCategory(created.id);
            initEquiposView();
        } catch (error) { alert(error.message); }
    });
    view.querySelectorAll('.category-choice').forEach(choice => choice.addEventListener('click', () => {
        if (choice.disabled) return;
        view.querySelectorAll('.category-choice').forEach(item => {
            item.classList.toggle('selected', item === choice);
            item.setAttribute('aria-pressed', item === choice ? 'true' : 'false');
        });
        view.querySelector('#categoria-nombre').value = choice.dataset.category;
        view.querySelector('#agregar-categoria').disabled = false;
    }));
    view.querySelectorAll('.categoria-tab').forEach(tab => tab.addEventListener('click', () => {
        AppState.setCategory(tab.dataset.id);
        initEquiposView();
    }));
    view.querySelector('#form-nuevo-equipo')?.addEventListener('submit', event => {
        event.preventDefault();
        const name = view.querySelector('#equipo-nombre').value.trim();
        if (!name) return;
        DataManager.createTeam(name, categoryId, tournamentId);
        initEquiposView();
    });
};
