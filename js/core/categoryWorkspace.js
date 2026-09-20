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

    const teams = categories.reduce((total, category) => total + DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id).length, 0);
    const matches = categories.reduce((total, category) => total + DataManager.getMatchesByTournamentAndCategory(tournamentId, category.id).length, 0);
    host.hidden = false;
    host.innerHTML = `<section class="category-shell" aria-labelledby="active-categories-title">
        <div class="category-shell-head"><div><h2 id="active-categories-title">Categorías Activas</h2><p>Seleccioná una categoría para ver los equipos y partidos.</p></div></div>
        <div class="category-page-list" role="list">${categories.map(category => `<button type="button" class="category-page ${category.id === activeId ? 'active' : ''}" data-category-id="${category.id}" aria-pressed="${category.id === activeId}"><strong>${category.nombre}</strong><small>${categorySummary(tournamentId, category)}</small></button>`).join('')}</div>
        <div class="tournament-home-summary" aria-label="Resumen del torneo"><div><span>Categorías</span><strong>${categories.length}</strong></div><div><span>Equipos</span><strong>${teams}</strong></div><div><span>Partidos</span><strong>${matches}</strong></div></div>
    </section>`;

    host.querySelectorAll('[data-category-id]').forEach(button => button.addEventListener('click', () => {
        AppState.setCategory(button.dataset.categoryId);
        const currentView = document.querySelector('.nav-btn.active[id^="btn-nav-"]');
        currentView?.click();
    }));
};
