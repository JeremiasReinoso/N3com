import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

export function initTournamentHomeView() {
    const view = document.getElementById('view-inicio');
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId && DataManager.getTournament(tournamentId);
    if (!tournament) {
        view.innerHTML = '<div class="empty-state">Seleccioná un torneo desde la lista principal.</div>';
        return;
    }
    const categories = DataManager.getCategoriesByTournament(tournamentId);
    const teams = categories.reduce((total, category) => total + DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id).length, 0);
    view.innerHTML = `<section class="tournament-home panel-control"><span class="calendar-chip">ESPACIO DEL TORNEO</span><h2>${escapeHtml(tournament.nombre)}</h2><p>Gestioná este torneo desde las secciones de navegación. Todos los equipos, zonas, fechas y partidos que veas aquí pertenecen únicamente a este torneo.</p><div class="tournament-home-summary"><div><span>Categorías</span><strong>${categories.length}</strong></div><div><span>Equipos</span><strong>${teams}</strong></div><div><span>Partidos por equipo</span><strong>${tournament.partidos_asegurados}</strong></div></div></section>`;
}
