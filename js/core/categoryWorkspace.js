import { AppState } from './state.js';
import { DataManager } from '../data/dataManager.js';

const categorySummary = (tournamentId, category) => {
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id).length;
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, category.id).length;
    return `${teams} equipo${teams === 1 ? '' : 's'} · ${matches} partido${matches === 1 ? '' : 's'}`;
};

// Las categorías se comportan como espacios independientes dentro del mismo
// torneo, sin obligar al usuario a abandonar la aplicación principal.
export const renderCategoryWorkspace = () => {
    const host = globalThis.document?.getElementById?.('category-workspace-nav');
    if (!host) return;

    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const categories = tournamentId ? DataManager.getCategoriesByTournament(tournamentId) : [];
    const activeId = AppState.getCategory();

    if (!tournamentId || !categories.length) {
        host.hidden = true;
        host.innerHTML = '';
        return;
    }

    const tournament = DataManager.getTournament(tournamentId);
    host.hidden = false;
    host.innerHTML = `<section class="category-shell" aria-label="Espacios de categorías">
        <div class="category-shell-head"><div><span>TORNEO ACTIVO</span><strong>${tournament?.nombre || 'Torneo'}</strong></div><p>Elegí una categoría para abrir su espacio de trabajo.</p></div>
        <div class="category-page-list" role="list">${categories.map(category => `<button type="button" class="category-page ${category.id === activeId ? 'active' : ''}" data-category-id="${category.id}" aria-pressed="${category.id === activeId}"><strong>${category.nombre}</strong><small>${categorySummary(tournamentId, category)}</small></button>`).join('')}</div>
    </section>`;

    host.querySelectorAll('[data-category-id]').forEach(button => button.addEventListener('click', () => {
        AppState.setCategory(button.dataset.categoryId);
        const currentView = document.querySelector('.nav-btn.active[id^="btn-nav-"]');
        currentView?.click();
    }));
};
