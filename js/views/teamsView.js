import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { renderCategoryWorkspace } from '../core/categoryWorkspace.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { CompetitionEngine } from '../engine/index.js';
import { formatLabelFor, mountCategoryFormatConfigurator } from './formatConfigurator.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, openModal, promptDialog, showToast } from '../ui/feedback.js';

const CATEGORY_GROUPS = {
    '+40': ['+40 Masculino', '+40 Femenino', '+40 Mixto'],
    '+50': ['+50 Masculino', '+50 Femenino', '+50 Mixto'],
    '+60': ['+60 Masculino', '+60 Femenino', '+60 Mixto'],
    '+68': ['+68 Masculino', '+68 Femenino', '+68 Mixto']
};
const CATEGORY_OPTIONS = Object.values(CATEGORY_GROUPS).flat();

const buildCategoryPickerMarkup = existingNames => {
    const allAdded = CATEGORY_OPTIONS.every(name => existingNames.has(name.toLocaleLowerCase('es')));
    const picker = Object.entries(CATEGORY_GROUPS).map(([age, names]) => `
        <section class="category-picker-group">
            <header><span>Edad</span><strong>${age}</strong></header>
            <div>${names.map(name => {
                const exists = existingNames.has(name.toLocaleLowerCase('es'));
                const mode = name.replace(`${age} `, '');
                return `<button type="button" class="category-choice" data-category="${escapeHtml(name)}" ${exists ? 'disabled' : ''} aria-pressed="false"><b>${escapeHtml(mode)}</b><small>${exists ? 'Ya creada' : age}</small></button>`;
            }).join('')}</div>
        </section>`).join('');

    return `
        <form id="form-nueva-categoria" class="category-picker-form">
            <div class="category-picker" role="group" aria-label="Categorías estándar de Newcom">${picker}</div>
            <div class="category-picker-footer">
                <p id="categoria-seleccionadas" class="helper-text">Podés marcar varias categorías a la vez para crearlas juntas.</p>
                <button id="agregar-categoria" class="btn-primary" type="submit" disabled ${allAdded ? 'disabled' : ''}>Agregar seleccionadas</button>
            </div>
        </form>
        <hr class="ui-dropdown-divider" style="margin: 14px 0;">
        <form id="form-categoria-personalizada" class="form-grid">
            <label class="form-field">O escribí una categoría libre / personalizada
                <input id="categoria-custom-nombre" type="text" maxlength="50" placeholder="Ej.: +70 Mixto, Libre o Recreativo">
            </label>
            <div class="form-actions">
                <button class="btn-secondary" type="submit">${icon('plus', { size: 15 })}<span>Crear categoría libre</span></button>
            </div>
        </form>`;
};

const bindCategoryCreatorForms = (root, tournamentId, onCreated) => {
    root.querySelectorAll('.category-choice').forEach(choice => choice.addEventListener('click', () => {
        if (choice.disabled) return;
        choice.classList.toggle('selected');
        choice.setAttribute('aria-pressed', choice.classList.contains('selected') ? 'true' : 'false');
        const selected = [...root.querySelectorAll('.category-choice.selected')];
        const submitBtn = root.querySelector('#agregar-categoria');
        if (submitBtn) submitBtn.disabled = selected.length === 0;
        const summary = root.querySelector('#categoria-seleccionadas');
        if (summary) {
            summary.textContent = selected.length
                ? `${selected.length} seleccionada${selected.length === 1 ? '' : 's'}: ${selected.map(item => item.dataset.category).join(', ')}.`
                : 'Podés marcar varias categorías a la vez para crearlas juntas.';
        }
    }));

    root.querySelector('#form-nueva-categoria')?.addEventListener('submit', event => {
        event.preventDefault();
        const names = [...root.querySelectorAll('.category-choice.selected')].map(choice => choice.dataset.category);
        if (!names.length) return;
        try {
            const created = DataManager.createCategories(names, tournamentId);
            AppState.setCategory(created[0].id);
            showToast(`${created.length} categoría${created.length === 1 ? '' : 's'} agregada${created.length === 1 ? '' : 's'}.`, { type: 'success' });
            onCreated();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });

    root.querySelector('#form-categoria-personalizada')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = root.querySelector('#categoria-custom-nombre');
        const name = input?.value.trim() || '';
        if (!name) return;
        try {
            const created = DataManager.createCategory(name, tournamentId);
            AppState.setCategory(created.id);
            showToast(`Categoría "${created.nombre}" creada.`, { type: 'success' });
            onCreated();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });
};

