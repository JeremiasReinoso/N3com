import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { TOURNAMENT_STAGES, TOURNAMENT_STAGE_LABELS, stageFromMatchPhase, normalizeTournamentStage } from '../domain/tournamentStages.js';

export const PLANNING_STAGE_OPTIONS = TOURNAMENT_STAGES.map(stage => [stage, TOURNAMENT_STAGE_LABELS[stage]]);
const STAGE_SHORT_LABELS = Object.freeze({ fase_zonas: 'Zonas', partidos_garantizados: 'Garantizados', octavos: 'Octavos', cuartos: 'Cuartos', semifinales: 'Semis', final: 'Final' });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatDay = date => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${date}T12:00:00`));
const dayName = date => new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(new Date(`${date}T12:00:00`));
const dateLabel = date => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`)).replace('.', '').toUpperCase();
const isOfficial = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);
const matchesStage = (match, stages) => stages.some(stage => {
    const normalizedStage = normalizeTournamentStage(stage);
    const matchStage = stageFromMatchPhase(match.phase);
    return normalizedStage === matchStage || (matchStage === 'fase_zonas' && normalizedStage === 'partidos_garantizados');
});
const statusForDay = (stages, matches, categoryCount) => {
    if (!stages.length && !categoryCount) return ['unconfigured', 'Sin configurar', '○'];
    const relevant = matches.filter(match => matchesStage(match, stages));
    if (stages.length && (!relevant.length || relevant.some(match => !isOfficial(match)))) return ['pending', 'Emparejamientos pendientes', '⚠'];
    if (relevant.length && relevant.every(match => match.estado === 'finalizado')) return ['closed', 'Jornada completada', '✓'];
    if (relevant.length && relevant.every(isOfficial)) return ['confirmed', 'Jornada configurada', '✓'];
    return ['configured', 'Jornada configurada', '●'];
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
    const categories = DataManager.getCategoriesByTournament(tournamentId);
    const activePlanning = DataManager.getActivePlanning(tournamentId);
    const categoryPlanning = DataManager.getCategoryPlanning(tournamentId, categoryId);
    const byDate = new Map((categoryPlanning?.days || []).map(day => [day.date, day.stages]));
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const unavailableDays = (categoryPlanning?.days || []).filter(day => !dates.includes(day.date) && day.stages.length);
    if (!dates.length) {
        view.innerHTML = `<h2>Planificación de jornadas</h2><div class="empty-state"><strong>${escapeHtml(category.nombre)}</strong><p>Primero configurá los días disponibles en Calendario.</p></div>`;
        return;
    }

    const selectedCategories = new Set(activePlanning?.selectedCategories || [categoryId]);
    const draftCategoryDates = Object.fromEntries(categories.map(item => [item.id, [...(activePlanning?.categoryDates?.[item.id] || [])]]));
    if (!activePlanning && categoryPlanning) draftCategoryDates[categoryId] = [...new Set(categoryPlanning.days.filter(day => day.stages.length).map(day => day.date))];
    const draftStages = Object.fromEntries(dates.map(date => [date, [...(byDate.get(date) || [])]]));
    let dirty = false;
    let editingDate = null;
    let editorSnapshot = null;

    const categoriesForDate = date => categories.filter(item => (draftCategoryDates[item.id] || []).includes(date));
    const selectedStageCount = () => dates.reduce((total, date) => total + draftStages[date].length, 0);
    const allMatchesForDate = date => matches.filter(match => match.fecha === date);
    const stagePill = (stage, selected) => `<span class="planning-stage-pill ${selected ? 'is-selected' : ''}"><span class="planning-stage-dot" aria-hidden="true">${selected ? '✓' : '○'}</span>${escapeHtml(STAGE_SHORT_LABELS[stage] || stage)}</span>`;
    const stageFlow = stages => `<div class="planning-stage-group"><span class="planning-stage-group-label">Fase inicial</span><div class="planning-stage-flow">${['fase_zonas', 'partidos_garantizados'].map(stage => stagePill(stage, stages.includes(stage))).join('<span class="planning-stage-connector" aria-hidden="true">→</span>')}</div></div><div class="planning-stage-group"><span class="planning-stage-group-label">Eliminatorias</span><div class="planning-stage-flow">${['octavos', 'cuartos', 'semifinales', 'final'].map(stage => stagePill(stage, stages.includes(stage))).join('<span class="planning-stage-connector" aria-hidden="true">→</span>')}</div></div>`;
    const dayCard = (date, index) => {
        const stages = draftStages[date] || [];
        const dayCategories = categoriesForDate(date);
        const [statusClass, statusLabel, statusIcon] = statusForDay(stages, allMatchesForDate(date), dayCategories.length);
        const isEmpty = !dayCategories.length && !stages.length;
        return `<article class="planning-day-card ${isEmpty ? 'is-empty' : ''}" data-date="${date}"><div class="planning-day-rail" aria-hidden="true"><span>${String(index + 1).padStart(2, '0')}</span><i></i></div><div class="planning-day-body"><header class="planning-day-header"><div><span class="planning-day-name">${escapeHtml(dayName(date))}</span><strong>${escapeHtml(dateLabel(date))}</strong></div><span class="planning-status ${statusClass}" role="status"><span aria-hidden="true">${statusIcon}</span>${statusLabel}</span></header>${isEmpty ? `<div class="planning-empty-state"><span class="planning-empty-icon" aria-hidden="true">＋</span><strong>Jornada sin configurar</strong><p>Elegí las categorías y etapas que competirán este día.</p></div>` : `<div class="planning-day-summary"><div class="planning-summary-block"><span class="planning-summary-label">Categorías</span><div class="planning-chip-row">${dayCategories.length ? dayCategories.map(item => `<span class="planning-category-chip"><span aria-hidden="true">✓</span>${escapeHtml(item.nombre)}</span>`).join('') : '<span class="planning-muted">Sin categorías asignadas</span>'}</div></div><div class="planning-summary-block"><span class="planning-summary-label">Recorrido de competición</span><div class="planning-stage-timeline">${stageFlow(stages)}</div></div></div>`}<button class="edit-planning-day planning-edit-button" type="button" data-date="${date}"><span>${isEmpty ? 'Configurar jornada' : 'Editar jornada'}</span><span aria-hidden="true">→</span></button></div></article>`;
    };

    view.innerHTML = `<div class="planning-page"><header class="planning-hero"><div class="planning-hero-copy"><span class="eyebrow">CALENDARIO DE COMPETICIÓN</span><h2>Planificación del torneo</h2><p>Organizá qué categorías y etapas se disputan en cada jornada.</p></div><button id="configure-next-day" class="btn-secondary planning-quick-action" type="button"><span aria-hidden="true">＋</span> Configurar próxima jornada</button></header>${!categoryPlanning && !activePlanning ? '<div class="planning-notice"><span aria-hidden="true">ⓘ</span><div><strong>Empezá por definir el recorrido</strong><p>Seleccioná las categorías, las fechas y las etapas que formarán parte de esta planificación.</p></div></div>' : ''}${unavailableDays.length ? `<div class="planning-warning" role="alert"><span aria-hidden="true">⚠</span><div><strong>Hay jornadas fuera del calendario actual</strong><p>Se conservarán sin modificar: ${unavailableDays.map(day => formatDay(day.date)).join(', ')}.</p></div></div>` : ''}<form id="category-planning-form" class="planning-form"><section class="planning-overview" aria-labelledby="planning-overview-title"><div class="planning-overview-head"><div><span class="planning-section-kicker">ALCANCE DE ESTA PLANIFICACIÓN</span><h3 id="planning-overview-title">Categorías activas</h3></div><span class="planning-summary-count" id="planning-summary-count"></span></div><div class="planning-category-selector" role="group" aria-label="Categorías incluidas">${categories.map(item => `<button class="planning-category-toggle ${selectedCategories.has(item.id) ? 'is-selected' : ''}" type="button" data-category-id="${item.id}" aria-pressed="${selectedCategories.has(item.id)}"><span class="planning-toggle-icon" aria-hidden="true">${selectedCategories.has(item.id) ? '✓' : '+'}</span><span>${escapeHtml(item.nombre)}</span></button>`).join('')}</div><p class="planning-helper">Las categorías seleccionadas comparten el fixture de esta planificación cuando coinciden en la misma fecha.</p></section><section class="planning-timeline-section" aria-labelledby="planning-timeline-title"><div class="planning-section-heading"><div><span class="planning-section-kicker">RECORRIDO DEL TORNEO</span><h3 id="planning-timeline-title">Jornadas</h3></div><span class="planning-section-hint">${dates.length} jornada${dates.length === 1 ? '' : 's'} disponibles</span></div><div class="planning-timeline" id="planning-timeline">${dates.map(dayCard).join('')}</div></section><div class="planning-action-bar" id="planning-action-bar"><div class="planning-save-state" aria-live="polite"><span class="planning-save-dot" aria-hidden="true"></span><span id="planning-save-label">Sin cambios pendientes</span></div><button class="btn-primary planning-save-button" id="save-planning" type="submit" disabled>Guardar planificación <span aria-hidden="true">→</span></button></div></form><div class="planning-drawer-backdrop" id="planning-drawer-backdrop" hidden></div><aside class="planning-drawer" id="planning-day-editor" role="dialog" aria-modal="true" aria-labelledby="planning-editor-title" aria-hidden="true" hidden><div class="planning-drawer-head"><div><span class="planning-section-kicker">EDITAR JORNADA</span><h3 id="planning-editor-title">Jornada</h3></div><button class="planning-drawer-close" id="close-planning-editor" type="button" aria-label="Cerrar editor">×</button></div><div class="planning-drawer-content" id="planning-editor-content"></div><div class="planning-drawer-actions"><button class="btn-secondary" id="cancel-planning-editor" type="button">Cancelar</button><button class="btn-primary" id="apply-planning-editor" type="button">Aplicar cambios</button></div></aside></div>`;

    const timeline = view.querySelector('#planning-timeline');
    const summaryCount = view.querySelector('#planning-summary-count');
    const saveButton = view.querySelector('#save-planning');
    const saveLabel = view.querySelector('#planning-save-label');
    const drawer = view.querySelector('#planning-day-editor');
    const backdrop = view.querySelector('#planning-drawer-backdrop');
    const editorContent = view.querySelector('#planning-editor-content');
    const selectedCategoryCount = () => selectedCategories.size;
    const refreshSummary = () => {
        const configuredDays = dates.filter(date => categoriesForDate(date).length || draftStages[date].length).length;
        summaryCount.textContent = `${configuredDays} jornada${configuredDays === 1 ? '' : 's'} · ${selectedCategoryCount()} categoría${selectedCategoryCount() === 1 ? '' : 's'} · ${selectedStageCount()} etapa${selectedStageCount() === 1 ? '' : 's'}`;
        saveButton.disabled = !dirty;
        saveLabel.textContent = dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes';
        view.querySelector('.planning-save-state')?.classList.toggle('is-dirty', dirty);
    };
    const renderTimeline = () => {
        timeline.innerHTML = dates.map(dayCard).join('');
        timeline.querySelectorAll('.planning-edit-button').forEach(button => button.addEventListener('click', () => openEditor(button.dataset.date)));
        refreshSummary();
    };
    const renderCategoryToggles = () => view.querySelectorAll('.planning-category-toggle').forEach(button => {
        const isSelected = selectedCategories.has(button.dataset.categoryId);
        button.classList.toggle('is-selected', isSelected); button.setAttribute('aria-pressed', String(isSelected));
        button.querySelector('.planning-toggle-icon').textContent = isSelected ? '✓' : '+';
    });
    const readEditor = () => {
        const date = editingDate;
        categories.forEach(item => {
            const input = editorContent.querySelector(`input[name="editor-category-${item.id}"]`);
            const current = new Set(draftCategoryDates[item.id] || []);
            if (input?.checked) current.add(date); else current.delete(date);
            draftCategoryDates[item.id] = [...current].sort();
            if (input?.checked) selectedCategories.add(item.id);
        });
        draftStages[date] = [...editorContent.querySelectorAll('input[name="editor-stage"]:checked')].map(input => input.value);
    };
    const closeEditor = ({ apply = false } = {}) => {
        if (apply) readEditor();
        else if (editorSnapshot) { Object.entries(editorSnapshot.dates).forEach(([id, value]) => { draftCategoryDates[id] = value; }); draftStages[editingDate] = editorSnapshot.stages; }
        drawer.hidden = true; drawer.setAttribute('aria-hidden', 'true'); backdrop.hidden = true; document.body.classList.remove('planning-drawer-open'); editorSnapshot = null; editingDate = null;
        if (apply) { dirty = true; renderCategoryToggles(); renderTimeline(); }
    };
    const openEditor = date => {
        editingDate = date;
        editorSnapshot = { dates: Object.fromEntries(categories.map(item => [item.id, [...(draftCategoryDates[item.id] || [])]])), stages: [...draftStages[date]] };
        const currentCategories = categoriesForDate(date);
        editorContent.innerHTML = `<div class="planning-editor-intro"><strong>${escapeHtml(formatDay(date))}</strong><p>Definí qué categorías y etapas ocurren en esta jornada.</p></div><section class="planning-editor-section"><span class="planning-editor-label">Categorías de esta jornada</span><div class="planning-editor-options">${categories.map(item => `<label class="planning-choice"><input type="checkbox" name="editor-category-${item.id}" value="${item.id}" ${currentCategories.some(selected => selected.id === item.id) ? 'checked' : ''}><span class="planning-choice-mark" aria-hidden="true">✓</span><span>${escapeHtml(item.nombre)}</span></label>`).join('')}</div></section><section class="planning-editor-section"><span class="planning-editor-label">Etapas del torneo</span><div class="planning-editor-stage-group"><span>Fase inicial</span><div class="planning-editor-options">${PLANNING_STAGE_OPTIONS.slice(0, 2).map(([value, label]) => `<label class="planning-choice"><input type="checkbox" name="editor-stage" value="${value}" ${draftStages[date].includes(value) ? 'checked' : ''}><span class="planning-choice-mark" aria-hidden="true">✓</span><span>${escapeHtml(label)}</span></label>`).join('')}</div></div><div class="planning-editor-stage-group"><span>Eliminatorias</span><div class="planning-editor-options">${PLANNING_STAGE_OPTIONS.slice(2).map(([value, label]) => `<label class="planning-choice"><input type="checkbox" name="editor-stage" value="${value}" ${draftStages[date].includes(value) ? 'checked' : ''}><span class="planning-choice-mark" aria-hidden="true">✓</span><span>${escapeHtml(label)}</span></label>`).join('')}</div></div></section>`;
        view.querySelector('#planning-editor-title').textContent = formatDay(date); drawer.hidden = false; drawer.setAttribute('aria-hidden', 'false'); backdrop.hidden = false; document.body.classList.add('planning-drawer-open'); drawer.querySelector('input')?.focus();
    };

    timeline.querySelectorAll('.planning-edit-button').forEach(button => button.addEventListener('click', () => openEditor(button.dataset.date)));
    view.querySelectorAll('.planning-category-toggle').forEach(button => button.addEventListener('click', () => {
        const id = button.dataset.categoryId;
        if (selectedCategories.has(id)) { selectedCategories.delete(id); draftCategoryDates[id] = []; } else selectedCategories.add(id);
        dirty = true; renderCategoryToggles(); renderTimeline();
    }));
    view.querySelector('#configure-next-day').addEventListener('click', () => openEditor(dates.find(date => !categoriesForDate(date).length && !draftStages[date].length) || dates[0]));
    view.querySelector('#apply-planning-editor').addEventListener('click', () => closeEditor({ apply: true }));
    view.querySelector('#cancel-planning-editor').addEventListener('click', () => closeEditor());
    view.querySelector('#close-planning-editor').addEventListener('click', () => closeEditor());
    backdrop.addEventListener('click', () => closeEditor());
    view.querySelector('#category-planning-form').addEventListener('submit', event => {
        event.preventDefault();
        try {
            if (editingDate) closeEditor({ apply: true });
            const selectedCategoryIds = [...selectedCategories];
            const categoryDates = Object.fromEntries(selectedCategoryIds.map(id => [id, draftCategoryDates[id] || []]));
            if (!selectedCategoryIds.length) throw new Error('Seleccione al menos una categoría para la planificación.');
            DataManager.setTournamentPlanning(tournamentId, { selectedCategories: selectedCategoryIds, categoryDates });
            const days = dates.map(date => ({ date, stages: draftStages[date] || [] }));
            unavailableDays.forEach(day => days.push(day));
            if (selectedCategoryIds.includes(categoryId)) DataManager.setCategoryPlanning(tournamentId, categoryId, days);
            initPlanningView();
            const toast = document.createElement('div');
            toast.className = 'planning-toast'; toast.setAttribute('role', 'status'); toast.innerHTML = '<span aria-hidden="true">✓</span> Planificación guardada';
            view.appendChild(toast); setTimeout(() => toast.remove(), 2600);
        } catch (error) { alert(error.message); }
    });
    refreshSummary();
};
