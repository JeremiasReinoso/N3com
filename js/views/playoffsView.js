import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { SchedulerService } from '../services/scheduler.js';
import { PosicionesService } from '../services/standings.js';

const PHASE_LABELS = { TOP_16: 'Top 16 → Top 8', TOP_8: 'Top 8 → Top 4', SEMIFINAL: 'Semifinales', THIRD_PLACE: 'Tercer puesto', FINAL: 'Final' };

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
    const phase = SchedulerService.getTournamentPhase(tournamentId, categoryId);
    const guaranteed = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    const crosses = SchedulerService.getAllVsAllCrosses(tournamentId, categoryId);
    const pending = crosses.filter(match => match.estado !== 'finalizado');
    const table = PosicionesService.calcularPosiciones(tournamentId, categoryId);
    const teamName = id => teams.find(team => team.id === id)?.nombre || 'Equipo';
    const courts = DataManager.getTournamentCourts(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, categoryId);
    const plannedCrossDates = DataManager.getPlanningDatesForStage(tournamentId, categoryId, 'ALL_VS_ALL');
    const dates = planning ? plannedCrossDates : DataManager.getCalendarDates(tournamentId);
    const teamOptions = teams.map(team => `<option value="${team.id}">${team.nombre}</option>`).join('');
    const dateOptions = dates.map(date => `<option value="${date}">${date}</option>`).join('');
    const courtOptions = courts.map(court => `<option value="${court.name}">${court.name}</option>`).join('');
    const phaseMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId)
        .filter(match => ['SEMIFINAL', 'THIRD_PLACE', 'FINAL'].includes(match.phase));
    const crossList = crosses.length ? crosses.map(match => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.fecha || 'Fecha pendiente'}${match.cancha ? ` · ${match.cancha}` : ''}</span></div><div class="schedule-match-main"><div><strong>${teamName(match.equipoLocalId)} <b>vs</b> ${teamName(match.equipoVisitanteId)}</strong><span class="schedule-stage">${match.manual ? 'MANUAL' : 'AUTOMÁTICO'}</span></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.setsLocal} – ${match.setsVisitante}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`).join('') : '<div class="empty-state compact">Aún no hay cruces creados.</div>';
    const tableRows = table.map((row, index) => `<tr><td>${index + 1}</td><td>${row.nombre}</td><td>${row.jugados}</td><td>${row.ganados}</td><td>${row.perdidos}</td><td>${row.setsFavor}-${row.setsContra}</td><td>${row.puntosClasificacion}</td></tr>`).join('');
    const knockoutList = phaseMatches.length ? `<section class="schedule-day"><header><div><span class="calendar-chip">ELIMINATORIAS</span><h4>Semifinales y final</h4></div><strong>${phaseMatches.length} partidos</strong></header><div class="schedule-match-list">${phaseMatches.map(match => `<article class="schedule-match"><div class="schedule-match-main"><div><span class="schedule-stage">${PHASE_LABELS[match.phase]}</span><strong>${teamName(match.equipoLocalId)} <b>vs</b> ${teamName(match.equipoVisitanteId)}</strong></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.setsLocal} – ${match.setsVisitante}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`).join('')}</div></section>` : '';

    const laterManual = phase === 'SEMIFINALS' ? `<details class="schedule-editor"><summary>+ Crear semifinal manual</summary><form id="manual-all-vs-all-playoff-form"><div class="form-grid"><label class="form-field">Local<select name="local" required>${teamOptions}</select></label><label class="form-field">Visitante<select name="visitante" required>${teamOptions}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1"></label></div><p class="helper-text">Disponible mientras se completa la llave; sólo acepta los cuatro equipos clasificados y programa el partido con las reglas existentes.</p><button class="btn-secondary" type="submit">Crear semifinal manual</button></form></details>` : '<p class="helper-text">Los partidos manuales de garantizados se crean desde Programación. Durante los cruces libres se habilita el editor sin restricción de zona.</p>';
    controls.innerHTML = `<div class="form-title"><div><h3>${tournament.nombre} · ${category.nombre}</h3><p>Fase actual: <strong>${ALL_VS_ALL_PHASE_LABELS[phase]}</strong>. ${guaranteed.mensaje}</p></div><span class="calendar-chip">${ALL_VS_ALL_PHASE_LABELS[phase]}</span></div>${phase === 'ALL_VS_ALL' ? `<div class="form-actions"><button id="btn-proponer-cruces" class="btn-primary">Generar cruces automáticamente</button><button id="btn-cerrar-cruces" class="btn-secondary">Cerrar cruces y generar semifinales</button></div><div id="all-vs-all-preview"></div><details class="schedule-editor"><summary>+ Crear partido manual</summary><form id="manual-all-vs-all-form"><div class="form-grid"><label class="form-field">Equipo 1<select name="local" required><option value="">Seleccionar</option>${teamOptions}</select></label><label class="form-field">Equipo 2<select name="visitante" required><option value="">Seleccionar</option>${teamOptions}</select></label><label class="form-field">Fecha<select name="fecha" required><option value="">Seleccionar</option>${dateOptions}</select></label><label class="form-field">Hora<input name="hora" type="time" required></label><label class="form-field">Cancha<select name="cancha" required><option value="">Seleccionar</option>${courtOptions}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1"></label></div><p class="helper-text">Cualquier equipo de esta categoría puede enfrentarse: las zonas ya no restringen estos cruces. Si existe un antecedente, se solicitará confirmación para crear una revancha.</p><button class="btn-secondary" type="submit">Crear partido manual</button></form></details>` : laterManual}`;
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
    document.getElementById('manual-all-vs-all-playoff-form')?.addEventListener('submit', event => {
        event.preventDefault();
        try {
            const values = new FormData(event.currentTarget);
            PlayoffsService.crearPartidoManual(tournamentId, categoryId, 'SEMIFINAL', values.get('local'), values.get('visitante'), { orden: values.get('orden') });
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
    const byPoints = DataManager.getTournamentClassificationMode(tournamentId) === 'points';
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId); const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo';
    const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    const allowedPhases = byPoints ? Object.keys(PHASE_LABELS) : ['SEMIFINAL', 'THIRD_PLACE', 'FINAL'];
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => allowedPhases.includes(match.phase));
    const teamOptions = teams.map(item => `<option value="${item.id}">${item.nombre}</option>`).join('');
    const phaseOptions = byPoints ? '<option value="TOP_16">Top 16</option><option value="TOP_8">Top 8</option>' : '';
    controls.innerHTML = `<div class="form-title"><div><h3>Clasificación y eliminatorias</h3><p>${progress.mensaje} ${byPoints ? 'Formato por puntos: Top 16 → Top 8 → semifinales.' : 'Formato por sets ganados: los 4 mejores pasan directamente a semifinales.'}</p></div><span class="calendar-chip">${progress.ok ? 'FASE COMPLETA' : 'EN CURSO'}</span></div><div class="form-actions">${byPoints ? '<button id="btn-top16" class="btn-primary">Generar Top 16</button><button id="btn-top8" class="btn-secondary">Generar Top 8</button>' : ''}<button id="btn-semis" class="btn-secondary">Generar semifinales</button><button id="btn-finales" class="btn-primary">Generar final y tercer puesto</button></div><details class="schedule-editor"><summary>Agregar cruce manual eliminatorio</summary><form id="manual-playoff-form"><div class="form-grid"><label class="form-field">Etapa<select name="phase">${phaseOptions}<option value="SEMIFINAL">Semifinal</option><option value="THIRD_PLACE">Tercer puesto</option><option value="FINAL">Final</option></select></label><label class="form-field">Local<select name="local">${teamOptions}</select></label><label class="form-field">Visitante<select name="visitante">${teamOptions}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1" placeholder="Ej.: 1"></label></div><p class="helper-text">El sistema sólo acepta equipos clasificados para la etapa elegida y asigna automáticamente fecha, horario y cancha.</p><button class="btn-secondary" type="submit">Agregar partido manual</button></form></details>`;
    container.innerHTML = matches.length ? allowedPhases.map(phase => {
        const phaseItems = matches.filter(match => match.phase === phase); if (!phaseItems.length) return '';
        return `<section class="schedule-day"><header><div><span class="calendar-chip">${phase}</span><h4>${PHASE_LABELS[phase]}</h4></div><strong>${phaseItems.length} partidos</strong></header><div class="schedule-match-list">${phaseItems.map(match => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.cancha || 'Cancha por definir'}</span></div><div class="schedule-match-main"><div><strong>${team(match.equipoLocalId)} <b>vs</b> ${team(match.equipoVisitanteId)}</strong><span class="schedule-stage">${match.fecha || 'Fecha pendiente'}</span></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.setsLocal} – ${match.setsVisitante}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`).join('')}</div></section>`;
    }).join('') : '<div class="empty-state">La llave aparecerá cuando la fase clasificatoria esté completada.</div>';
    const bind = (id, action) => document.getElementById(id)?.addEventListener('click', () => { try { action(); initPlayoffsView(); } catch (error) { alert(error.message); } });
    if (byPoints) { bind('btn-top16', () => PlayoffsService.generarTop16(tournamentId, categoryId)); bind('btn-top8', () => PlayoffsService.generarTop8(tournamentId, categoryId)); }
    bind('btn-semis', () => PlayoffsService.generarSemifinales(tournamentId, categoryId)); bind('btn-finales', () => PlayoffsService.generarFinales(tournamentId, categoryId));
    document.getElementById('manual-playoff-form').addEventListener('submit', event => {
        event.preventDefault();
        try {
            const values = new FormData(event.currentTarget);
            PlayoffsService.crearPartidoManual(tournamentId, categoryId, values.get('phase'), values.get('local'), values.get('visitante'), { orden: values.get('orden') });
            initPlayoffsView();
        } catch (error) { alert(error.message); }
    });
}
