import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { SchedulerService } from '../services/scheduler.js';
import { PosicionesService } from '../services/standings.js';

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
const renderMatch = (match, teams, matches) => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.fecha || 'Fecha pendiente'}${match.cancha ? ` · ${match.cancha}` : ''}</span></div><div class="schedule-match-main"><div><span class="schedule-stage">${PHASE_LABELS[match.phase] || match.phase}</span><strong>${participant(match, 'equipoLocalId', teams, matches)} <b>vs</b> ${participant(match, 'equipoVisitanteId', teams, matches)}</strong>${match.estado === 'finalizado' ? `<small>${(match.sets || []).map((set, index) => `Set ${index + 1}: ${set.puntosLocal}-${set.puntosVisitante}`).join(' · ')}</small>` : ''}</div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.score}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`;

const ALL_VS_ALL_PHASE_LABELS = {
    GUARANTEED_MATCHES: 'Partidos garantizados',
    ALL_VS_ALL: 'Cruces — Todos contra todos',
    SEMIFINALS: 'Semifinales',
    FINAL: 'Final',
    FINISHED: 'Campeón definido'
};

const renderAllVsAll = (tournamentId, categoryId, controls, container) => {
    const tournament = DataManager.getTournament(tournamentId);
    const category = DataManager.getCategory(categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const guaranteed = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    // Si las semifinales ya terminaron, la final y el tercer puesto se crean
    // solos con el mismo criterio automático del resto de eliminatorias.
    try {
        const current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        const semis = current.filter(match => match.phase === 'SEMIFINAL');
        if (semis.length && semis.every(match => match.estado === 'finalizado') && !current.some(match => match.phase === 'FINAL')) {
            PlayoffsService.generarFinales(tournamentId, categoryId);
        }
    } catch { /* Faltan horarios o una jornada planificada: la vista sigue mostrando la etapa actual. */ }
    const phase = SchedulerService.getTournamentPhase(tournamentId, categoryId);
    const crosses = SchedulerService.getAllVsAllCrosses(tournamentId, categoryId);
    const pending = crosses.filter(match => match.estado !== 'finalizado');
    const table = PosicionesService.calcularPosiciones(tournamentId, categoryId);
    const teamName = id => teams.find(team => team.id === id)?.nombre || 'Por definir';
    const courts = DataManager.getTournamentCourts(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, categoryId);
    const plannedCrossDates = DataManager.getPlanningDatesForStage(tournamentId, categoryId, 'ALL_VS_ALL');
    const dates = planning ? plannedCrossDates : DataManager.getCalendarDates(tournamentId);
    const teamOptions = teams.map(team => `<option value="${team.id}">${team.nombre}</option>`).join('');
    const dateOptions = dates.map(date => `<option value="${date}">${date}</option>`).join('');
    const courtOptions = courts.map(court => `<option value="${court.name}">${court.name}</option>`).join('');
    const phaseMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId)
        .filter(match => ['SEMIFINAL', 'THIRD_PLACE', 'FINAL'].includes(match.phase));
    const scoreLabel = match => match.score || `${match.setsLocal ?? '–'} – ${match.setsVisitante ?? '–'}`;
    const crossCard = match => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.fecha || 'Fecha pendiente'}${match.cancha ? ` · ${match.cancha}` : ''}</span></div><div class="schedule-match-main"><div><strong>${teamName(match.equipoLocalId)} <b>vs</b> ${teamName(match.equipoVisitanteId)}</strong><span class="schedule-stage">${match.manual ? 'MANUAL' : 'AUTOMÁTICO'}</span></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${scoreLabel(match)}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`;
    const crossList = crosses.length ? crosses.map(crossCard).join('') : '<div class="empty-state compact">Aún no hay cruces creados.</div>';
    const tableRows = table.map((row, index) => `<tr><td>${index + 1}</td><td>${row.nombre}</td><td>${row.jugados}</td><td>${row.ganados}</td><td>${row.perdidos}</td><td>${row.setsFavor}-${row.setsContra}</td><td>${row.puntosClasificacion}</td></tr>`).join('');
    const knockoutList = phaseMatches.length ? `<section class="schedule-day"><header><div><span class="calendar-chip">ELIMINATORIAS</span><h4>Semifinales, tercer puesto y final</h4></div><strong>${phaseMatches.length} partidos</strong></header><div class="schedule-match-list">${phaseMatches.map(match => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.fecha || 'Fecha pendiente'}${match.cancha ? ` · ${match.cancha}` : ''}</span></div><div class="schedule-match-main"><div><span class="schedule-stage">${PHASE_LABELS[match.phase]}</span><strong>${teamName(match.equipoLocalId)} <b>vs</b> ${teamName(match.equipoVisitanteId)}</strong></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${scoreLabel(match)}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`).join('')}</div></section>` : '';

    const laterInfo = '<p class="helper-text">Las semifinales se crean con el botón «Cerrar cruces y generar semifinales»; la final y el tercer puesto aparecen automáticamente cuando las semifinales estén finalizadas.</p>';
    controls.innerHTML = `<div class="form-title"><div><h3>${tournament.nombre} · ${category.nombre}</h3><p>Fase actual: <strong>${ALL_VS_ALL_PHASE_LABELS[phase] || phase}</strong>. ${guaranteed.mensaje}</p></div><span class="calendar-chip">${ALL_VS_ALL_PHASE_LABELS[phase] || phase}</span></div>${phase === 'ALL_VS_ALL' ? `<div class="form-actions"><button id="btn-proponer-cruces" class="btn-primary">Generar cruces automáticamente</button><button id="btn-cerrar-cruces" class="btn-secondary">Cerrar cruces y generar semifinales</button></div><div id="all-vs-all-preview"></div><details class="schedule-editor"><summary>+ Crear partido manual</summary><form id="manual-all-vs-all-form"><div class="form-grid"><label class="form-field">Equipo 1<select name="local" required><option value="">Seleccionar</option>${teamOptions}</select></label><label class="form-field">Equipo 2<select name="visitante" required><option value="">Seleccionar</option>${teamOptions}</select></label><label class="form-field">Fecha<select name="fecha" required><option value="">Seleccionar</option>${dateOptions}</select></label><label class="form-field">Hora<input name="hora" type="time" required></label><label class="form-field">Cancha<select name="cancha" required><option value="">Seleccionar</option>${courtOptions}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1"></label></div><p class="helper-text">Cualquier equipo de esta categoría puede enfrentarse: las zonas no restringen estos cruces. Si existe un antecedente, se pedirá confirmación para crear una revancha.</p><button class="btn-secondary" type="submit">Crear partido manual</button></form></details>` : laterInfo}`;
    container.innerHTML = `<section class="card standings-card"><div class="standings-head"><div><h3>Tabla general</h3><p>Incluye garantizados y cruces de todos contra todos; las zonas no la separan.</p></div><span class="calendar-chip">${table.length} EQUIPOS</span></div><div class="standings-table-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>Sets</th><th>Pts.</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><section class="schedule-board"><div class="schedule-board-head"><div><h3>Cruces — Todos contra todos</h3><p>${crosses.length} creados · ${pending.length} pendientes · ${crosses.length - pending.length} finalizados.</p></div><span class="calendar-chip">${pending.length} PENDIENTES</span></div><div class="schedule-match-list">${crossList}</div></section>${knockoutList}`;

    document.getElementById('btn-proponer-cruces')?.addEventListener('click', () => {
        try {
            const proposal = SchedulerService.proponerCrucesTodosContraTodos(tournamentId, categoryId);
            const preview = document.getElementById('all-vs-all-preview');
            if (!proposal.length) { preview.innerHTML = '<p class="helper-text">No quedan rivales disponibles sin repetir enfrentamientos.</p>'; return; }
            preview.innerHTML = `<section class="schedule-editor" open><h4>Cruces propuestos</h4><div class="draft-fixture-list">${proposal.map(pair => `<div class="draft-fixture-row"><strong>${pair.local.nombre} <b>vs</b> ${pair.visitante.nombre}</strong></div>`).join('')}</div><div class="form-actions"><button id="cancelar-cruces" type="button" class="btn-secondary">Cancelar</button><button id="confirmar-cruces" type="button" class="btn-primary">Confirmar cruces</button></div></section>`;
            document.getElementById('cancelar-cruces').addEventListener('click', () => { preview.innerHTML = ''; });
            document.getElementById('confirmar-cruces').addEventListener('click', () => {
                try { SchedulerService.crearCrucesTodosContraTodos(tournamentId, categoryId, proposal); initPlayoffsView(); } catch (error) { alert(error.message); }
            });
        } catch (error) { alert(error.message); }
    });
    document.getElementById('manual-all-vs-all-form')?.addEventListener('submit', event => {
        event.preventDefault();
        try {
            const values = new FormData(event.currentTarget);
            const local = values.get('local'); const visitante = values.get('visitante');
            const duplicate = SchedulerService.existeEnfrentamiento(tournamentId, categoryId, local, visitante);
            if (duplicate && !window.confirm('Estos equipos ya se enfrentaron. ¿Deseas crear igualmente un nuevo partido?')) return;
            SchedulerService.crearCruceManualTodosContraTodos(tournamentId, categoryId, local, visitante, { fecha: values.get('fecha'), hora: values.get('hora'), cancha: values.get('cancha'), orden: values.get('orden') }, duplicate);
            initPlayoffsView();
        } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-cerrar-cruces')?.addEventListener('click', () => {
        try { SchedulerService.cerrarCrucesTodosContraTodos(tournamentId, categoryId); PlayoffsService.generarSemifinales(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); }
    });
};

