import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { SchedulerService } from '../services/scheduler.js';

const PHASE_LABELS = { TOP_16: 'Top 16', TOP_8: 'Top 8', SEMIFINAL: 'Semifinales', FINAL: 'Final' };
const nameOf = (teams, id) => teams.find(team => team.id === id)?.nombre || 'Por definir';
const renderMatch = (match, teams) => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.fecha || 'Fecha pendiente'}${match.cancha ? ` · ${match.cancha}` : ''}</span></div><div class="schedule-match-main"><div><span class="schedule-stage">${PHASE_LABELS[match.phase] || match.phase}</span><strong>${nameOf(teams, match.equipoLocalId)} <b>vs</b> ${nameOf(teams, match.equipoVisitanteId)}</strong>${match.estado === 'finalizado' ? `<small>${(match.sets || []).map((set, index) => `Set ${index + 1}: ${set.puntosLocal}-${set.puntosVisitante}`).join(' · ')}</small>` : ''}</div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.score}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`;

export function initPlayoffsView() {
    let tournamentId; try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list'); const controls = document.querySelector('#view-eliminatorias .panel-control'); const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; container.innerHTML = ''; return; }
    const tournament = DataManager.getTournament(tournamentId); const category = DataManager.getCategory(categoryId); const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId); const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    let matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => ['TOP_16', 'TOP_8', 'SEMIFINAL', 'FINAL'].includes(match.phase));
    if (progress.ok && !matches.some(match => match.phase === 'TOP_16')) { try { PlayoffsService.generarTop16(tournamentId, categoryId); } catch { /* Las zonas pueden no estar cerradas todavía. */ } }
    try {
        let current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        const completed = phase => current.filter(match => match.phase === phase).length > 0 && current.filter(match => match.phase === phase).every(match => match.estado === 'finalizado');
        if (completed('TOP_16') && !current.some(match => match.phase === 'TOP_8')) PlayoffsService.generarTop8(tournamentId, categoryId);
        current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        if (completed('TOP_8') && !current.some(match => match.phase === 'SEMIFINAL')) PlayoffsService.generarSemifinales(tournamentId, categoryId);
        current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        if (completed('SEMIFINAL') && !current.some(match => match.phase === 'FINAL')) PlayoffsService.generarFinal(tournamentId, categoryId);
    } catch { /* La vista sigue mostrando la última etapa válida mientras falta programar o cargar algo. */ }
    matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => ['TOP_16', 'TOP_8', 'SEMIFINAL', 'FINAL'].includes(match.phase));
    const groups = ['TOP_16', 'TOP_8', 'SEMIFINAL', 'FINAL'].map(phase => ({ phase, items: matches.filter(match => match.phase === phase) })).filter(group => group.items.length);
    controls.innerHTML = `<div class="form-title"><div><h3>${tournament.nombre} · ${category.nombre}</h3><p>Formato único: <strong>Top 16 → Top 8 → Top 4 → Semifinales → Final</strong>. Todos los resultados se cargan por sets reales.</p><p>${progress.mensaje}</p></div><span class="calendar-chip">${progress.ok ? 'CLASIFICADOS' : 'ZONAS EN CURSO'}</span></div>`;
    container.innerHTML = groups.length ? groups.map(group => `<section class="schedule-day"><header><div><span class="calendar-chip">${PHASE_LABELS[group.phase].toUpperCase()}</span><h4>${PHASE_LABELS[group.phase]}</h4></div><strong>${group.items.length} partidos</strong></header><div class="schedule-match-list">${group.items.map(match => renderMatch(match, teams)).join('')}</div></section>`).join('') : '<div class="empty-state">El Top 16 aparecerá automáticamente cuando finalicen los partidos de zona y se calculen las posiciones.</div>';
}
