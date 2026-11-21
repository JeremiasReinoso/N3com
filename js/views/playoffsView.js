import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { SchedulerService } from '../services/scheduler.js';

const PHASE_LABELS = { TOP_16: 'Top 16 · 16 → 8', TOP_8: 'Top 8 · 8 → 4', SEMIFINAL: 'Semifinales · Top 4 → Top 2', THIRD_PLACE: 'Tercer puesto', FINAL: 'Final · Top 2 → Campeón' };
const nameOf = (teams, id) => teams.find(team => team.id === id)?.nombre || 'Por definir';
const winnerLabel = (source, matches) => {
    const sourceMatch = matches.find(item => item.id === source);
    if (!sourceMatch) return 'Por definir';
    const stage = { TOP_16: 'Top 16', TOP_8: 'Top 8', SEMIFINAL: 'Semifinal' }[sourceMatch.phase] || sourceMatch.phase;
    return `Ganador ${stage} ${sourceMatch.orden || 1}`;
};
const participant = (match, side, teams, matches) => nameOf(teams, match[side]) !== 'Por definir'
    ? nameOf(teams, match[side])
    : winnerLabel(match.sourceMatchIds?.[side === 'equipoLocalId' ? 0 : 1], matches);
const renderMatch = (match, teams, matches) => `<article class="schedule-match"><div class="schedule-match-time"><strong>${escapeHtml(match.hora || 'Horario pendiente')}</strong><span>${escapeHtml(match.fecha || 'Fecha pendiente')}${match.cancha ? ` · ${escapeHtml(match.cancha)}` : ''}</span></div><div class="schedule-match-main"><div><span class="schedule-stage">${escapeHtml(PHASE_LABELS[match.phase] || match.phase)}</span><strong>${escapeHtml(participant(match, 'equipoLocalId', teams, matches))} <b>vs</b> ${escapeHtml(participant(match, 'equipoVisitanteId', teams, matches))}</strong>${match.estado === 'finalizado' ? `<small>${(match.sets || []).map((set, index) => `Set ${index + 1}: ${set.puntosLocal}-${set.puntosVisitante}`).join(' · ')}</small>` : ''}</div>${match.estado === 'finalizado' ? `<span class="schedule-score">${escapeHtml(match.score)}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`;

export function initPlayoffsView() {
    let tournamentId; try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list'); const controls = document.querySelector('#view-eliminatorias .panel-control'); const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; container.innerHTML = ''; return; }
    const tournament = DataManager.getTournament(tournamentId); const category = DataManager.getCategory(categoryId); const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId); const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    const playoffPhases = ['TOP_16', 'TOP_8', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];
    let matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => playoffPhases.includes(match.phase));
    let generationWarning = '';
    if (progress.ok && !matches.some(match => match.phase === 'TOP_16')) {
        try { PlayoffsService.generarTop16(tournamentId, categoryId); }
        catch (error) { generationWarning = error?.message || 'No se pudo generar la instancia eliminatoria.'; }
    }
    try {
        let current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        const completed = phase => current.filter(match => match.phase === phase).length > 0 && current.filter(match => match.phase === phase).every(match => match.estado === 'finalizado');
        if (completed('TOP_16') && !current.some(match => match.phase === 'TOP_8')) PlayoffsService.generarTop8(tournamentId, categoryId);
        current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        if (completed('TOP_8') && !current.some(match => match.phase === 'SEMIFINAL')) PlayoffsService.generarTop4(tournamentId, categoryId);
        current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        if (completed('SEMIFINAL') && !current.some(match => match.phase === 'FINAL')) PlayoffsService.generarFinal(tournamentId, categoryId);
    } catch (error) {
        if (!generationWarning) generationWarning = error?.message || 'No se pudo avanzar automáticamente la siguiente ronda eliminatoria.';
    }
    matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => playoffPhases.includes(match.phase));
    const groups = playoffPhases.map(phase => ({ phase, items: matches.filter(match => match.phase === phase) })).filter(group => group.items.length);
    const warningMarkup = generationWarning ? `<div class="planning-warning" role="alert"><strong>Aviso:</strong> ${escapeHtml(generationWarning)}</div>` : '';
    controls.innerHTML = `<div class="form-title"><div><h3>${escapeHtml(tournament.nombre)} · ${escapeHtml(category.nombre)}</h3><p>Instancias eliminatorias generadas desde la clasificación oficial. Todos los resultados se cargan por sets reales.</p><p>${escapeHtml(progress.mensaje)}</p></div><span class="calendar-chip">${progress.ok ? 'CLASIFICADOS' : 'ZONAS EN CURSO'}</span></div>${warningMarkup}`;
    container.innerHTML = groups.length ? groups.map(group => `<section class="schedule-day"><header><div><span class="calendar-chip">${escapeHtml(PHASE_LABELS[group.phase].toUpperCase())}</span><h4>${escapeHtml(PHASE_LABELS[group.phase])}</h4></div><strong>${group.items.length} partidos</strong></header><div class="schedule-match-list">${group.items.map(match => renderMatch(match, teams, matches)).join('')}</div></section>`).join('') : '<div class="empty-state">Las llaves eliminatorias aparecerán cuando finalice la fase clasificatoria y la programación permita generarlas.</div>';
}
