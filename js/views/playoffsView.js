import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { SchedulerService } from '../services/scheduler.js';
import { PosicionesService } from '../services/standings.js';

const teamLabel = (teams, id) => teams.find(team => team.id === id)?.nombre || 'Equipo';
const renderMatch = (teams, match) => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.fecha || 'Fecha pendiente'}${match.cancha ? ` · ${match.cancha}` : ''}</span></div><div class="schedule-match-main"><div><strong>${teamLabel(teams, match.equipoLocalId)} <b>vs</b> ${teamLabel(teams, match.equipoVisitanteId)}</strong><span class="schedule-stage">${match.nombreEtapa || match.phase}</span></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.setsLocal} – ${match.setsVisitante}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`;

const renderPreview = (tournamentId, categoryId, teams, definitive) => {
    const zones = PosicionesService.calcularPosicionesDeZonas(tournamentId, categoryId);
    if (zones.length < 2) return '<p class="helper-text">Configure al menos dos zonas para generar cruces.</p>';
    return zones.map((source, index) => {
        const target = zones[(index + 1) % zones.length];
        const count = Math.min(DataManager.getQualifiedTeamsPerZone(tournamentId, categoryId, source.zone), DataManager.getQualifiedTeamsPerZone(tournamentId, categoryId, target.zone));
        return Array.from({ length: count }, (_, rank) => {
            const local = definitive ? source.posiciones[rank] : null;
            const visitante = definitive ? target.posiciones[count - rank - 1] : null;
            const localRef = local ? teamLabel(teams, local.id) : `${rank + 1}° ${source.zone.nombre}`;
            const visitanteRef = visitante ? teamLabel(teams, visitante.id) : `${count - rank}° ${target.zone.nombre}`;
            return `<div class="draft-fixture-row"><strong>${localRef} <b>vs</b> ${visitanteRef}</strong><span class="schedule-stage">CRUCE</span></div>`;
        }).join('');
    }).join('');
};

export function initPlayoffsView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list');
    const controls = document.querySelector('#view-eliminatorias .panel-control');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; container.innerHTML = ''; return; }

    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const crosses = matches.filter(match => match.phase === 'CRUCE');
    const semis = matches.filter(match => match.phase === 'SEMIFINAL');
    const finals = matches.filter(match => match.phase === 'FINAL');
    const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    const phase = SchedulerService.getTournamentPhase(tournamentId, categoryId);
    const crossesFinished = crosses.length === 4 && crosses.every(match => match.estado === 'finalizado');
    const semisFinished = semis.length === 2 && semis.every(match => match.estado === 'finalizado');

    controls.innerHTML = `<div class="form-title"><div><h3>Clasificación y eliminatorias</h3><p>Flujo: zonas → resultados → posiciones → cruces → semifinales → final. ${progress.mensaje}</p></div><span class="calendar-chip">${phase}</span></div><div class="form-actions"><button id="btn-generate-crosses" class="btn-primary" ${!progress.ok || crosses.length ? 'disabled' : ''}>Generar cruces automáticamente</button><button id="btn-semis" class="btn-secondary" ${!crossesFinished || semis.length ? 'disabled' : ''}>Generar semifinales</button><button id="btn-final" class="btn-primary" ${!semisFinished || finals.length ? 'disabled' : ''}>Generar final</button></div>`;
    const section = (title, items) => items.length ? `<section class="schedule-board"><div class="schedule-board-head"><h3>${title}</h3></div><div class="schedule-match-list">${items.map(match => renderMatch(teams, match)).join('')}</div></section>` : '';
    container.innerHTML = `<section class="card standings-card"><div class="standings-head"><div><h3>Posiciones de zona</h3><p>Las referencias se reemplazan por nombres cuando las posiciones definitivas están disponibles.</p></div></div><div class="draft-fixture-list">${renderPreview(tournamentId, categoryId, teams, progress.ok)}</div></section>${section('CRUCES', crosses)}${section('SEMIFINALES', semis)}${section('FINAL', finals)}`;

    document.getElementById('btn-generate-crosses')?.addEventListener('click', () => { try { SchedulerService.generarCrucesAutomaticos(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-semis')?.addEventListener('click', () => { try { PlayoffsService.generarSemifinales(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-final')?.addEventListener('click', () => { try { PlayoffsService.generarFinal(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
}
