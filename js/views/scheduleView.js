import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);

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
    const period = DataManager.getTournamentPeriod(tournamentId);
    const courtCount = DataManager.getTournamentCourtCount(tournamentId);

    controls.innerHTML = `
        <div class="form-title"><div><h3>${tournament.nombre} · ${category.nombre}</h3><p>${tournament.partidos_asegurados} partidos por equipo. ${period ? `Período: ${period.startDate} a ${period.endDate}.` : 'Defina el período en Calendario antes de programar.'}</p></div><span class="calendar-chip">PROGRAMACIÓN</span></div>
        <div class="form-grid"><label class="form-field">Canchas disponibles<input id="cantidad-canchas" type="number" min="1" max="20" value="${courtCount}"></label>
        <div class="form-actions"><button id="guardar-canchas" class="btn-secondary">Guardar canchas</button><button id="btn-generar-emparejamientos" class="btn-primary">1. Generar fixture</button><button id="btn-confirmar-emparejamientos" class="btn-primary">2. Confirmar</button><button id="btn-programar-emparejamientos" class="btn-primary">3. Programar</button></div></div>`;

    const draftHtml = drafts.length ? drafts.map(match => `<li>${zoneName(match.zonaId)} · ${teamName(match.equipoLocalId)} vs ${teamName(match.equipoVisitanteId)} <button class="eliminar-borrador" data-id="${match.id}">Eliminar</button></li>`).join('') : '<li>No hay borradores por revisar.</li>';
    const officialHtml = official.length ? official.map(match => `<article class="card"><strong>${match.estado === 'finalizado' ? 'FINALIZADO' : 'PENDIENTE'}</strong><p>${match.fecha ? `${match.fecha} · ${match.hora} · ${match.cancha}` : 'Pendiente de programación: presione “3. Programar partidos confirmados”.'}</p><p>${zoneName(match.zonaId)} · ${teamName(match.equipoLocalId)} vs ${teamName(match.equipoVisitanteId)}</p>${match.estado === 'finalizado' ? `<p>Resultado: ${match.setsLocal}-${match.setsVisitante}</p>` : ''}</article>`).join('') : '<p>Aún no hay partidos oficiales.</p>';
    box.innerHTML = `<section class="category-workspace"><h3>Borradores para revisar</h3><p class="helper-text">Los borradores no aparecen en Resultados.</p><ul>${draftHtml}</ul></section><h3>Partidos confirmados</h3><div class="grid-cards">${officialHtml}</div>`;

    document.querySelectorAll('.eliminar-borrador').forEach(button => button.addEventListener('click', () => {
        try { DataManager.removeMatch(button.dataset.id); initScheduleView(); } catch (error) { alert(error.message); }
    }));
    document.getElementById('guardar-canchas').addEventListener('click', () => {
        try { DataManager.setTournamentCourtCount(tournamentId, document.getElementById('cantidad-canchas').value); initScheduleView(); } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-generar-emparejamientos').addEventListener('click', () => {
        try {
            const created = SchedulerService.generarEmparejamientos(tournamentId, categoryId);
            const check = SchedulerService.verificarPartidosAsegurados(tournamentId, categoryId);
            alert(`${created} borradores creados. ${check.mensaje}`);
            initScheduleView();
        } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-confirmar-emparejamientos').addEventListener('click', () => {
        try {
            const check = SchedulerService.verificarPartidosAsegurados(tournamentId, categoryId);
            if (!check.ok) throw new Error(check.mensaje);
            const confirmed = SchedulerService.confirmarEmparejamientos(tournamentId, categoryId);
            alert(`${confirmed} partidos confirmados. Ya están disponibles en Resultados.`);
            initScheduleView();
        } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-programar-emparejamientos').addEventListener('click', () => {
        try {
            DataManager.setTournamentCourtCount(tournamentId, document.getElementById('cantidad-canchas').value);
            alert(`${SchedulerService.programarEmparejamientos(tournamentId, categoryId)} partidos programados.`);
            initScheduleView();
        } catch (error) { alert(error.message); }
    });
};
