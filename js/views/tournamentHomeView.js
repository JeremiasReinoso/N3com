import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine, SchedulingEngine } from '../engine/index.js';
import { formatLabelFor } from './formatConfigurator.js';

const formatLongDateRange = dates => {
    if (!dates.length) return 'Fechas aún sin definir';
    try {
        const first = new Date(`${dates[0]}T12:00:00`);
        const last = new Date(`${dates.at(-1)}T12:00:00`);
        const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
        const monthYear = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(last);
        if (dates.length === 1) return `${first.getDate()} de ${monthYear}`;
        if (sameMonth) return `${first.getDate()} al ${last.getDate()} de ${monthYear}`;
        const fmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });
        return `${fmt.format(first)} al ${fmt.format(last)} de ${last.getFullYear()}`;
    } catch {
        return `${dates[0]} al ${dates.at(-1)}`;
    }
};

const nextActionForCategory = ({ teams, zones, needsZones, status }) => {
    if (teams < 2) return { label: 'Cargar equipos', section: 'equipos', priority: true };
    if (needsZones && zones < 1) return { label: 'Definir zonas', section: 'zonas', priority: true };
    if (status.officialMatches === 0) return { label: 'Generar partidos', section: 'programacion', priority: true };
    if (status.finishedMatches < status.officialMatches) return { label: 'Cargar resultados', section: 'resultados', priority: false };
    if (!status.completed) return { label: 'Definir eliminatorias', section: 'eliminatorias', priority: false };
    return { label: 'Ver posiciones', section: 'posiciones', priority: false };
};

