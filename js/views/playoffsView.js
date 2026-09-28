import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { SchedulerService } from '../services/scheduler.js';
import { PosicionesService } from '../services/standings.js';

const teamLabel = (teams, id) => teams.find(team => team.id === id)?.nombre || 'Equipo';
const renderMatch = (teams, match) => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.fecha || 'Fecha pendiente'}${match.cancha ? ` · ${match.cancha}` : ''}</span></div><div class="schedule-match-main"><div><strong>${teamLabel(teams, match.equipoLocalId)} <b>vs</b> ${teamLabel(teams, match.equipoVisitanteId)}</strong><span class="schedule-stage">${match.nombreEtapa || match.phase}</span></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.setsLocal} – ${match.setsVisitante}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`;
const section = (title, items, teams) => items.length ? `<section class="schedule-board"><div class="schedule-board-head"><h3>${title}</h3><span class="calendar-chip">${items.length} PARTIDO${items.length === 1 ? '' : 'S'}</span></div><div class="schedule-match-list">${items.map(match => renderMatch(teams, match)).join('')}</div></section>` : '';

const renderZonePreview = (tournamentId, categoryId, teams, definitive) => {
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

const isAllVsAll = torneoId => DataManager.getTournamentMethod(torneoId) === 'all_vs_all';
const isExplicitTop16 = torneoId => DataManager.isTop16Tournament(torneoId);
const supportsTopStages = torneoId => !isAllVsAll(torneoId) && (isExplicitTop16(torneoId) || DataManager.getTournamentClassificationMode(torneoId) === 'points');

const initHistoricalView = (tournamentId, categoryId, teams, matches, controls, container) => {
    const topMode = supportsTopStages(tournamentId);
    const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    let phase = SchedulerService.getTournamentPhase(tournamentId, categoryId);
    let currentMatches = matches;
    if (isExplicitTop16(tournamentId) && progress.ok && !matches.some(match => match.phase === 'TOP_16')) {
        try { PlayoffsService.generarTop16(tournamentId, categoryId); currentMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId); phase = SchedulerService.getTournamentPhase(tournamentId, categoryId); } catch { /* la acción manual queda disponible */ }
    }
    const top16 = currentMatches.filter(match => match.phase === 'TOP_16');
    const top8 = currentMatches.filter(match => match.phase === 'TOP_8');
    const top4 = currentMatches.filter(match => match.phase === 'TOP_4');
    const semis = currentMatches.filter(match => match.phase === 'SEMIFINAL');
    const thirdPlace = currentMatches.filter(match => match.phase === 'THIRD_PLACE');
    const finals = currentMatches.filter(match => match.phase === 'FINAL');
    const completed = (items, count) => items.length === count && items.every(match => match.estado === 'finalizado');
    const top16Finished = completed(top16, 8);
    const top8Finished = completed(top8, 4);
    const top4Finished = completed(top4, 2);
    const semisFinished = completed(semis, isExplicitTop16(tournamentId) ? 1 : 2);
    const actions = topMode
        ? `<button id="btn-top16" class="btn-primary" ${!progress.ok || top16.length ? 'disabled' : ''}>Generar TOP 16</button><button id="btn-top8" class="btn-secondary" ${!top16Finished || top8.length ? 'disabled' : ''}>Generar TOP 8</button>${isExplicitTop16(tournamentId) ? `<button id="btn-top4" class="btn-secondary" ${!top8Finished || top4.length ? 'disabled' : ''}>Generar TOP 4</button>` : ''}<button id="btn-semis" class="btn-secondary" ${!(isExplicitTop16(tournamentId) ? top4Finished : top8Finished) || semis.length ? 'disabled' : ''}>Generar semifinales</button>`
        : `<button id="btn-semis" class="btn-secondary" ${!progress.ok || semis.length ? 'disabled' : ''}>Generar semifinales</button>`;
    controls.innerHTML = `<div class="form-title"><div><h3>Clasificación y eliminatorias</h3><p>${topMode ? `Flujo: zonas → clasificación → TOP 16 → TOP 8 → ${isExplicitTop16(tournamentId) ? 'TOP 4 → ' : ''}semifinales → final.` : 'Flujo: zonas → clasificación → semifinales → final.'} ${progress.mensaje}</p></div><span class="calendar-chip">${phase}</span></div><div class="form-actions">${actions}<button id="btn-finales" class="btn-primary" ${!semisFinished || finals.length ? 'disabled' : ''}>Generar final${topMode && !isExplicitTop16(tournamentId) ? ' y tercer puesto' : ''}</button></div>`;
    container.innerHTML = `${section('TOP 16', top16, teams)}${section('TOP 8', top8, teams)}${(isExplicitTop16(tournamentId) ? section('TOP 4', top4, teams) : '')}${section('SEMIFINALES', semis, teams)}${section('TERCER PUESTO', thirdPlace, teams)}${section('FINAL', finals, teams)}`;
    document.getElementById('btn-top16')?.addEventListener('click', () => { try { PlayoffsService.generarTop16(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-top8')?.addEventListener('click', () => { try { PlayoffsService.generarTop8(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-top4')?.addEventListener('click', () => { try { PlayoffsService.generarTop4(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-semis')?.addEventListener('click', () => { try { PlayoffsService.generarSemifinales(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-finales')?.addEventListener('click', () => { try { PlayoffsService.generarFinales(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
};

const initAllVsAllView = (tournamentId, categoryId, teams, matches, controls, container) => {
    const crosses = matches.filter(match => match.phase === 'CRUCE');
    const semis = matches.filter(match => match.phase === 'SEMIFINAL');
    const finals = matches.filter(match => match.phase === 'FINAL');
    const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    const phase = SchedulerService.getTournamentPhase(tournamentId, categoryId);
    const crossesFinished = crosses.length === 4 && crosses.every(match => match.estado === 'finalizado');
    const semisFinished = semis.length === 2 && semis.every(match => match.estado === 'finalizado');
    controls.innerHTML = `<div class="form-title"><div><h3>Clasificación y eliminatorias</h3><p>Flujo: zonas → resultados → posiciones → cruces → semifinales → final. ${progress.mensaje}</p></div><span class="calendar-chip">${phase}</span></div><div class="form-actions"><button id="btn-generate-crosses" class="btn-primary" ${!progress.ok || crosses.length ? 'disabled' : ''}>Generar cruces automáticamente</button><button id="btn-semis" class="btn-secondary" ${!crossesFinished || semis.length ? 'disabled' : ''}>Generar semifinales</button><button id="btn-final" class="btn-primary" ${!semisFinished || finals.length ? 'disabled' : ''}>Generar final</button></div>`;
    container.innerHTML = `<section class="card standings-card"><div class="standings-head"><div><h3>Posiciones de zona</h3><p>Las referencias se reemplazan por nombres cuando las posiciones definitivas están disponibles.</p></div></div><div class="draft-fixture-list">${renderZonePreview(tournamentId, categoryId, teams, progress.ok)}</div></section>${section('CRUCES', crosses, teams)}${section('SEMIFINALES', semis, teams)}${section('FINAL', finals, teams)}`;
    document.getElementById('btn-generate-crosses')?.addEventListener('click', () => { try { SchedulerService.generarCrucesAutomaticos(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-semis')?.addEventListener('click', () => { try { PlayoffsService.generarSemifinales(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
    document.getElementById('btn-final')?.addEventListener('click', () => { try { PlayoffsService.generarFinal(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); } });
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
    if (isAllVsAll(tournamentId)) initAllVsAllView(tournamentId, categoryId, teams, matches, controls, container);
    else initHistoricalView(tournamentId, categoryId, teams, matches, controls, container);
}
