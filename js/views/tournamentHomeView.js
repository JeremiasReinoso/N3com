import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine, SchedulingEngine } from '../engine/index.js';
import { formatLabelFor } from './formatConfigurator.js';
import { icon } from '../ui/icons.js';

const nextActionForCategory = ({ teams, zones, needsZones, status }) => {
    if (teams < 2) return { label: 'Inscribir equipos', section: 'equipos' };
    if (needsZones && zones < 1) return { label: 'Armar zonas', section: 'zonas' };
    if (status.officialMatches === 0) return { label: 'Generar partidos', section: 'programacion' };
    if (status.finishedMatches < status.officialMatches) return { label: 'Cargar resultados', section: 'resultados' };
    if (!status.completed) return { label: 'Avanzar etapa final', section: 'eliminatorias' };
    return { label: 'Ver posiciones finales', section: 'posiciones' };
};

export function initTournamentHomeView() {
    const view = document.getElementById('view-inicio');
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    if (!tournament) {
        view.innerHTML = '<div class="empty-state"><strong>Seleccioná un torneo</strong><p>Elegí un torneo desde Mis Torneos para ver su panel general.</p></div>';
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

    // Estado real de los 6 pasos guiados para el organizador
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
            num: 'Paso 1',
            title: 'Calendario y canchas',
            done: dates.length > 0 && courts.length > 0,
            detail: dates.length ? `${dates.length} jornada${dates.length === 1 ? '' : 's'} · ${courts.length} cancha${courts.length === 1 ? '' : 's'}` : 'Definir fechas y horarios de juego',
            section: 'calendario'
        },
        {
            num: 'Paso 2',
            title: 'Categorías y equipos',
            done: categories.length > 0 && totalTeams >= 2,
            detail: categories.length ? `${categories.length} cat. · ${totalTeams} equipo${totalTeams === 1 ? '' : 's'}` : 'Crear categorías e inscribir equipos',
            section: 'equipos'
        },
        {
            num: 'Paso 3',
            title: 'Modalidad y zonas',
            done: zonesReady,
            detail: zonesReady ? 'Formatos y zonas completos' : 'Configurar formato o sortear zonas',
            section: categories.length ? 'zonas' : 'equipos'
        },
        {
            num: 'Paso 4',
            title: 'Generar partidos',
            done: officialMatches.length > 0,
            detail: officialMatches.length ? `${officialMatches.length} partido${officialMatches.length === 1 ? '' : 's'} confirmado${officialMatches.length === 1 ? '' : 's'}` : 'Armar y confirmar emparejamientos',
            section: 'programacion'
        },
        {
            num: 'Paso 5',
            title: 'Horarios y canchas',
            done: officialMatches.length > 0 && scheduledMatches.length === officialMatches.length && conflicts.length === 0,
            detail: conflicts.length ? `${conflicts.length} alerta${conflicts.length === 1 ? '' : 's'} por revisar` : (scheduledMatches.length ? 'Fixture programado sin conflictos' : 'Asignar días, horas y canchas'),
            section: 'programacion'
        },
        {
            num: 'Paso 6',
            title: 'Resultados y finales',
            done: officialMatches.length > 0 && finishedMatches.length === officialMatches.length,
            detail: officialMatches.length ? `${finishedMatches.length} de ${officialMatches.length} jugados` : 'Cargar sets, tablas y eliminatorias',
            section: 'resultados'
        }
    ];
    const nextStepIndex = steps.findIndex(step => !step.done);
    const primaryStep = steps[nextStepIndex >= 0 ? nextStepIndex : 5];

    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">${escapeHtml(tournament.organizacion || 'Torneo activo')}</span>
                <h2>${escapeHtml(tournament.nombre)}</h2>
                <p>
                    Modalidad base: <strong>${escapeHtml(formatLabelFor(tournament.defaultFormatConfig))}</strong> ·
                    ${dates.length ? `${dates[0]} → ${dates.at(-1)} (${dates.length} jornada${dates.length === 1 ? '' : 's'})` : 'Fechas aún sin definir'}
                </p>
            </div>
            <div class="page-header-actions">
                <button type="button" id="btn-home-settings" class="btn-secondary">
                    ${icon('settings', { size: 16 })}
                    <span>Configuración</span>
                </button>
                <button type="button" id="btn-home-exports" class="btn-secondary">
                    ${icon('fileDown', { size: 16 })}
                    <span>Exportaciones</span>
                </button>
                <button type="button" id="btn-home-primary" class="btn-primary" data-target-section="${escapeHtml(primaryStep.section)}">
                    <span>${nextStepIndex >= 0 ? `Continuar: ${escapeHtml(primaryStep.title)}` : 'Ver posiciones y cierre'}</span>
                    ${icon('arrowRight', { size: 16 })}
                </button>
            </div>
        </div>

        <div class="kpi-grid" style="margin-bottom: var(--space-5);" aria-label="Indicadores del torneo">
            <div class="kpi-card"><span class="kpi-label">Categorías</span><strong class="kpi-value">${categories.length}</strong></div>
            <div class="kpi-card"><span class="kpi-label">Equipos</span><strong class="kpi-value">${totalTeams}</strong></div>
            <div class="kpi-card"><span class="kpi-label">Canchas</span><strong class="kpi-value">${courts.length}</strong></div>
            <div class="kpi-card"><span class="kpi-label">Partidos jugados</span><strong class="kpi-value">${finishedMatches.length} / ${officialMatches.length}</strong></div>
            <div class="kpi-card">
                <span class="kpi-label">Estado logístico</span>
                <strong class="kpi-value" style="color:${conflicts.length ? 'var(--status-warning-text)' : 'var(--status-success-text)'};">${conflicts.length ? `${conflicts.length} alerta${conflicts.length === 1 ? '' : 's'}` : 'Óptimo'}</strong>
            </div>
        </div>

        <section class="section-card" aria-label="Guía paso a paso del torneo">
            <div class="section-card-head">
                <div>
                    <h3>Guía rápida de organización</h3>
                    <p>Hacé clic en cualquier paso para ir directamente a esa pantalla.</p>
                </div>
            </div>
            <div class="workflow-stepper">
                ${steps.map((step, idx) => {
                    const stateClass = step.done ? 'is-done' : (idx === nextStepIndex ? 'is-next' : '');
                    const badge = step.done
                        ? `<span class="badge badge-success">${icon('check', { size: 12 })} Listo</span>`
                        : (idx === nextStepIndex ? '<span class="badge badge-neutral">Siguiente</span>' : '<span class="badge badge-muted">Pendiente</span>');
                    return `<button type="button" class="workflow-step ${stateClass}" data-step-section="${escapeHtml(step.section)}">
                        <div class="workflow-step-head">
                            <span class="workflow-step-num">${escapeHtml(step.num)}</span>
                            ${badge}
                        </div>
                        <strong>${escapeHtml(step.title)}</strong>
                        <small>${escapeHtml(step.detail)}</small>
                    </button>`;
                }).join('')}
            </div>
        </section>

        <section class="section-card">
            <div class="section-card-head">
                <div>
                    <h3>Categorías del torneo</h3>
                    <p>Cada categoría mantiene su formato, zonas, fixture y clasificación independientes.</p>
                </div>
                <button id="btn-ir-equipos" type="button" class="btn-secondary">
                    ${icon('plus', { size: 16 })}
                    <span>Gestionar categorías</span>
                </button>
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

                    return `<article class="card category-dashboard-card">
                        <div class="section-card-head" style="margin-bottom: 4px;">
                            <span class="calendar-chip">${escapeHtml(category.nombre)}</span>
                            <div class="ui-dropdown" data-dropdown>
                                <button type="button" class="btn-icon" data-dropdown-trigger aria-label="Ir a sección de ${escapeHtml(category.nombre)}" aria-expanded="false">${icon('moreHorizontal', { size: 18 })}</button>
                                <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                                    <button type="button" class="ui-dropdown-item jump-cat" data-cat="${escapeHtml(category.id)}" data-section="equipos">${icon('users', { size: 15 })}<span>Equipos y modalidad</span></button>
                                    <button type="button" class="ui-dropdown-item jump-cat" data-cat="${escapeHtml(category.id)}" data-section="zonas">${icon('layers', { size: 15 })}<span>Zonas y sorteo</span></button>
                                    <button type="button" class="ui-dropdown-item jump-cat" data-cat="${escapeHtml(category.id)}" data-section="programacion">${icon('calendarClock', { size: 15 })}<span>Programación y fixture</span></button>
                                    <button type="button" class="ui-dropdown-item jump-cat" data-cat="${escapeHtml(category.id)}" data-section="resultados">${icon('clipboardCheck', { size: 15 })}<span>Cargar resultados</span></button>
                                    <button type="button" class="ui-dropdown-item jump-cat" data-cat="${escapeHtml(category.id)}" data-section="posiciones">${icon('trophy', { size: 15 })}<span>Tabla de posiciones</span></button>
                                    <button type="button" class="ui-dropdown-item jump-cat" data-cat="${escapeHtml(category.id)}" data-section="eliminatorias">${icon('gitBranch', { size: 15 })}<span>Sub-zonas / Eliminatorias</span></button>
                                </div>
                            </div>
                        </div>
                        <strong style="font-size: var(--text-base); color: var(--text-primary);">${escapeHtml(formatLabelFor(format.config))}</strong>
                        <small class="helper-text">${teams} equipo${teams === 1 ? '' : 's'}${needsZones ? ` · ${zones} zona${zones === 1 ? '' : 's'}` : ''} · ${status.finishedMatches}/${status.officialMatches} partidos jugados</small>
                        <div class="progress-track" aria-hidden="true"><div class="progress-fill ${status.completed ? 'is-complete' : ''}" style="width: ${pct}%;"></div></div>
                        ${status.champion ? `<span class="badge badge-success">${icon('trophy', { size: 13 })} Campeón: ${escapeHtml(status.champion.nombre)}</span>` : ''}
                        <div class="card-actions" style="margin-top: 8px;">
                            <button type="button" class="btn-primary jump-cat" data-cat="${escapeHtml(category.id)}" data-section="${escapeHtml(nextAct.section)}">
                                <span>${escapeHtml(nextAct.label)}</span>
                                ${icon('arrowRight', { size: 15 })}
                            </button>
                        </div>
                    </article>`;
                }).join('') : `<div class="empty-state"><span class="empty-state-icon">${icon('users', { size: 22 })}</span><strong>Aún no creaste categorías</strong><p>Comenzá creando las categorías del torneo (+40, +50, +60, +68 o personalizada) e inscribiendo los equipos.</p><button type="button" class="btn-primary" id="btn-empty-add-cats">${icon('plus', { size: 16 })}<span>Crear categorías</span></button></div>`}
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
