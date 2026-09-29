import { AppState } from '../core/state.js';
import { DataManager, PLANNING_STAGES } from '../data/dataManager.js';

export const PLANNING_STAGE_OPTIONS = [
    [PLANNING_STAGES.ZONES, 'Fase de zonas'],
    [PLANNING_STAGES.GUARANTEED, 'Partidos garantizados'],
    [PLANNING_STAGES.CROSSES, 'Cruces'],
    [PLANNING_STAGES.ROUND_OF_16, 'Octavos'],
    [PLANNING_STAGES.QUARTERFINALS, 'Cuartos'],
    [PLANNING_STAGES.SEMIFINALS, 'Semifinales'],
    [PLANNING_STAGES.FINAL, 'Final']
];

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));
const formatDay = date => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })
    .format(new Date(`${date}T12:00:00`));
const isOfficial = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);
const matchesStage = (match, stages) => stages.some(stage => (
    stage === PLANNING_STAGES.GUARANTEED ? match.phase === 'ZONAS'
        : stage === PLANNING_STAGES.FINAL ? ['FINAL', 'THIRD_PLACE'].includes(match.phase)
            : match.phase === stage
));
const dayStatus = (stages, matches) => {
    if (!stages.length) return ['unconfigured', 'Sin configurar'];
    const relevant = matches.filter(match => matchesStage(match, stages));
    if (!relevant.length || relevant.some(match => !isOfficial(match))) return ['pending', 'Emparejamientos pendientes'];
    if (relevant.every(match => match.estado === 'finalizado')) return ['closed', 'Jornada cerrada'];
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
        view.innerHTML = '<h2>Planificación de jornadas</h2><div class="empty-state">Seleccione un torneo y una categoría para configurar sus jornadas.</div>';
        return;
    }
    const dates = DataManager.getCalendarDates(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, categoryId);
    const byDate = new Map((planning?.days || []).map(day => [day.date, day.stages]));
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const unavailableDays = (planning?.days || []).filter(day => !dates.includes(day.date) && day.stages.length);
    if (!dates.length) {
        view.innerHTML = `<h2>Planificación de jornadas</h2><div class="empty-state"><strong>${escapeHtml(category.nombre)}</strong><p>Primero configurá los días disponibles en Calendario.</p></div>`;
        return;
    }
    view.innerHTML = `
        <div class="planning-heading"><div><span class="eyebrow">PLANIFICACIÓN POR CATEGORÍA</span><h2>Planificación — ${escapeHtml(category.nombre)}</h2><p>El calendario define los días disponibles. Aquí decidís qué etapas se jugarán en cada jornada; guardar no crea ni elimina partidos.</p></div><button id="configure-next-day" class="btn-primary" type="button">+ Configurar jornada</button></div>
        ${!planning ? '<div class="planning-notice">Esta categoría todavía no tiene una planificación configurada.</div>' : ''}
        ${unavailableDays.length ? `<div class="planning-warning"><strong>Atención:</strong> hay jornadas fuera del calendario actual (${unavailableDays.map(day => formatDay(day.date)).join(', ')}). Se conservarán sin modificar hasta que vuelvas a habilitar esas fechas o resuelvas el conflicto.</div>` : ''}
        <form id="category-planning-form">
            <div class="planning-days">${dates.map(date => {
                const stages = byDate.get(date) || [];
                const [statusClass, statusLabel] = dayStatus(stages, matches.filter(match => match.fecha === date));
                return `<fieldset class="planning-day" data-date="${date}"><legend><span>${escapeHtml(formatDay(date))}</span><small>${date.split('-').reverse().join('/')}</small></legend><span class="planning-status ${statusClass}">${statusLabel}</span><div class="planning-stage-grid">${PLANNING_STAGE_OPTIONS.map(([value, label]) => `<label class="planning-stage"><input type="checkbox" name="${date}" value="${value}" ${stages.includes(value) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><button class="btn-secondary edit-planning-day" type="button">Editar jornada</button></fieldset>`;
            }).join('')}</div>
            <div class="planning-actions"><p>Podés seleccionar varias etapas por día y modificar esta configuración más adelante sin perder partidos.</p><button class="btn-primary btn-large" type="submit">Guardar planificación</button></div>
        </form>`;

    const focusDay = fieldset => {
        fieldset?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        fieldset?.querySelector('input')?.focus();
        fieldset?.classList.add('is-editing');
    };
    view.querySelector('#configure-next-day').addEventListener('click', () => focusDay([...view.querySelectorAll('.planning-day')].find(day => !day.querySelector('input:checked')) || view.querySelector('.planning-day')));
    view.querySelectorAll('.edit-planning-day').forEach(button => button.addEventListener('click', () => focusDay(button.closest('.planning-day'))));
    view.querySelector('#category-planning-form').addEventListener('submit', event => {
        event.preventDefault();
        try {
            const days = dates.map(date => ({ date, stages: [...view.querySelectorAll(`input[name="${date}"]:checked`)].map(input => input.value) }));
            unavailableDays.forEach(day => days.push(day));
            DataManager.setCategoryPlanning(tournamentId, categoryId, days);
            initPlanningView();
        } catch (error) { alert(error.message); }
    });
};
