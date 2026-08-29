import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);

export function initResultadosView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-resultados');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        view.innerHTML = '<h2>Carga de resultados</h2><div class="empty-state">Seleccione un torneo y una categoría desde Equipos.</div>';
        return;
    }
    const category = DataManager.getCategory(categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(isOfficialMatch);
    const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo';
    const zone = id => zones.find(item => item.id === id)?.nombre || 'Eliminatorias';
    const stage = match => match.nombreEtapa || (match.tipo === 'final' ? 'Final' : (match.tipo === 'semifinal' ? 'Semifinal' : `Ronda ${match.ronda || 1}`));
    const schedule = match => {
        const place = [match.hora, match.cancha].filter(Boolean).join(' · ');
        return match.fecha ? `${match.fecha}${place ? ` · ${place}` : ''}` : 'Fecha y sede por definir';
    };
    const markers = match => [['2-0', '2–0'], ['2-1', '2–1'], ['0-2', '0–2'], ['1-2', '1–2']].map(([value, label]) => `<button type="button" class="score-option ${value === `${match.setsLocal}-${match.setsVisitante}` ? 'selected' : ''}" data-id="${match.id}" data-score="${value}" aria-label="Registrar ${label} en ${team(match.equipoLocalId)} contra ${team(match.equipoVisitanteId)}">${label}</button>`).join('');
    view.innerHTML = `
        <h2>Resultados</h2>
        <div class="resultados-toolbar"><p><strong>${category.nombre}</strong> · Elegí sólo el marcador; los puntos se calculan automáticamente.</p><span class="calendar-chip">${matches.length} PARTIDOS</span></div>
        <div id="resultados-list" class="resultados-list">${matches.length ? matches.map(match => {
            const finished = match.estado === 'finalizado';
            return `<article class="card result-row">
                <div class="result-row-meta"><span class="match-status ${finished ? 'finished' : 'pending'}">${finished ? 'FINALIZADO' : 'PENDIENTE'}</span><strong>${stage(match)}</strong><small>${zone(match.zonaId)}</small></div>
                <div class="result-row-teams"><strong>${team(match.equipoLocalId)}</strong><span>vs</span><strong>${team(match.equipoVisitanteId)}</strong></div>
                <div class="result-row-schedule">${schedule(match)}</div>
                <div class="result-row-score"><span>${finished ? 'Cambiar marcador' : 'Cargar marcador'}</span><div class="score-options">${markers(match)}</div></div>
            </article>`;
        }).join('') : '<div class="empty-state">No hay partidos confirmados en esta categoría. Confirmalos desde Programación para poder cargar resultados.</div>'}</div>`;
    view.querySelectorAll('.score-option').forEach(button => button.addEventListener('click', () => {
        const [local, visitante] = button.dataset.score.split('-').map(Number);
        try { DataManager.updateMatchResult(button.dataset.id, local, visitante); initResultadosView(); } catch (error) { alert(error.message); }
    }));
}
