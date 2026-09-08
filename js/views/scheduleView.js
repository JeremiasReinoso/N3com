import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);
const PHASE_LABELS = { ZONAS: 'Partidos asegurados', TOP_16: 'Top 16', TOP_8: 'Top 8', SEMIFINAL: 'Semifinal', THIRD_PLACE: 'Tercer puesto', FINAL: 'Final' };

export const initScheduleView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const box = document.getElementById('programacion-list');
    const controls = document.querySelector('#view-programacion .panel-control');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; box.innerHTML = '';
        return;
    }
    const tournament = DataManager.getTournament(tournamentId);
    const category = DataManager.getCategory(categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const drafts = matches.filter(match => !isOfficialMatch(match));
    const official = matches.filter(isOfficialMatch);
    const teamName = id => teams.find(team => team.id === id)?.nombre || 'Equipo eliminado';
    const zoneName = id => zones.find(zone => zone.id === id)?.nombre || 'Sin zona';
    const phaseName = match => PHASE_LABELS[match.phase] || match.nombreEtapa || `Ronda ${match.ronda || 1}`;
    const period = DataManager.getTournamentPeriod(tournamentId);
    const courtCount = DataManager.getTournamentCourtCount(tournamentId);
    const courts = Array.from({ length: courtCount }, (_, index) => `Cancha ${index + 1}`);
    const teamOptions = selected => teams.map(team => `<option value="${team.id}" ${team.id === selected ? 'selected' : ''}>${team.nombre}</option>`).join('');
    const courtOptions = selected => `<option value="">Sin asignar</option>${courts.map(court => `<option value="${court}" ${court === selected ? 'selected' : ''}>${court}</option>`).join('')}`;
    const dateAttrs = period ? `min="${period.startDate}" max="${period.endDate}"` : '';

    controls.innerHTML = `
        <div class="form-title"><div><h3>${tournament.nombre} · ${category.nombre}</h3><p>${tournament.partidos_asegurados} partidos asegurados por equipo. ${period ? `Período: ${period.startDate} a ${period.endDate}.` : 'Defina el período en Calendario antes de programar.'}</p></div><span class="calendar-chip">PROGRAMACIÓN</span></div>
        <div class="form-grid"><label class="form-field">Canchas disponibles<input id="cantidad-canchas" type="number" min="1" max="20" value="${courtCount}"></label>
        <div class="form-actions"><button type="button" id="guardar-canchas" class="btn-secondary">Guardar canchas</button><button type="button" id="btn-generar-emparejamientos" class="btn-primary">1. Generar fixture</button><button type="button" id="btn-recrear-emparejamientos" class="btn-secondary">Rehacer borradores</button><button type="button" id="btn-confirmar-emparejamientos" class="btn-primary">2. Confirmar</button><button type="button" id="btn-programar-emparejamientos" class="btn-primary">3. Programar</button></div></div>`;

    const editor = match => match.estado === 'finalizado' ? '' : `
        <details class="schedule-editor"><summary>Editar partido</summary>
            <form class="schedule-match-form" data-id="${match.id}">
                <div class="form-grid">
                    <label class="form-field">Local<select name="local" required>${teamOptions(match.equipoLocalId)}</select></label>
                    <label class="form-field">Visitante<select name="visitante" required>${teamOptions(match.equipoVisitanteId)}</select></label>
                    <label class="form-field">Día<input name="fecha" type="date" value="${match.fecha || ''}" ${dateAttrs}></label>
                    <label class="form-field">Horario<input name="hora" type="time" value="${match.hora || ''}"></label>
                    <label class="form-field">Cancha<select name="cancha">${courtOptions(match.cancha)}</select></label>
                    <label class="form-field">Orden<input name="orden" type="number" min="1" value="${match.orden || ''}" placeholder="Ej.: 1"></label>
                </div>
                <div class="form-actions"><button class="btn-primary" type="submit">Guardar cambios</button><button class="eliminar-partido btn-secondary" type="button" data-id="${match.id}">Eliminar</button></div>
            </form>
        </details>`;
    const draftHtml = drafts.length ? `<div class="draft-fixture-list">${drafts.map(match => `<div class="draft-fixture-row"><span>${phaseName(match)} · ${zoneName(match.zonaId)}</span><strong>${teamName(match.equipoLocalId)} <b>vs</b> ${teamName(match.equipoVisitanteId)}</strong><button type="button" class="eliminar-borrador btn-secondary" data-id="${match.id}">Quitar</button></div>`).join('')}</div>` : '<div class="empty-state">No hay borradores por revisar.</div>';
    const officialByDate = official.reduce((groups, match) => {
        const key = match.fecha || 'Sin fecha asignada';
        (groups.get(key) || groups.set(key, []).get(key)).push(match);
        return groups;
    }, new Map());
    const sortMatches = (left, right) => Number(left.orden || Number.MAX_SAFE_INTEGER) - Number(right.orden || Number.MAX_SAFE_INTEGER) || String(left.hora || '99:99').localeCompare(String(right.hora || '99:99')) || left.id.localeCompare(right.id);
    const officialHtml = officialByDate.size ? [...officialByDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dayMatches]) => `<section class="schedule-day"><header><div><span class="calendar-chip">${date === 'Sin fecha asignada' ? 'PENDIENTE' : 'JORNADA'}</span><h4>${date}</h4></div><strong>${dayMatches.length} partidos</strong></header><div class="schedule-match-list">${dayMatches.sort(sortMatches).map(match => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.cancha || 'Cancha por definir'}${match.orden ? ` · Orden ${match.orden}` : ''}</span></div><div class="schedule-match-main"><div><span class="schedule-stage">${phaseName(match)}${match.phase === 'ZONAS' ? ` · ${zoneName(match.zonaId)}` : ''}</span><strong>${teamName(match.equipoLocalId)} <b>vs</b> ${teamName(match.equipoVisitanteId)}</strong></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.setsLocal} – ${match.setsVisitante}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div>${editor(match)}</article>`).join('')}</div></section>`).join('') : '<div class="empty-state">Aún no hay partidos oficiales.</div>';
    box.innerHTML = `<section class="category-workspace"><h3>Borradores para revisar</h3><p class="helper-text">Los partidos asegurados sólo cruzan equipos de la misma zona. Las etapas eliminatorias son partidos nuevos y se distinguen por su fase.</p>${draftHtml}</section><section class="schedule-board"><div class="schedule-board-head"><div><h3>Partidos confirmados</h3><p>Use “Editar partido” para cambiar equipos, día, horario, cancha u orden antes de cargar un resultado.</p></div><span class="calendar-chip">${official.length} PARTIDOS</span></div>${officialHtml}</section>`;

    document.querySelectorAll('.eliminar-borrador, .eliminar-partido').forEach(button => button.addEventListener('click', () => {
        try { DataManager.removeMatch(button.dataset.id); initScheduleView(); } catch (error) { alert(error.message); }
    }));
    document.querySelectorAll('.schedule-match-form').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault();
        try {
            const current = matches.find(match => match.id === form.dataset.id);
            const values = new FormData(form);
            DataManager.updateMatches([{ ...current, equipoLocalId: values.get('local'), equipoVisitanteId: values.get('visitante'), fecha: values.get('fecha') || null, hora: values.get('hora') || null, cancha: values.get('cancha') || null, orden: values.get('orden') ? Number(values.get('orden')) : null }]);
            initScheduleView();
        } catch (error) { alert(error.message); }
    }));
    document.getElementById('guardar-canchas').addEventListener('click', () => {
        try { DataManager.setTournamentCourtCount(tournamentId, document.getElementById('cantidad-canchas').value); initScheduleView(); } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-generar-emparejamientos').addEventListener('click', () => {
        try { const created = SchedulerService.generarEmparejamientos(tournamentId, categoryId); const check = SchedulerService.verificarPartidosAsegurados(tournamentId, categoryId); alert(`${created} borradores creados. ${check.mensaje}`); initScheduleView(); } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-recrear-emparejamientos').addEventListener('click', () => {
        if (!confirm('Se reemplazarán únicamente los borradores de esta categoría. ¿Desea continuar?')) return;
        try { const created = SchedulerService.recrearBorradores(tournamentId, categoryId); alert(`${created} borradores nuevos creados por rondas, sin repetir rivales.`); initScheduleView(); } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-confirmar-emparejamientos').addEventListener('click', () => {
        try { const check = SchedulerService.verificarPartidosAsegurados(tournamentId, categoryId); if (!check.ok) throw new Error(check.mensaje); const confirmed = SchedulerService.confirmarEmparejamientos(tournamentId, categoryId); alert(`${confirmed} partidos confirmados. Ya están disponibles en Resultados.`); initScheduleView(); } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-programar-emparejamientos').addEventListener('click', () => {
        try { DataManager.setTournamentCourtCount(tournamentId, document.getElementById('cantidad-canchas').value); alert(`${SchedulerService.programarEmparejamientos(tournamentId, categoryId)} partidos programados.`); initScheduleView(); } catch (error) { alert(error.message); }
    });
};
