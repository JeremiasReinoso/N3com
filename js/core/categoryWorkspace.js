import { AppState } from './state.js';
import { escapeHtml } from './escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { icon } from '../ui/icons.js';

// Vistas globales del torneo donde no se requiere mostrar el selector de categoría.
// NOTA: 'planificacion' SÍ se incluye entre las vistas con selector para preservar
// intacto el cambio de categoría en Planificación sin modificar planningView.js.
const TOURNAMENT_GLOBAL_SECTIONS = new Set(['inicio', 'configuracion', 'calendario']);

let categoryChangeHandler = null;

export const setCategoryChangeHandler = callback => {
    categoryChangeHandler = typeof callback === 'function' ? callback : null;
};

const categoryCountBadge = (tournamentId, category) => {
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id).length;
    return `${teams} eq.`;
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
    const activeTeams = activeCategory
        ? DataManager.getTeamsByTournamentAndCategory(tournamentId, activeCategory.id).length
        : 0;
    const activeMatches = activeCategory
        ? DataManager.getMatchesByTournamentAndCategory(tournamentId, activeCategory.id).length
        : 0;

    host.hidden = false;
    host.innerHTML = `
        <section class="category-context-bar" aria-label="Selector de categoría activa">
            <div class="category-context-label">
                ${icon('layers', { size: 15 })}
                <span>Categoría</span>
            </div>
            <div class="category-context-pills" role="tablist" aria-label="Categorías del torneo">
                ${categories.map(category => {
                    const isActive = category.id === activeCategory?.id;
                    return `<button type="button" role="tab" class="category-pill ${isActive ? 'active' : ''}" data-category-id="${escapeHtml(category.id)}" aria-selected="${isActive}" aria-pressed="${isActive}">
                        <strong>${escapeHtml(category.nombre)}</strong>
                        <small>${escapeHtml(categoryCountBadge(tournamentId, category))}</small>
                    </button>`;
                }).join('')}
            </div>
            <div class="category-context-meta" aria-live="polite">
                <span><strong>${activeTeams}</strong> equipo${activeTeams === 1 ? '' : 's'}</span>
                <span aria-hidden="true">·</span>
                <span><strong>${activeMatches}</strong> partido${activeMatches === 1 ? '' : 's'}</span>
            </div>
        </section>`;

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
