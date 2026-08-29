import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

<<<<<<< Updated upstream
export function initCalendarView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const section = document.getElementById('view-calendario');
    const controls = section.querySelector('.panel-control');
    const grid = document.getElementById('calendario-grid');
    if (!tournamentId) {
        controls.innerHTML = '<p>Seleccione un torneo desde Torneos.</p>';
        grid.innerHTML = '';
=======
const displayDate = date => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00`));

export function initCalendarView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-calendario');
    if (!tournamentId) {
        view.innerHTML = '<h2>Calendario</h2><div class="empty-state">Seleccione un torneo desde Torneos para configurar las fechas de juego.</div>';
>>>>>>> Stashed changes
        return;
    }
    const tournament = DataManager.getTournament(tournamentId);
    const period = DataManager.getTournamentPeriod(tournamentId);
    const defaultStart = tournament.horaInicio || '09:00';
    const defaultEnd = tournament.horaFin || '21:00';
    const daySchedules = DataManager.getDaySchedules(tournamentId);
<<<<<<< Updated upstream
    controls.innerHTML = `
        <p>Defina el período y el horario predeterminado. Luego puede cambiar libremente la franja de cada día.</p>
        <label>Fecha de inicio <input id="fecha-inicio" type="date" value="${period?.startDate || ''}"></label>
        <label>Fecha de finalización <input id="fecha-fin" type="date" value="${period?.endDate || ''}"></label>
        <label>Horario predeterminado: desde <input id="hora-inicio" type="time" value="${defaultStart}"></label>
        <label>hasta <input id="hora-fin" type="time" value="${defaultEnd}"></label>
        <button id="guardar-periodo" class="btn-primary">Guardar calendario y horarios</button>`;
    grid.innerHTML = daySchedules.length ? `
        <p><strong>Disponibilidad por día</strong></p>
        ${daySchedules.map(({ fecha, inicio, fin }) => `<article class="card"><strong>${fecha}</strong><label> Desde <input class="horario-dia-inicio" data-fecha="${fecha}" type="time" value="${inicio}"></label><label> Hasta <input class="horario-dia-fin" data-fecha="${fecha}" type="time" value="${fin}"></label></article>`).join('')}`
        : '<p>Guarde el período para configurar los horarios particulares de cada día.</p>';
    document.getElementById('guardar-periodo').addEventListener('click', () => {
        const schedules = daySchedules.map(({ fecha }) => ({
            fecha,
            inicio: document.querySelector(`.horario-dia-inicio[data-fecha="${fecha}"]`)?.value,
            fin: document.querySelector(`.horario-dia-fin[data-fecha="${fecha}"]`)?.value
=======
    view.innerHTML = `
        <h2>Calendario del torneo</h2>
        <section class="form-card panel-control">
            <div class="form-title"><div><h3>Disponibilidad general</h3><p>Definí el período; cada fecha tendrá su propio horario editable.</p></div><span class="calendar-chip">${tournament.nombre}</span></div>
            <form id="form-calendario" class="form-grid">
                <label class="form-field">Fecha de inicio<input id="fecha-inicio" type="date" value="${period?.startDate || ''}" required></label>
                <label class="form-field">Fecha de finalización<input id="fecha-fin" type="date" value="${period?.endDate || ''}" required></label>
                <label class="form-field">Horario predeterminado · desde<input id="hora-inicio" type="time" value="${defaultStart}" required></label>
                <label class="form-field">Hasta<input id="hora-fin" type="time" value="${defaultEnd}" required></label>
                <div class="form-actions"><button class="btn-primary" type="submit">Guardar calendario</button></div>
            </form>
        </section>
        <div class="calendar-intro"><span class="calendar-chip">${daySchedules.length} DÍAS</span><p>Los horarios por día se usan para distribuir y programar los partidos.</p></div>
        <div id="calendario-grid" class="calendar-grid">${daySchedules.length ? daySchedules.map(({ fecha, inicio, fin }) => `
            <article class="calendar-day">
                <div class="calendar-day-header"><span>${fecha}</span><strong>${displayDate(fecha)}</strong></div>
                <div class="calendar-day-content"><span class="calendar-chip">Disponibilidad</span><div class="calendar-hours">
                    <label>Desde<input class="horario-dia-inicio" data-fecha="${fecha}" type="time" value="${inicio}" required></label>
                    <label>Hasta<input class="horario-dia-fin" data-fecha="${fecha}" type="time" value="${fin}" required></label>
                </div></div>
            </article>`).join('') : '<div class="empty-state">Guardá las fechas de inicio y finalización para ver los días disponibles.</div>'}</div>`;
    view.querySelector('#form-calendario').addEventListener('submit', event => {
        event.preventDefault();
        const schedules = daySchedules.map(({ fecha }) => ({
            fecha,
            inicio: view.querySelector(`.horario-dia-inicio[data-fecha="${fecha}"]`)?.value,
            fin: view.querySelector(`.horario-dia-fin[data-fecha="${fecha}"]`)?.value
>>>>>>> Stashed changes
        })).filter(schedule => schedule.inicio && schedule.fin);
        try {
            DataManager.setTournamentCalendar(
                tournamentId,
<<<<<<< Updated upstream
                document.getElementById('fecha-inicio').value,
                document.getElementById('fecha-fin').value,
                document.getElementById('hora-inicio').value,
                document.getElementById('hora-fin').value,
=======
                view.querySelector('#fecha-inicio').value,
                view.querySelector('#fecha-fin').value,
                view.querySelector('#hora-inicio').value,
                view.querySelector('#hora-fin').value,
>>>>>>> Stashed changes
                schedules
            );
            const categoryId = AppState.getCategory();
            if (categoryId) SchedulerService.redistribuirFechas(tournamentId, categoryId);
            initCalendarView();
        } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-guardar-calendario').style.display = 'none';
}