export const initEquiposView = (options = {}) => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-equipos');
    if (!tournamentId) {
        view.innerHTML = '<div class="empty-state"><strong>Seleccioná un torneo</strong><p>Elegí un torneo desde Mis Torneos para gestionar sus equipos.</p></div>';
        return;
    }

    const tournament = DataManager.getTournament(tournamentId);
    const categories = DataManager.getCategoriesByTournament(tournamentId);
    let categoryId = AppState.getCategory();
    if (!categories.some(category => category.id === categoryId)) {
        categoryId = categories[0]?.id || null;
        if (categoryId) AppState.setCategory(categoryId);
    }

    const existingNames = new Set(categories.map(item => item.nombre.trim().toLocaleLowerCase('es')));

    // Si el torneo todavía no tiene ninguna categoría, muestra directamente el creador limpio
    if (!categories.length) {
        view.innerHTML = `
            <div class="page-header">
                <div class="page-header-main">
                    <span class="page-eyebrow">${escapeHtml(tournament.nombre)}</span>
                    <h2>Crear primeras categorías</h2>
                    <p>Seleccioná las categorías que participarán en el torneo para empezar a inscribir equipos.</p>
                </div>
            </div>
            <section class="section-card">
                ${buildCategoryPickerMarkup(existingNames)}
            </section>`;

        bindCategoryCreatorForms(view, tournamentId, () => {
            renderCategoryWorkspace({ section: 'equipos' });
            initEquiposView();
        });
        return;
    }

    const category = DataManager.getCategory(categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const activeFormat = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const needsZones = activeFormat?.definition?.requiresZones || activeFormat?.config?.stages?.[0]?.type === 'ZONAS';
    const formatOpen = Boolean(options.openFormat);

    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">Equipos e inscripción · ${escapeHtml(tournament.nombre)}</span>
                <h2>${escapeHtml(category.nombre)}</h2>
                <p>
                    <strong>${teams.length}</strong> equipo${teams.length === 1 ? '' : 's'} inscripto${teams.length === 1 ? '' : 's'} ·
                    Modalidad: <strong>${escapeHtml(formatLabelFor(activeFormat.config))}</strong>
                </p>
            </div>
            <div class="page-header-actions">
                <button type="button" id="btn-abrir-modal-categorias" class="btn-secondary">
                    ${icon('plus', { size: 16 })}
                    <span>Nueva categoría</span>
                </button>
                <button type="button" id="btn-toggle-formato" class="btn-secondary" aria-expanded="${formatOpen}">
                    ${icon('sliders', { size: 16 })}
                    <span>Modalidad y reglas</span>
                </button>
                <button type="button" id="btn-siguiente-paso-equipos" class="btn-secondary">
                    <span>${needsZones ? 'Ir a Zonas' : 'Ir a Programación'}</span>
                    ${icon('arrowRight', { size: 15 })}
                </button>
                <div class="ui-dropdown" data-dropdown>
                    <button type="button" class="btn-icon" data-dropdown-trigger aria-label="Opciones de categoría" aria-expanded="false">${icon('moreHorizontal', { size: 18 })}</button>
                    <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                        <button type="button" id="btn-eliminar-categoria" class="ui-dropdown-item is-danger">${icon('trash', { size: 15 })}<span>Eliminar categoría "${escapeHtml(category.nombre)}"</span></button>
                    </div>
                </div>
            </div>
        </div>

        <div id="category-format-host" ${formatOpen ? '' : 'hidden'}></div>

        <section class="section-card">
            <form id="form-nuevo-equipo" class="form-grid" style="grid-template-columns: minmax(240px, 1fr) auto;">
                <label class="form-field">Inscribir equipo en ${escapeHtml(category.nombre)}
                    <input id="equipo-nombre" type="text" maxlength="70" required placeholder="Escribí el nombre del equipo y presioná Enter (ej.: Águilas Doradas)">
                </label>
                <div class="form-actions">
                    <button class="btn-primary" type="submit">${icon('plus', { size: 16 })}<span>Agregar equipo</span></button>
                </div>
            </form>
        </section>

        ${teams.length ? `
            <section class="card clean-list-card" aria-label="Listado de equipos de ${escapeHtml(category.nombre)}">
                ${teams.map((team, idx) => {
                    const zone = zones.find(item => item.id === team.zonaId);
                    const badgeMarkup = zone
                        ? `<span class="stage-pill stage-pill-zonas">${escapeHtml(zone.nombre)}</span>`
                        : (needsZones ? '<span class="badge badge-warning">Sin zona</span>' : '<span class="badge badge-success">Listo para fixture</span>');
                    return `
                        <div class="clean-list-row">
                            <div class="clean-list-main">
                                <span class="clean-list-index">${idx + 1}</span>
                                <strong style="font-size: var(--text-md);">${escapeHtml(team.nombre)}</strong>
                                ${badgeMarkup}
                            </div>
                            <div class="ui-dropdown" data-dropdown>
                                <button type="button" class="btn-icon" data-dropdown-trigger aria-label="Acciones para ${escapeHtml(team.nombre)}" aria-expanded="false">${icon('moreHorizontal', { size: 18 })}</button>
                                <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                                    <button type="button" class="ui-dropdown-item editar-equipo" data-id="${escapeHtml(team.id)}" data-name="${escapeHtml(team.nombre)}">${icon('pencil', { size: 15 })}<span>Renombrar equipo</span></button>
                                    <button type="button" class="ui-dropdown-item is-danger eliminar-equipo" data-id="${escapeHtml(team.id)}" data-name="${escapeHtml(team.nombre)}">${icon('trash', { size: 15 })}<span>Eliminar equipo</span></button>
                                </div>
                            </div>
                        </div>`;
                }).join('')}
            </section>
        ` : `<div class="empty-state"><span class="empty-state-icon">${icon('users', { size: 22 })}</span><strong>Esta categoría todavía no tiene equipos</strong><p>Usá el campo de arriba para cargar los equipos uno por uno.</p></div>`}`;

    const formatHost = view.querySelector('#category-format-host');
    mountCategoryFormatConfigurator({
        container: formatHost,
        tournamentId,
        categoryId,
        teamCount: teams.length,
        zoneCount: zones.length,
        onSaved: () => {
            renderCategoryWorkspace({ section: 'equipos' });
            initEquiposView({ openFormat: false });
        }
    });

    view.querySelector('#btn-toggle-formato')?.addEventListener('click', event => {
        const willOpen = formatHost.hidden;
        formatHost.hidden = !willOpen;
        event.currentTarget.setAttribute('aria-expanded', String(willOpen));
    });

    view.querySelector('#btn-abrir-modal-categorias')?.addEventListener('click', () => {
        openModal({
            title: 'Agregar categorías al torneo',
            subtitle: 'Elegí categorías estándar o creá una categoría personalizada.',
            size: 'lg',
            bodyHtml: buildCategoryPickerMarkup(existingNames),
            onMount: (dialog, close) => {
                bindCategoryCreatorForms(dialog, tournamentId, () => {
                    close();
                    renderCategoryWorkspace({ section: 'equipos' });
                    initEquiposView();
                });
            }
        });
    });

    view.querySelector('#btn-siguiente-paso-equipos')?.addEventListener('click', () => {
        goToTournament(tournamentId, needsZones ? 'zonas' : 'programacion');
    });

    view.querySelector('#btn-eliminar-categoria')?.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
            title: `¿Eliminar la categoría "${category.nombre}"?`,
            message: 'Se borrarán también sus equipos, zonas y partidos pendientes. Si ya tiene resultados finalizados no se permitirá borrarla.',
            confirmLabel: 'Eliminar categoría',
            danger: true
        });
        if (!confirmed) return;
        try {
            DataManager.removeCategory(tournamentId, category.id);
            AppState.setCategory(null);
            renderCategoryWorkspace({ section: 'equipos' });
            showToast(`Categoría "${category.nombre}" eliminada.`, { type: 'info' });
            initEquiposView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });

    view.querySelector('#form-nuevo-equipo')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = view.querySelector('#equipo-nombre');
        const name = input.value.trim();
        if (!name) return;
        try {
            DataManager.createTeam(name, categoryId, tournamentId);
            renderCategoryWorkspace({ section: 'equipos' });
            showToast(`Equipo "${name}" inscripto.`, { type: 'success', duration: 2400 });
            initEquiposView({ openFormat: !formatHost.hidden });
            document.getElementById('equipo-nombre')?.focus();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });

    view.querySelectorAll('.editar-equipo').forEach(button => button.addEventListener('click', async () => {
        const nextName = await promptDialog({
            title: 'Renombrar equipo',
            label: 'Nombre del equipo',
            value: button.dataset.name,
            maxLength: 70,
            confirmLabel: 'Guardar nombre'
        });
        if (!nextName || nextName === button.dataset.name) return;
        try {
            DataManager.updateTeam(button.dataset.id, { nombre: nextName });
            showToast('Nombre de equipo actualizado.', { type: 'success' });
            initEquiposView({ openFormat: !formatHost.hidden });
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));

    view.querySelectorAll('.eliminar-equipo').forEach(button => button.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
            title: `¿Eliminar a "${button.dataset.name}"?`,
            message: 'El equipo se quitará de esta categoría si aún no disputó partidos oficiales.',
            confirmLabel: 'Eliminar equipo',
            danger: true
        });
        if (!confirmed) return;
        try {
            DataManager.removeTeam(button.dataset.id);
            renderCategoryWorkspace({ section: 'equipos' });
            showToast(`Equipo "${button.dataset.name}" eliminado.`, { type: 'info' });
            initEquiposView({ openFormat: !formatHost.hidden });
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));
};
