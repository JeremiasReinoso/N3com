import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { renderCategoryWorkspace } from '../core/categoryWorkspace.js';
import { CompetitionEngine } from '../engine/index.js';
import { formatLabelFor, mountCategoryFormatConfigurator } from './formatConfigurator.js';

const CATEGORY_GROUPS = {
    '+40': ['+40 Masculino', '+40 Femenino', '+40 Mixto'],
    '+50': ['+50 Masculino', '+50 Femenino', '+50 Mixto'],
    '+60': ['+60 Masculino', '+60 Femenino', '+60 Mixto'],
    '+68': ['+68 Masculino', '+68 Femenino', '+68 Mixto']
};
const CATEGORY_OPTIONS = Object.values(CATEGORY_GROUPS).flat();
const categoryTabs = (categories, activeId) => categories.map(category =>
    `<button type="button" class="btn-tab categoria-tab ${category.id === activeId ? 'active' : ''}" data-id="${escapeHtml(category.id)}">${escapeHtml(category.nombre)}</button>`).join('');

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
    const activeFormat = categoryId ? CompetitionEngine.getCategoryFormat(tournamentId, categoryId) : null;
    const existingNames = new Set(categories.map(item => item.nombre.trim().toLocaleLowerCase('es')));
    const categoryPicker = Object.entries(CATEGORY_GROUPS).map(([age, names]) => `<section class="category-picker-group"><header><span>Edad</span><strong>${age}</strong></header><div>${names.map(name => {
        const exists = existingNames.has(name.toLocaleLowerCase('es'));
        const mode = name.replace(`${age} `, '');
        return `<button type="button" class="category-choice" data-category="${name}" ${exists ? 'disabled' : ''} aria-pressed="false"><b>${mode}</b><small>${exists ? 'Ya agregada' : `Categoría ${age}`}</small></button>`;
    }).join('')}</div></section>`).join('');
    const allCategoriesAdded = CATEGORY_OPTIONS.every(name => existingNames.has(name.toLocaleLowerCase('es')));
    view.innerHTML = `
        <h2>Equipos y Categorías</h2>
        <section class="form-card panel-control">
            <div class="form-title"><div><h3>Nueva categoría</h3><p>Elegí categorías estándar de Newcom o creá una categoría personalizada.</p></div><span class="calendar-chip">${escapeHtml(tournament.nombre)}</span></div>
            <form id="form-nueva-categoria" class="category-picker-form">
                <div class="category-picker" role="group" aria-label="Elegí una categoría">${categoryPicker}</div>
                <div class="category-picker-footer"><p id="categoria-seleccionadas" class="helper-text">Podés elegir varias categorías para crearlas juntas.</p><button id="agregar-categoria" class="btn-primary" type="submit" disabled ${allCategoriesAdded ? 'disabled' : ''}>Agregar categorías</button></div>
            </form>
            <form id="form-categoria-personalizada" class="form-grid" style="margin-top: 14px;">
                <label class="form-field">Otra categoría personalizada<input id="categoria-custom-nombre" type="text" maxlength="50" placeholder="Ej.: +70 Mixto o Recreativo"></label>
                <div class="form-actions"><button class="btn-secondary" type="submit">+ Crear categoría</button></div>
            </form>
        </section>
        <section class="category-workspace">
            <div class="category-workspace-header"><div><h3>Categorías del torneo</h3><span>Cambie de categoría sin salir de la página principal.</span></div></div>
            <div class="tabs-container">${categories.length ? categoryTabs(categories, categoryId) : '<span class="helper-text">Aún no hay categorías.</span>'}</div>
        </section>
        ${category ? `<div id="category-format-host"></div>
        <section class="form-card panel-control">
            <div class="category-page-header"><div><h3>${escapeHtml(category.nombre)}</h3><p class="helper-text">${teams.length} equipo${teams.length === 1 ? '' : 's'} registrado${teams.length === 1 ? '' : 's'} · ${escapeHtml(formatLabelFor(activeFormat?.config))}</p></div><button id="btn-eliminar-categoria" type="button" class="btn-secondary">Eliminar categoría</button></div>
            <form id="form-nuevo-equipo" class="form-grid">
                <label class="form-field">Nombre del equipo<input id="equipo-nombre" type="text" maxlength="70" required placeholder="Ej.: Los Cóndores"></label>
                <div class="form-actions"><button class="btn-primary" type="submit">Agregar equipo</button></div>
            </form>
        </section>
        <div class="grid-cards">${teams.length ? teams.map(team => {
            const zone = zones.find(item => item.id === team.zonaId);
            const needsZones = activeFormat?.definition?.requiresZones || activeFormat?.config?.stages?.[0]?.type === 'ZONAS';
            return `<article class="card"><span class="calendar-chip">${zone ? escapeHtml(zone.nombre) : (needsZones ? 'SIN ZONA' : 'INSCRIPTO')}</span><h3>${escapeHtml(team.nombre)}</h3><p>${zone ? 'Listo para programar' : (needsZones ? 'Asignalo a una zona para generar el fixture.' : 'Listo para generar el fixture directo.')}</p><div class="card-actions"><button type="button" class="btn-secondary editar-equipo" data-id="${escapeHtml(team.id)}" data-name="${escapeHtml(team.nombre)}">Renombrar</button><button type="button" class="btn-danger eliminar-equipo" data-id="${escapeHtml(team.id)}" data-name="${escapeHtml(team.nombre)}">Eliminar</button></div></article>`;
        }).join('') : '<div class="empty-state">Esta categoría todavía no tiene equipos.</div>'}</div>` : ''}`;

    if (category) {
        mountCategoryFormatConfigurator({
            container: view.querySelector('#category-format-host'),
            tournamentId,
            categoryId,
            teamCount: teams.length,
            zoneCount: zones.length,
            onSaved: () => { renderCategoryWorkspace(); initEquiposView(); }
        });
    }

    view.querySelector('#form-nueva-categoria').addEventListener('submit', event => {
        event.preventDefault();
        const names = [...view.querySelectorAll('.category-choice.selected')].map(choice => choice.dataset.category);
        if (!names.length) return;
        try {
            const created = DataManager.createCategories(names, tournamentId);
            AppState.setCategory(created[0].id);
            renderCategoryWorkspace();
            initEquiposView();
        } catch (error) { alert(error.message); }
    });
    view.querySelector('#form-categoria-personalizada')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = view.querySelector('#categoria-custom-nombre');
        const name = input.value.trim();
        if (!name) return;
        try {
            const created = DataManager.createCategory(name, tournamentId);
            AppState.setCategory(created.id);
            renderCategoryWorkspace();
            initEquiposView();
        } catch (error) { alert(error.message); }
    });
    view.querySelector('#btn-eliminar-categoria')?.addEventListener('click', () => {
        if (!category || !confirm(`¿Eliminar la categoría "${category.nombre}" junto con sus equipos y zonas?`)) return;
        try {
            DataManager.removeCategory(tournamentId, category.id);
            AppState.setCategory(null);
            renderCategoryWorkspace();
            initEquiposView();
        } catch (error) { alert(error.message); }
    });
    view.querySelectorAll('.category-choice').forEach(choice => choice.addEventListener('click', () => {
        if (choice.disabled) return;
        choice.classList.toggle('selected');
        choice.setAttribute('aria-pressed', choice.classList.contains('selected') ? 'true' : 'false');
        const selected = [...view.querySelectorAll('.category-choice.selected')];
        view.querySelector('#agregar-categoria').disabled = selected.length === 0;
        view.querySelector('#categoria-seleccionadas').textContent = selected.length ? `${selected.length} categoría${selected.length === 1 ? '' : 's'} seleccionada${selected.length === 1 ? '' : 's'}: ${selected.map(item => item.dataset.category).join(', ')}.` : 'Podés elegir varias categorías para crearlas juntas.';
    }));
    view.querySelectorAll('.categoria-tab').forEach(tab => tab.addEventListener('click', () => {
        AppState.setCategory(tab.dataset.id);
        renderCategoryWorkspace();
        initEquiposView();
    }));
    view.querySelector('#form-nuevo-equipo')?.addEventListener('submit', event => {
        event.preventDefault();
        const name = view.querySelector('#equipo-nombre').value.trim();
        if (!name) return;
        try { DataManager.createTeam(name, categoryId, tournamentId); renderCategoryWorkspace(); initEquiposView(); } catch (error) { alert(error.message); }
    });
    view.querySelectorAll('.editar-equipo').forEach(button => button.addEventListener('click', () => {
        const nextName = prompt('Nuevo nombre del equipo:', button.dataset.name);
        if (nextName === null || !nextName.trim()) return;
        try { DataManager.updateTeam(button.dataset.id, { nombre: nextName }); initEquiposView(); } catch (error) { alert(error.message); }
    }));
    view.querySelectorAll('.eliminar-equipo').forEach(button => button.addEventListener('click', () => {
        if (!confirm(`¿Eliminar el equipo "${button.dataset.name}"?`)) return;
        try { DataManager.removeTeam(button.dataset.id); renderCategoryWorkspace(); initEquiposView(); } catch (error) { alert(error.message); }
    }));
};