export function initPlayoffsView() {
    let tournamentId; try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list'); const controls = document.querySelector('#view-eliminatorias .panel-control'); const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; container.innerHTML = ''; return; }
    if (DataManager.getTournamentMethod(tournamentId) === 'all_vs_all') { renderAllVsAll(tournamentId, categoryId, controls, container); return; }
    const tournament = DataManager.getTournament(tournamentId); const category = DataManager.getCategory(categoryId); const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId); const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    const allowedPhases = ['TOP_16', 'TOP_8', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];
    let matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => allowedPhases.includes(match.phase));
    if (progress.ok && !matches.some(match => match.phase === 'TOP_16')) { try { PlayoffsService.generarTop16(tournamentId, categoryId); } catch { /* Las zonas pueden no estar cerradas todavía. */ } }
    try {
        let current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        const completed = phase => current.filter(match => match.phase === phase).length > 0 && current.filter(match => match.phase === phase).every(match => match.estado === 'finalizado');
        if (completed('TOP_16') && !current.some(match => match.phase === 'TOP_8')) PlayoffsService.generarTop8(tournamentId, categoryId);
        current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        if (completed('TOP_8') && !current.some(match => match.phase === 'SEMIFINAL')) PlayoffsService.generarTop4(tournamentId, categoryId);
        current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
        if (completed('SEMIFINAL') && !current.some(match => match.phase === 'FINAL')) PlayoffsService.generarFinal(tournamentId, categoryId);
    } catch { /* La vista sigue mostrando la última etapa válida mientras falta programar o cargar algo. */ }
    matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => allowedPhases.includes(match.phase));
    const groups = allowedPhases.map(phase => ({ phase, items: matches.filter(match => match.phase === phase) })).filter(group => group.items.length);
    controls.innerHTML = `<div class="form-title"><div><h3>${tournament.nombre} · ${category.nombre}</h3><p>Formato único: <strong>Partidos asegurados → Clasificación → Top 16 → Top 8 → Top 4 → Semifinales → Final</strong>. Todos los resultados se cargan por sets reales.</p><p>${progress.mensaje}</p></div><span class="calendar-chip">${progress.ok ? 'CLASIFICADOS' : 'ZONAS EN CURSO'}</span></div>`;
    container.innerHTML = groups.length ? groups.map(group => `<section class="schedule-day"><header><div><span class="calendar-chip">${PHASE_LABELS[group.phase].toUpperCase()}</span><h4>${PHASE_LABELS[group.phase]}</h4></div><strong>${group.items.length} partidos</strong></header><div class="schedule-match-list">${group.items.map(match => renderMatch(match, teams, matches)).join('')}</div></section>`).join('') : '<div class="empty-state">Los Octavos aparecerán automáticamente cuando finalicen los partidos de zona y se calculen las posiciones.</div>';
}
