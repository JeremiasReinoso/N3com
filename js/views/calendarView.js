import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { showToast } from '../ui/feedback.js';

let disposePeriodPicker = () => {};

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
        return `${total} ${total === 1 ? 'jornada seleccionada' : 'jornadas seleccionadas'}`;
    }
    if (fechaInicio) return `Inicio elegido: ${formatPeriodDate(fechaInicio)}. Ahora elegí el día de finalización.`;
    return '';
};

const periodFieldText = (fechaInicio, fechaFin) => (
    fechaInicio && fechaFin ? `${formatPeriodDate(fechaInicio)} → ${formatPeriodDate(fechaFin)}` : 'Elegí el período del torneo'
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
    disposePeriodPicker();
    disposePeriodPicker = () => {};
    if (!tournamentId) {
        view.innerHTML = '<div class="empty-state"><strong>Elegí un torneo</strong><p>Seleccioná un torneo desde Mis torneos para configurar las fechas de juego.</p></div>';
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
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">AJUSTES DEL TORNEO</span>
                <h1>Calendario y horarios</h1>
                <p>Definí el período de juego, la duración de los bloques y el horario de cada jornada.</p>
            </div>
            <div class="page-header-actions">
                <button type="button" id="btn-back-to-config" class="btn-secondary">← Volver a configuración</button>
            </div>
        </div>

        <section class="form-card panel-control">
            <form id="form-calendario" class="calendar-settings-form">
                <div class="form-grid calendar-settings-grid">
                    <div class="form-field tournament-period-field">
                        <span id="periodo-torneo-label">Período del torneo</span>
                        <button id="periodo-torneo" class="tournament-period-picker" type="button" aria-labelledby="periodo-torneo-label periodo-torneo-value" aria-haspopup="dialog" aria-expanded="false">
                            <span id="periodo-torneo-value" class="tournament-period-value">${periodFieldText(fechaInicio, fechaFin)}</span>
                            <span aria-hidden="true" style="color:var(--text-eyebrow);font-size:12px;">▾</span>
                        </button>
                        <section id="selector-periodo" class="range-calendar" role="dialog" aria-label="Selector de período del torneo" hidden>
                            <div class="range-calendar-header"><button id="mes-anterior" class="range-calendar-nav" type="button" aria-label="Mes anterior">‹</button><strong id="mes-periodo"></strong><button id="mes-siguiente" class="range-calendar-nav" type="button" aria-label="Mes siguiente">›</button></div>
                            <div class="range-calendar-weekdays" aria-hidden="true">${weekDays.map(day => `<span>${day}</span>`).join('')}</div>
                            <div id="dias-periodo" class="range-calendar-days"></div>
                            <p id="estado-selector-periodo" class="range-calendar-selection" aria-live="polite"></p>
                            <p class="range-calendar-legend"><span><i class="range-calendar-legend-boundary" aria-hidden="true"></i>Inicio / final</span><span><i class="range-calendar-legend-range" aria-hidden="true"></i>Días incluidos</span></p>
                            <div class="range-calendar-actions"><button id="borrar-periodo" class="btn-secondary btn-sm range-calendar-clear" type="button">Borrar selección</button></div>
                        </section>
                    </div>
                    <label class="form-field"><span>Horario desde</span><input id="hora-inicio" type="time" value="${defaultStart}" required></label>
                    <label class="form-field"><span>Hasta</span><input id="hora-fin" type="time" value="${defaultEnd}" required></label>
                    <label class="form-field"><span>Bloque (min)</span><input id="duracion-bloque" type="number" min="5" max="240" step="5" value="${settings.blockDuration}" required></label>
                    <label class="form-field"><span>Intervalo (min)</span><input id="intervalo-partidos" type="number" min="0" max="120" value="${settings.intervaloPartidos}" required></label>
                </div>
                <p id="periodo-torneo-resumen" class="tournament-period-summary" aria-live="polite">${periodSummary(fechaInicio, fechaFin)}</p>
                <div class="form-actions" style="margin-top: 16px;">
                    <button class="btn-primary" type="submit">Guardar calendario</button>
                </div>
            </form>
        </section>

        <div class="calendar-intro">
            <span class="chip-pill chip-blue">${daySchedules.length} JORNADA${daySchedules.length === 1 ? '' : 'S'}</span>
            <p>Ajustá opcionalmente el horario particular de cada día.</p>
        </div>

        <div id="calendario-grid" class="calendar-grid">${daySchedules.length ? daySchedules.map(({ fecha, inicio, fin }) => `
            <article class="calendar-day" aria-label="Disponibilidad del ${displayDate(fecha)}">
                <div class="calendar-day-header"><div><span>${fecha}</span><strong>${displayDate(fecha)}</strong></div><span class="calendar-day-status">JORNADA</span></div>
                <div class="calendar-day-content">
                    <div class="calendar-time-summary"><span>Disponibilidad</span><strong>${inicio} — ${fin}</strong></div>
                    <div class="calendar-hours">
                        <label>Desde<input class="horario-dia-inicio" data-fecha="${fecha}" type="time" value="${inicio}" required></label>
                        <label>Hasta<input class="horario-dia-fin" data-fecha="${fecha}" type="time" value="${fin}" required></label>
                    </div>
                </div>
            </article>`).join('') : '<div class="empty-state" style="grid-column:1/-1;"><strong>Sin fechas cargadas</strong><p>Elegí el primer y último día del torneo y presioná "Guardar calendario".</p></div>'}</div>`;

    view.querySelector('#btn-back-to-config')?.addEventListener('click', () => goToTournament(tournamentId, 'configuracion'));

    const periodPicker = view.querySelector('#periodo-torneo');
    const periodDialog = view.querySelector('#selector-periodo');
    const periodValue = view.querySelector('#periodo-torneo-value');
    const periodSummaryElement = view.querySelector('#periodo-torneo-resumen');
    const monthTitle = view.querySelector('#mes-periodo');
    const daysContainer = view.querySelector('#dias-periodo');
    const selectionStatus = view.querySelector('#estado-selector-periodo');
    const periodField = periodPicker.closest('.tournament-period-field');

    const renderPeriodPicker = () => {
        periodValue.textContent = periodFieldText(fechaInicio, fechaFin);
        periodSummaryElement.textContent = periodSummary(fechaInicio, fechaFin);
        monthTitle.textContent = monthLabel(visibleYear, visibleMonth);
        daysContainer.innerHTML = calendarDaysMarkup(visibleYear, visibleMonth, fechaInicio, fechaFin);
        selectionStatus.textContent = `Inicio: ${fechaInicio ? formatPeriodDate(fechaInicio) : '—'} · Fin: ${fechaFin ? formatPeriodDate(fechaFin) : 'elegí la fecha final'}`;
    };
    const positionPicker = () => {
        if (periodDialog.hidden) return;
        const margin = 12;
        const gap = 10;
        const triggerBounds = periodPicker.getBoundingClientRect();
        const dialogBounds = periodDialog.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight;
        const spaceAbove = triggerBounds.top - margin;
        const spaceBelow = viewportHeight - triggerBounds.bottom - margin;
        const preferredAbove = spaceAbove >= dialogBounds.height + gap;
        const preferredBelow = spaceBelow >= dialogBounds.height + gap;
        let top;
        if (preferredAbove || (!preferredBelow && spaceAbove >= spaceBelow)) top = triggerBounds.top - dialogBounds.height - gap;
        else top = triggerBounds.bottom + gap;
        top = Math.max(margin, Math.min(top, viewportHeight - dialogBounds.height - margin));
        const left = Math.max(margin, Math.min(triggerBounds.left, viewportWidth - dialogBounds.width - margin));
        periodDialog.style.top = `${top}px`;
        periodDialog.style.left = `${left}px`;
    };
    const setPickerOpen = open => {
        periodDialog.hidden = !open;
        periodPicker.setAttribute('aria-expanded', String(open));
        periodDialog.classList.toggle('is-open', open);
        if (!open) return;
        renderPeriodPicker();
        positionPicker();
        requestAnimationFrame(positionPicker);
    };
    const closeOnOutsideClick = event => {
        if (!periodDialog.isConnected) { disposePeriodPicker(); return; }
        if (!periodDialog.hidden && !periodField.contains(event.target)) setPickerOpen(false);
    };
    const repositionOnViewportChange = () => {
        if (!periodDialog.isConnected) { disposePeriodPicker(); return; }
        positionPicker();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('resize', repositionOnViewportChange);
    window.addEventListener('orientationchange', repositionOnViewportChange);
    window.addEventListener('scroll', repositionOnViewportChange, true);
    disposePeriodPicker = () => {
        document.removeEventListener('pointerdown', closeOnOutsideClick);
        window.removeEventListener('resize', repositionOnViewportChange);
        window.removeEventListener('orientationchange', repositionOnViewportChange);
        window.removeEventListener('scroll', repositionOnViewportChange, true);
    };

    periodPicker.addEventListener('click', () => setPickerOpen(periodDialog.hidden));
    view.querySelector('#mes-anterior').addEventListener('click', () => {
        if (visibleMonth === 0) { visibleYear -= 1; visibleMonth = 11; }
        else visibleMonth -= 1;
        renderPeriodPicker();
        positionPicker();
    });
    view.querySelector('#mes-siguiente').addEventListener('click', () => {
        if (visibleMonth === 11) { visibleYear += 1; visibleMonth = 0; }
        else visibleMonth += 1;
        renderPeriodPicker();
        positionPicker();
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
        else positionPicker();
    });
    view.querySelector('#borrar-periodo').addEventListener('click', () => {
        fechaInicio = '';
        fechaFin = '';
        renderPeriodPicker();
        positionPicker();
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
            if (!fechaInicio || !fechaFin) throw new Error('Elegí el primer y último día del torneo antes de guardar.');
            const saveCalendar = allowUsedDateRemoval => DataManager.setTournamentCalendar(
                tournamentId, fechaInicio, fechaFin,
                view.querySelector('#hora-inicio').value,
                view.querySelector('#hora-fin').value,
                schedules, { allowUsedDateRemoval }
            );
            try { saveCalendar(false); }
            catch (error) {
                if (error.code !== 'CALENDAR_DATE_IN_USE') throw error;
                const details = error.usage.map(item => `${displayDate(item.date)}: ${item.categoryNames.join(', ') || 'categoría sin nombre'} (${item.matchCount} partido${item.matchCount === 1 ? '' : 's'})`).join('\n');
                const confirmed = window.confirm(`${error.message}\n\n${details}\n\nLos partidos y la planificación se conservarán, pero quedarán señalados como fuera del calendario. ¿Querés continuar?`);
                if (!confirmed) return;
                saveCalendar(true);
            }
            DataManager.setTournamentSchedulingSettings(tournamentId, settings.duracionPartido, view.querySelector('#intervalo-partidos').value, view.querySelector('#duracion-bloque').value);
            showToast('Calendario y horarios guardados.', { type: 'success' });
            initCalendarView();
        } catch (error) {
            alert(error.message);
        }
    });
}
