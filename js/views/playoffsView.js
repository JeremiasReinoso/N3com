import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { SchedulerService } from '../services/scheduler.js';

const PHASE_LABELS = { TOP_16: 'Top 16 → Top 8', TOP_8: 'Top 8 → Top 4', SEMIFINAL: 'Semifinales', THIRD_PLACE: 'Tercer puesto', FINAL: 'Final' };

export function initPlayoffsView() {
    let tournamentId; try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list'); const controls = document.querySelector('#view-eliminatorias .panel-control'); const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; container.innerHTML = ''; return; }
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId); const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo';
    const progress = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => PHASE_LABELS[match.phase]);
    const courts = Array.from({ length: DataManager.getTournamentCourtCount(tournamentId) }, (_, index) => `Cancha ${index + 1}`);
    const teamOptions = teams.map(item => `<option value="${item.id}">${item.nombre}</option>`).join('');
    const courtOptions = courts.map(court => `<option value="${court}">${court}</option>`).join('');
    controls.innerHTML = `<div class="form-title"><div><h3>Clasificación y eliminatorias</h3><p>${progress.mensaje}</p></div><span class="calendar-chip">${progress.ok ? 'FASE COMPLETA' : 'EN CURSO'}</span></div><div class="form-actions"><button id="btn-top16" class="btn-primary">Generar Top 16</button><button id="btn-top8" class="btn-secondary">Generar Top 8</button><button id="btn-semis" class="btn-secondary">Generar semifinales</button><button id="btn-finales" class="btn-primary">Generar final y tercer puesto</button></div><details class="schedule-editor"><summary>Agregar cruce manual eliminatorio</summary><form id="manual-playoff-form"><div class="form-grid"><label class="form-field">Etapa<select name="phase"><option value="TOP_16">Top 16</option><option value="TOP_8">Top 8</option><option value="SEMIFINAL">Semifinal</option><option value="THIRD_PLACE">Tercer puesto</option><option value="FINAL">Final</option></select></label><label class="form-field">Local<select name="local">${teamOptions}</select></label><label class="form-field">Visitante<select name="visitante">${teamOptions}</select></label><label class="form-field">Día<input name="fecha" type="date"></label><label class="form-field">Hora<input name="hora" type="time"></label><label class="form-field">Cancha<select name="cancha"><option value="">Sugerir automáticamente</option>${courtOptions}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1" placeholder="Ej.: 1"></label></div><p class="helper-text">El sistema sólo acepta equipos clasificados para la etapa elegida. Luego puede completar los cruces restantes con el botón de esa etapa.</p><button class="btn-secondary" type="submit">Agregar partido manual</button></form></details>`;
    container.innerHTML = matches.length ? Object.keys(PHASE_LABELS).map(phase => {
        const phaseItems = matches.filter(match => match.phase === phase); if (!phaseItems.length) return '';
        return `<section class="schedule-day"><header><div><span class="calendar-chip">${phase}</span><h4>${PHASE_LABELS[phase]}</h4></div><strong>${phaseItems.length} partidos</strong></header><div class="schedule-match-list">${phaseItems.map(match => `<article class="schedule-match"><div class="schedule-match-time"><strong>${match.hora || 'Horario pendiente'}</strong><span>${match.cancha || 'Cancha por definir'}</span></div><div class="schedule-match-main"><div><strong>${team(match.equipoLocalId)} <b>vs</b> ${team(match.equipoVisitanteId)}</strong><span class="schedule-stage">${match.fecha || 'Fecha pendiente'}</span></div>${match.estado === 'finalizado' ? `<span class="schedule-score">${match.setsLocal} – ${match.setsVisitante}</span>` : '<span class="match-status pending">PENDIENTE</span>'}</div></article>`).join('')}</div></section>`;
    }).join('') : '<div class="empty-state">La llave aparecerá cuando la fase clasificatoria esté completada.</div>';
    const bind = (id, action) => document.getElementById(id).addEventListener('click', () => { try { action(); initPlayoffsView(); } catch (error) { alert(error.message); } });
    bind('btn-top16', () => PlayoffsService.generarTop16(tournamentId, categoryId)); bind('btn-top8', () => PlayoffsService.generarTop8(tournamentId, categoryId)); bind('btn-semis', () => PlayoffsService.generarSemifinales(tournamentId, categoryId)); bind('btn-finales', () => PlayoffsService.generarFinales(tournamentId, categoryId));
    document.getElementById('manual-playoff-form').addEventListener('submit', event => {
        event.preventDefault();
        try {
            const values = new FormData(event.currentTarget);
            PlayoffsService.crearPartidoManual(tournamentId, categoryId, values.get('phase'), values.get('local'), values.get('visitante'), { fecha: values.get('fecha'), hora: values.get('hora'), cancha: values.get('cancha'), orden: values.get('orden') });
            initPlayoffsView();
        } catch (error) { alert(error.message); }
    });
}