export function initTournamentHomeView() {
    const view = document.getElementById('view-inicio');
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    if (!tournament) {
        view.innerHTML = '<div class="empty-state"><strong>Elegí un torneo</strong><p>Seleccioná un torneo desde Mis torneos para ver su panel general.</p></div>';
        return;
    }

    const categories = DataManager.getCategoriesByTournament(tournamentId);
    const courts = DataManager.getTournamentCourts(tournamentId);
    const dates = DataManager.getCalendarDates(tournamentId);
    const conflicts = SchedulingEngine.getConflicts(tournamentId);
    const totalTeams = categories.reduce((sum, cat) => sum + DataManager.getTeamsByTournamentAndCategory(tournamentId, cat.id).length, 0);
    const allMatches = categories.flatMap(cat => DataManager.getMatchesByTournamentAndCategory(tournamentId, cat.id));
    const officialMatches = allMatches.filter(m => m.confirmado || m.estado !== 'borrador');
    const scheduledMatches = officialMatches.filter(m => m.fecha && m.hora && m.cancha);
    const finishedMatches = officialMatches.filter(match => match.estado === 'finalizado');

    const zonesReady = categories.length > 0 && categories.every(cat => {
        const fmt = CompetitionEngine.getCategoryFormat(tournamentId, cat.id);
        const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, cat.id);
        const needsZones = fmt.definition.requiresZones || fmt.config.stages?.[0]?.type === 'ZONAS';
        if (!needsZones) return teams.length >= 2;
        const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, cat.id);
        return zones.length >= 1 && teams.length >= 2 && teams.every(t => Boolean(t.zonaId));
    });

    const steps = [
        {
            title: 'Calendario y canchas',
            promptTitle: 'Configurá el calendario y las canchas',
            promptDesc: 'Definí los días de juego, bloques horarios y canchas disponibles del torneo.',
            done: dates.length > 0 && courts.length > 0,
            detail: dates.length ? `${dates.length} jornada${dates.length === 1 ? '' : 's'} · ${courts.length} cancha${courts.length === 1 ? '' : 's'}` : 'Definí fechas y horarios',
            section: 'calendario'
        },
        {
            title: 'Categorías y equipos',
            promptTitle: 'Cargá las categorías y los equipos',
            promptDesc: 'Elegí las categorías participantes e inscribí los equipos de cada una.',
            done: categories.length > 0 && totalTeams >= 2,
            detail: categories.length ? `${categories.length} categoría${categories.length === 1 ? '' : 's'} · ${totalTeams} equipo${totalTeams === 1 ? '' : 's'}` : 'Creá categorías e inscribí equipos',
            section: 'equipos'
        },
        {
            title: 'Modalidad y zonas',
            promptTitle: 'Definí la modalidad y las zonas',
            promptDesc: 'Formato por categoría, sorteo de zonas y clasificación a eliminatorias.',
            done: zonesReady,
            detail: zonesReady ? 'Formatos y zonas completos' : 'Formato o sorteo de zonas',
            section: categories.length ? 'zonas' : 'equipos'
        },
        {
            title: 'Generar partidos',
            promptTitle: 'Generá y confirmá los partidos',
            promptDesc: 'Armá los emparejamientos de cada categoría y confirmalos en el fixture.',
            done: officialMatches.length > 0,
            detail: officialMatches.length ? `${officialMatches.length} partido${officialMatches.length === 1 ? '' : 's'} confirmado${officialMatches.length === 1 ? '' : 's'}` : 'Armá y confirmá emparejamientos',
            section: 'programacion'
        },
        {
            title: 'Horarios y canchas',
            promptTitle: 'Asigná horarios y canchas',
            promptDesc: 'Distribuí automáticamente los partidos confirmados en las canchas sin conflictos.',
            done: officialMatches.length > 0 && scheduledMatches.length === officialMatches.length && conflicts.length === 0,
            detail: conflicts.length ? `${conflicts.length} alerta${conflicts.length === 1 ? '' : 's'} por revisar` : (scheduledMatches.length ? 'Fixture sin conflictos' : 'Asigná días, horas y canchas'),
            section: 'programacion'
        },
        {
            title: 'Resultados y finales',
            promptTitle: 'Cargá los resultados y definí las llaves',
            promptDesc: 'Ingresá los sets de cada partido para actualizar posiciones y eliminatorias.',
            done: officialMatches.length > 0 && finishedMatches.length === officialMatches.length,
            detail: officialMatches.length ? `${finishedMatches.length} de ${officialMatches.length} jugados` : 'Cargá sets, tablas y finales',
            section: 'resultados'
        }
    ];

    const nextStepIndex = steps.findIndex(step => !step.done);
    const activeStepIdx = nextStepIndex >= 0 ? nextStepIndex : 5;
    const primaryStep = steps[activeStepIdx];

    let categoryBlueAssigned = false;

    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">${escapeHtml((tournament.organizacion || 'TORNEO ACTIVO').toUpperCase())}</span>
                <h1>${escapeHtml(tournament.nombre)}</h1>
                <p>${escapeHtml(formatLabelFor(tournament.defaultFormatConfig))} · ${escapeHtml(formatLongDateRange(dates))}</p>
            </div>
            <div class="page-header-actions">
                <button type="button" id="btn-home-settings" class="btn-secondary">Configuración</button>
                <button type="button" id="btn-home-exports" class="btn-secondary">Exportar</button>
            </div>
        </div>

        <div class="kpi-grid kpi-grid-5" aria-label="Métricas del torneo">
            <div class="kpi-card">
                <span class="kpi-label">Categorías</span>
                <strong class="kpi-value">${categories.length}</strong>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Equipos</span>
                <strong class="kpi-value">${totalTeams}</strong>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Canchas</span>
                <strong class="kpi-value">${courts.length}</strong>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Partidos jugados</span>
                <strong class="kpi-value">${finishedMatches.length}<span class="kpi-inline-sub">/ ${officialMatches.length}</span></strong>
            </div>
            <div class="kpi-card ${conflicts.length ? 'is-warning' : 'is-optimal'}">
                <span class="kpi-label">Estado logístico</span>
                <strong class="kpi-value">${conflicts.length ? `${conflicts.length} alerta${conflicts.length === 1 ? '' : 's'}` : 'Óptimo'}</strong>
            </div>
        </div>

        <section class="section-block" aria-label="Siguiente paso">
            <div class="section-block-head">
                <h3>Siguiente paso</h3>
                <span>Paso ${activeStepIdx + 1} de 6</span>
            </div>
            <div class="next-step-banner">
                <div class="next-step-banner-text">
                    <strong>${escapeHtml(nextStepIndex >= 0 ? primaryStep.promptTitle : 'Torneo completado · Revisá posiciones e informes')}</strong>
                    <p>${escapeHtml(nextStepIndex >= 0 ? primaryStep.promptDesc : 'Todos los partidos confirmados finalizaron. Podés consultar el podio o exportar reportes oficiales.')}</p>
                </div>
                <button type="button" id="btn-home-primary" class="btn-primary" data-target-section="${escapeHtml(nextStepIndex >= 0 ? primaryStep.section : 'posiciones')}">Continuar →</button>
            </div>
        </section>

        <section class="section-block" aria-label="Progreso del torneo">
            <div class="section-block-head">
                <h3>Progreso del torneo</h3>
            </div>
            <div class="workflow-stepper">
                ${steps.map((step, idx) => {
                    const stateClass = step.done ? 'is-done' : (idx === nextStepIndex ? 'is-next' : '');
                    const stateText = step.done ? '✓ Listo' : (idx === nextStepIndex ? 'Siguiente' : 'Pendiente');
                    return `<button type="button" class="workflow-step ${stateClass}" data-step-section="${escapeHtml(step.section)}">
                        <span class="workflow-step-state">${stateText}</span>
                        <strong>${escapeHtml(step.title)}</strong>
                        <small>${escapeHtml(step.detail)}</small>
                    </button>`;
                }).join('')}
            </div>
        </section>

        <section class="section-block" aria-label="Categorías">
            <div class="section-block-head">
                <h3>Categorías</h3>
                ${categories.length ? '<button id="btn-ir-equipos" type="button" class="btn-ghost btn-sm">Gestionar categorías →</button>' : ''}
            </div>
            <div class="grid-cards">
                ${categories.length ? categories.map(category => {
                    const status = CompetitionEngine.getCategoryStatus(tournamentId, category.id);
                    const format = CompetitionEngine.getCategoryFormat(tournamentId, category.id);
                    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id).length;
                    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, category.id).length;
                    const needsZones = format.definition.requiresZones || format.config.stages?.[0]?.type === 'ZONAS';
                    const pct = status.officialMatches ? Math.round((status.finishedMatches / status.officialMatches) * 100) : 0;
                    const nextAct = nextActionForCategory({ teams, zones, needsZones, status });
                    const useBlueBtn = !status.champion && nextAct.priority && !categoryBlueAssigned;
                    if (useBlueBtn) categoryBlueAssigned = true;

                    return `<article class="card category-dashboard-card">
                        <div class="category-dashboard-card-head">
                            <span class="chip-pill chip-blue">${escapeHtml(category.nombre)}</span>
                        </div>
                        <h4 class="category-dashboard-title">${escapeHtml(formatLabelFor(format.config))}</h4>
                        <p class="category-dashboard-meta">${teams} equipo${teams === 1 ? '' : 's'}${needsZones ? ` · ${zones} zona${zones === 1 ? '' : 's'}` : ''} · ${status.finishedMatches} de ${status.officialMatches} partidos</p>
                        <div class="progress-track" aria-hidden="true">
                            <div class="progress-fill ${status.completed ? 'is-complete' : ''}" style="width: ${pct}%;"></div>
                        </div>
                        ${status.champion
                            ? `<p class="category-dashboard-champion">Campeón: ${escapeHtml(status.champion.nombre)}</p>`
                            : `<div class="category-dashboard-action">
                                <button type="button" class="${useBlueBtn ? 'btn-primary' : 'btn-secondary'} jump-cat" data-cat="${escapeHtml(category.id)}" data-section="${escapeHtml(nextAct.section)}">${escapeHtml(nextAct.label)}</button>
                            </div>`}
                    </article>`;
                }).join('') : `
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <strong>Todavía no creaste categorías</strong>
                        <p>Definí las categorías (+40, +50, +60, +68 o libre) para empezar a cargar equipos.</p>
                        <button type="button" class="btn-primary" id="btn-empty-add-cats">+ Crear categorías</button>
                    </div>
                `}
            </div>
        </section>`;

    view.querySelector('#btn-home-settings')?.addEventListener('click', () => goToTournament(tournamentId, 'configuracion'));
    view.querySelector('#btn-home-exports')?.addEventListener('click', () => goToTournament(tournamentId, 'exportaciones'));
    view.querySelector('#btn-home-primary')?.addEventListener('click', event => {
        goToTournament(tournamentId, event.currentTarget.dataset.targetSection || 'equipos');
    });
    view.querySelectorAll('[data-step-section]').forEach(btn => btn.addEventListener('click', () => {
        goToTournament(tournamentId, btn.dataset.stepSection);
    }));
    view.querySelector('#btn-ir-equipos')?.addEventListener('click', () => goToTournament(tournamentId, 'equipos'));
    view.querySelector('#btn-empty-add-cats')?.addEventListener('click', () => goToTournament(tournamentId, 'equipos'));
    view.querySelectorAll('.jump-cat').forEach(button => button.addEventListener('click', () => {
        AppState.setCategory(button.dataset.cat);
        goToTournament(tournamentId, button.dataset.section);
    }));
}
