import { AppState } from '../core/state.js';
import { DataManager, PLANNING_STAGES } from '../data/dataManager.js';
import { PLANNING_STAGE_DEFINITIONS } from '../domain/tournamentStages.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { showToast } from '../ui/feedback.js';

export const PLANNING_STAGE_OPTIONS = PLANNING_STAGE_DEFINITIONS
    .filter(({ id }) => id !== PLANNING_STAGES.TOP_4)
    .map(({ id, label }) => [id, label]);

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const capFirst = str => str ? str[0].toUpperCase() + str.slice(1) : '';
const formatShortDay = date => {
    const d = new Date(`${date}T12:00:00`);
    const weekday = capFirst(new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(d));
    return `${weekday} ${d.getDate()}`;
};
const formatDay = date => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })
    .format(new Date(`${date}T12:00:00`));

const isOfficial = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);
const matchesStage = (match, stages) => stages.some(stage => (
    stage === PLANNING_STAGES.GUARANTEED ? match.phase === 'ZONAS'
        : stage === PLANNING_STAGES.FINAL ? match.phase === 'FINAL'
            : match.phase === stage
));
const dayStatus = (stages, matches) => {
    if (!stages.length) return ['unconfigured', 'Sin configurar'];
    const relevant = matches.filter(match => matchesStage(match, stages));
    if (!relevant.length || relevant.some(match => !isOfficial(match))) return ['pending', 'Emparejamientos pendientes'];
    if (relevant.every(match => match.estado === 'finalizado')) return ['closed', 'Fixture confirmado'];
    if (relevant.every(isOfficial)) return ['confirmed', 'Fixture confirmado'];
    return ['configured', 'Configurada'];
};

export const initPlanningView = () => {
    const view = document.getElementById('view-planificacion');
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const categoryId = AppState.getCategory();
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    const category = categoryId ? DataManager.getCategory(categoryId) : null;
    if (!tournament || !category || category.torneoId !== tournamentId) {
        view.innerHTML = '<div class="empty-state"><strong>Elegí una categoría</strong><p>Seleccioná un torneo y una categoría desde Equipos para planificar sus jornadas.</p></div>';
        return;
    }

    const dates = DataManager.getCalendarDates(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, categoryId);
    const byDate = new Map((planning?.days || []).map(day => [day.date, day.stages]));
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const unavailableDays = (planning?.days || []).filter(day => !dates.includes(day.date) && day.stages.length);

    if (!dates.length) {
        view.innerHTML = `
            <div class="planning-heading page-header">
                <div class="page-header-main">
                    <span class="eyebrow page-eyebrow">PLANIFICACIÓN POR CATEGORÍA · ${escapeHtml(category.nombre.toUpperCase())}</span>
                    <h1>Qué se juega cada día</h1>
                    <p>Elegí las etapas de cada jornada. Guardar no crea ni borra partidos.</p>
                </div>
            </div>
            <div class="empty-state">
                <strong>Primero definí los días del torneo</strong>
                <p>Configurá el período de juego en Calendario para habilitar las tarjetas por jornada.</p>
                <button type="button" class="btn-primary" id="btn-planning-go-calendar">Configurar calendario</button>
            </div>`;
        view.querySelector('#btn-planning-go-calendar')?.addEventListener('click', () => goToTournament(tournamentId, 'calendario'));
        return;
    }

    view.innerHTML = `
        <div class="planning-heading page-header">
            <div class="page-header-main">
                <span class="eyebrow page-eyebrow">PLANIFICACIÓN POR CATEGORÍA · ${escapeHtml(category.nombre.toUpperCase())}</span>
                <h1>Qué se juega cada día</h1>
                <p>Elegí las etapas de cada jornada. Guardar no crea ni borra partidos.</p>
            </div>
            <div class="page-header-actions">
                <button id="configure-next-day" class="btn-secondary" type="button">+ Configurar jornada</button>
            </div>
        </div>
        ${unavailableDays.length ? `<div class="planning-warning"><strong>Atención:</strong> hay jornadas fuera del calendario actual (${unavailableDays.map(day => formatDay(day.date)).join(', ')}). Se conservarán sin modificar hasta que vuelvas a habilitar esas fechas.</div>` : ''}
        <form id="category-planning-form">
            <div class="planning-days">${dates.map(date => {
                const stages = byDate.get(date) || [];
                const [statusClass, statusLabel] = dayStatus(stages, matches.filter(match => match.fecha === date));
                return `
                    <fieldset class="planning-day" data-date="${escapeHtml(date)}">
                        <legend>
                            <span>${escapeHtml(formatShortDay(date))}</span>
                            <small>${escapeHtml(date.split('-').reverse().join('/'))}</small>
                        </legend>
                        <span class="planning-status ${statusClass}">${escapeHtml(statusLabel)}</span>
                        <div class="planning-stage-grid">
                            ${PLANNING_STAGE_OPTIONS.map(([value, label]) => `
                                <label class="planning-stage">
                                    <input type="checkbox" name="${escapeHtml(date)}" value="${escapeHtml(value)}" ${stages.includes(value) ? 'checked' : ''}>
                                    <span>${escapeHtml(label)}</span>
                                </label>`).join('')}
                        </div>
                    </fieldset>`;
            }).join('')}</div>
            <div class="planning-actions">
                <button class="btn-primary" type="submit">Guardar planificación</button>
            </div>
        </form>`;

    const focusDay = fieldset => {
        fieldset?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        fieldset?.querySelector('input')?.focus();
        fieldset?.classList.add('is-editing');
    };
    view.querySelector('#configure-next-day').addEventListener('click', () => {
        focusDay([...view.querySelectorAll('.planning-day')].find(day => !day.querySelector('input:checked')) || view.querySelector('.planning-day'));
    });
    view.querySelector('#category-planning-form').addEventListener('submit', event => {
        event.preventDefault();
        try {
            const days = dates.map(date => ({
                date,
                stages: [...view.querySelectorAll(`input[name="${date}"]:checked`)].map(input => input.value)
            }));
            unavailableDays.forEach(day => days.push(day));
            DataManager.setCategoryPlanning(tournamentId, categoryId, days);
            showToast('Planificación guardada.', { type: 'success' });
            initPlanningView();
        } catch (error) {
            alert(error.message);
        }
    });
};
