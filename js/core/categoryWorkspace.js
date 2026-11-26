import { AppState } from './state.js';
import { escapeHtml } from './escapeHtml.js';
import { DataManager } from '../data/dataManager.js';

// Vistas globales donde no se renderiza la fila superior de chips de categoría.
// En 'planificacion', 'equipos', 'zonas', 'resultados', 'posiciones' y 'eliminatorias'
// se muestran los chips para cambiar de categoría con un clic.
const TOURNAMENT_GLOBAL_SECTIONS = new Set(['inicio', 'programacion', 'exportaciones', 'configuracion', 'calendario']);

let categoryChangeHandler = null;

export const setCategoryChangeHandler = callback => {
    categoryChangeHandler = typeof callback === 'function' ? callback : null;
};

export const renderCategoryWorkspace = (options = {}) => {
    const host = globalThis.document?.getElementById?.('category-workspace-nav');
    if (!host) return;

    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const categories = tournamentId ? DataManager.getCategoriesByTournament(tournamentId) : [];
    const activeId = AppState.getCategory();
    const activeSection = options.section
        || globalThis.document?.querySelector?.('#main-nav .nav-btn.active')?.dataset?.section
        || '';

    if (!tournamentId || !categories.length || TOURNAMENT_GLOBAL_SECTIONS.has(activeSection)) {
        host.hidden = true;
        host.innerHTML = '';
        return;
    }

    const activeCategory = categories.find(item => item.id === activeId) || categories[0];
    const showTeamCount = activeSection === 'equipos';

    host.hidden = false;
    host.innerHTML = `
        <div class="category-chips-bar" role="tablist" aria-label="Categorías del torneo">
            ${categories.map(category => {
                const isActive = category.id === activeCategory?.id;
                const count = showTeamCount
                    ? DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id).length
                    : null;
                return `<button type="button" role="tab" class="category-pill ${isActive ? 'active' : ''}" data-category-id="${escapeHtml(category.id)}" aria-selected="${isActive}" aria-pressed="${isActive}">
                    <strong>${escapeHtml(category.nombre)}${count !== null ? ` · ${count}` : ''}</strong>
                </button>`;
            }).join('')}
        </div>`;

    host.querySelectorAll('[data-category-id]').forEach(button => button.addEventListener('click', () => {
        const nextCategoryId = button.dataset.categoryId;
        if (!nextCategoryId || nextCategoryId === AppState.getCategory()) return;
        AppState.setCategory(nextCategoryId);
        if (categoryChangeHandler) {
            categoryChangeHandler(nextCategoryId);
            return;
        }
        const currentView = globalThis.document?.querySelector?.('.nav-btn.active[id^="btn-nav-"]');
        currentView?.click?.();
    }));
};
