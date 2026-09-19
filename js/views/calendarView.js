import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

const displayDate = date => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00`));
const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const toIsoDate = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const formatPeriodDate = date => date ? date.split('-').reverse().join('/') : '';
const monthLabel = (year, month) => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month, 1));
const today = new Date();
const todayIso = toIsoDate(today.getFullYear(), today.getMonth(), today.getDate());
const selectedDays = (fechaInicio, fechaFin) => {
    if (!fechaInicio || !fechaFin) return 0;
    const [startYear, startMonth, startDay] = fechaInicio.split('-').map(Number);
    const [endYear, endMonth, endDay] = fechaFin.split('-').map(Number);
    return Math.floor((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86400000) + 1;
};

const periodSummary = (fechaInicio, fechaFin) => {
    if (fechaInicio && fechaFin) {
        const total = selectedDays(fechaInicio, fechaFin);
        return `${total} ${total === 1 ? 'día seleccionado' : 'días seleccionados'}`;
    }
    if (fechaInicio) return `Inicio seleccionado: ${formatPeriodDate(fechaInicio)}. Ahora seleccioná el día de finalización.`;
    return '';
};

const periodFieldText = (fechaInicio, fechaFin) => (
    fechaInicio && fechaFin ? `${formatPeriodDate(fechaInicio)} → ${formatPeriodDate(fechaFin)}` : 'Seleccionar período del torneo'
);

const calendarDaysMarkup = (year, month, fechaInicio, fechaFin) => {
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const blanks = Array.from({ length: firstDayOffset }, () => '<span class="range-calendar-blank" aria-hidden="true"></span>').join('');
    const days = Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const date = toIsoDate(year, month, day);
        const isStart = date === fechaInicio;
        const isEnd = date === fechaFin;
        const isInRange = fechaInicio && fechaFin && date > fechaInicio && date < fechaFin;
        const isToday = date === todayIso;
        const selected = isStart || isEnd;
        const state = [selected && 'is-boundary', isStart && 'is-start', isEnd && 'is-end', isInRange && 'is-in-range', isToday && 'is-today'].filter(Boolean).join(' ');
        const selectedText = isStart && isEnd ? ', inicio y final del período' : isStart ? ', inicio del período' : isEnd ? ', final del período' : isInRange ? ', dentro del período' : '';
        const todayText = isToday ? ', hoy' : '';
        return `<button class="range-calendar-day ${state}" type="button" data-date="${date}" aria-label="${formatPeriodDate(date)}${selectedText}${todayText}" aria-pressed="${selected}">${day}</button>`;
    }).join('');
    return `${blanks}${days}`;
};

export function initCalendarView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-calendario');
    if (!tournamentId) {
        view.innerHTML = '<h2>Calendario</h2><div class="empty-state">Seleccione un torneo desde Torneos para configurar las fechas de juego.</div>';
        return;
    }
    const tournament = DataManager.getTournament(tournamentId);
    const period = DataManager.getTournamentPeriod(tournamentId);
    const defaultStart = tournament.horaInicio || '09:00';
    const defaultEnd = tournament.horaFin || '21:00';
    const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
    const daySchedules = DataManager.getDaySchedules(tournamentId);
    let fechaInicio = period?.startDate || '';
    let fechaFin = period?.endDate || '';
    const initialMonth = fechaInicio ? new Date(`${fechaInicio}T12:00:00`) : new Date();
    let visibleYear = initialMonth.getFullYear();
    let visibleMonth = initialMonth.getMonth();
    view.innerHTML = `
        <h2>Calendario del torneo</h2>
        <section class="form-card panel-control">
            <div class="form-title"><div><h3>Disponibilidad general</h3><p>Definí el período; cada fecha tendrá su propio horario editable.</p></div><span class="calendar-chip">${tournament.nombre}</span></div>
            <form id="form-calendario" class="form-grid">
                <div class="form-field tournament-period-field">
                    <span id="periodo-torneo-label">Período del torneo</span>
                    <button id="periodo-torneo" class="tournament-period-picker" type="button" aria-labelledby="periodo-torneo-label periodo-torneo-value" aria-haspopup="dialog" aria-expanded="false">
                        <span id="periodo-torneo-value" class="tournament-period-value">${periodFieldText(fechaInicio, fechaFin)}</span><span class="tournament-period-icon" aria-hidden="true">📅</span>
                    </button>
                    <p id="periodo-torneo-resumen" class="tournament-period-summary" aria-live="polite">${periodSummary(fechaInicio, fechaFin)}</p>
                    <section id="selector-periodo" class="range-calendar" role="dialog" aria-label="Selector de período del torneo" hidden>
                        <div class="range-calendar-header"><button id="mes-anterior" class="range-calendar-nav" type="button" aria-label="Mes anterior">‹</button><strong id="mes-periodo"></strong><button id="mes-siguiente" class="range-calendar-nav" type="button" aria-label="Mes siguiente">›</button></div>
                        <div class="range-calendar-weekdays" aria-hidden="true">${weekDays.map(day => `<span>${day}</span>`).join('')}</div>
                        <div id="dias-periodo" class="range-calendar-days"></div>
                        <p class="range-calendar-legend"><span><i class="range-calendar-legend-boundary" aria-hidden="true"></i>Inicio / final</span><span><i class="range-calendar-legend-range" aria-hidden="true"></i>Días incluidos</span></p>
                        <div class="range-calendar-actions"><button id="borrar-periodo" class="btn-secondary range-calendar-clear" type="button">Borrar selección</button></div>
                    </section>
                </div>
                <label class="form-field">Horario predeterminado · desde<input id="hora-inicio" type="time" value="${defaultStart}" required></label>
                <label class="form-field">Hasta<input id="hora-fin" type="time" value="${defaultEnd}" required></label>
                <label class="form-field">Intervalo entre partidos (min)<input id="intervalo-partidos" type="number" min="0" max="120" value="${settings.intervaloPartidos}" required></label>
                <div class="form-actions"><button class="btn-primary" type="submit">Guardar calendario</button></div>
            </form>
        </section>
        <div class="calendar-intro"><span class="calendar-chip">${daySchedules.length} DÍAS</span><p>Personalizá el horario de cada jornada. Al confirmar el fixture, NEWCOM asignará automáticamente hora y cancha.</p></div>
        <div id="calendario-grid" class="calendar-grid">${daySchedules.length ? daySchedules.map(({ fecha, inicio, fin }) => `
            <article class="calendar-day" aria-label="Disponibilidad del ${displayDate(fecha)}">
                <div class="calendar-day-header"><div><span>${fecha}</span><strong>${displayDate(fecha)}</strong></div><span class="calendar-day-status">JORNADA</span></div>
                <div class="calendar-day-content"><div class="calendar-time-summary"><span>Disponibilidad</span><strong>${inicio} — ${fin}</strong></div><div class="calendar-hours">
                    <label>Desde<input class="horario-dia-inicio" data-fecha="${fecha}" type="time" value="${inicio}" required></label>
                    <label>Hasta<input class="horario-dia-fin" data-fecha="${fecha}" type="time" value="${fin}" required></label>
                </div></div>
            </article>`).join('') : '<div class="empty-state">Guardá las fechas de inicio y finalización para ver los días disponibles.</div>'}</div>`;

    const periodPicker = view.querySelector('#periodo-torneo');
    const periodDialog = view.querySelector('#selector-periodo');
    const periodValue = view.querySelector('#periodo-torneo-value');
    const periodSummaryElement = view.querySelector('#periodo-torneo-resumen');
    const monthTitle = view.querySelector('#mes-periodo');
    const daysContainer = view.querySelector('#dias-periodo');
    const renderPeriodPicker = () => {
        periodValue.textContent = periodFieldText(fechaInicio, fechaFin);
        periodSummaryElement.textContent = periodSummary(fechaInicio, fechaFin);
        monthTitle.textContent = monthLabel(visibleYear, visibleMonth);
        daysContainer.innerHTML = calendarDaysMarkup(visibleYear, visibleMonth, fechaInicio, fechaFin);
    };
    const setPickerOpen = open => {
        periodDialog.hidden = !open;
        periodPicker.setAttribute('aria-expanded', String(open));
        if (!open) return;
        renderPeriodPicker();
        const field = periodPicker.closest('.tournament-period-field');
        const dialogBounds = periodDialog.getBoundingClientRect();
        if (dialogBounds.bottom > window.innerHeight - 12 && periodPicker.getBoundingClientRect().top > dialogBounds.height + 12) field.dataset.pickerPosition = 'above';
        else delete field.dataset.pickerPosition;
    };

    periodPicker.addEventListener('click', () => setPickerOpen(periodDialog.hidden));
    view.addEventListener('click', event => {
        if (!periodPicker.closest('.tournament-period-field').contains(event.target)) setPickerOpen(false);
    });
    view.querySelector('#mes-anterior').addEventListener('click', () => {
        if (visibleMonth === 0) { visibleYear -= 1; visibleMonth = 11; }
        else visibleMonth -= 1;
        renderPeriodPicker();
    });
    view.querySelector('#mes-siguiente').addEventListener('click', () => {
        if (visibleMonth === 11) { visibleYear += 1; visibleMonth = 0; }
        else visibleMonth += 1;
        renderPeriodPicker();
    });
    daysContainer.addEventListener('click', event => {
        const day = event.target.closest('[data-date]');
        if (!day) return;
        const selectedDate = day.dataset.date;
        if (!fechaInicio || fechaFin) {
            fechaInicio = selectedDate;
            fechaFin = '';
        } else {
            [fechaInicio, fechaFin] = selectedDate < fechaInicio ? [selectedDate, fechaInicio] : [fechaInicio, selectedDate];
        }
        renderPeriodPicker();
        if (fechaInicio && fechaFin) setPickerOpen(false);
    });
    view.querySelector('#borrar-periodo').addEventListener('click', () => {
        fechaInicio = '';
        fechaFin = '';
        renderPeriodPicker();
    });
    periodDialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') { setPickerOpen(false); periodPicker.focus(); }
    });

    view.querySelector('#form-calendario').addEventListener('submit', event => {
        event.preventDefault();
        const schedules = daySchedules.map(({ fecha }) => ({
            fecha,
            inicio: view.querySelector(`.horario-dia-inicio[data-fecha="${fecha}"]`)?.value,
            fin: view.querySelector(`.horario-dia-fin[data-fecha="${fecha}"]`)?.value
        })).filter(schedule => schedule.inicio && schedule.fin);
        try {
            if (!fechaInicio || !fechaFin) throw new Error('Seleccioná el primer y último día del torneo antes de guardar.');
            DataManager.setTournamentCalendar(
                tournamentId,
                fechaInicio,
                fechaFin,
                view.querySelector('#hora-inicio').value,
                view.querySelector('#hora-fin').value,
                schedules
            );
            DataManager.setTournamentSchedulingSettings(tournamentId, settings.duracionPartido, view.querySelector('#intervalo-partidos').value);
            const categoryId = AppState.getCategory();
            if (categoryId) {
                const groupMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId)
                    .filter(match => !match.phase || match.phase === 'ZONAS');
                const allConfirmed = groupMatches.length && groupMatches.every(match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado));
                if (allConfirmed) SchedulerService.programarEmparejamientos(tournamentId, categoryId);
                else SchedulerService.redistribuirFechas(tournamentId, categoryId);
            }
            initCalendarView();
        } catch (error) { alert(error.message); }
    });
}
