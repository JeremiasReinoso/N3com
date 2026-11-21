import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { CompetitionEngine, KnockoutEngine, QualificationEngine } from '../engine/index.js';
import { formatLabelFor } from './formatConfigurator.js';

const PHASE_LABELS = {
    ZONA_FINAL: 'Zona Final (Todos contra todos)',
    TOP_32: 'Top 32 · Dieciseisavos',
    TOP_16: 'Top 16 · Octavos',
    TOP_8: 'Top 8 · Cuartos de final',
    SEMIFINAL: 'Semifinales',
    THIRD_PLACE: 'Tercer puesto',
    FINAL: 'Final'
};
const ORDERED_STAGE_PHASES = ['ZONA_FINAL', 'TOP_32', 'TOP_16', 'TOP_8', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];

const nameOf = (teams, id) => teams.find(team => team.id === id)?.nombre || 'Por definir';
const sourceLabel = (sourceId, matches, isLoser = false) => {
    if (!sourceId) return 'Por definir';
    const sourceMatch = matches.find(item => item.id === sourceId);
    if (!sourceMatch) return 'Por definir';
    const stage = { TOP_32: 'Top 32', TOP_16: 'Top 16', TOP_8: 'Cuartos', SEMIFINAL: 'Semifinal' }[sourceMatch.phase] || sourceMatch.phase;
    return `${isLoser ? 'Perdedor' : 'Ganador'} ${stage} ${sourceMatch.orden || 1}`;
};
const participant = (match, side, teams, matches) => {
    if (match[side]) return nameOf(teams, match[side]);
    const slot = side === 'equipoLocalId' ? 0 : 1;
    if (match.sourceLoserMatchIds?.[slot]) return sourceLabel(match.sourceLoserMatchIds[slot], matches, true);
    return sourceLabel(match.sourceMatchIds?.[slot], matches, false);
};
const renderMatch = (match, teams, matches) => `
    <article class="schedule-match bracket-match-card ${match.estado === 'finalizado' ? 'is-finished' : ''}">
        <div class="schedule-match-time">
            <strong>${escapeHtml(match.hora || 'Horario pendiente')}</strong>
            <span>${escapeHtml(match.fecha || 'Fecha pendiente')}${match.cancha ? ` · ${escapeHtml(match.cancha)}` : ''}</span>
        </div>
        <div class="schedule-match-main">
            <div>
                <span class="schedule-stage">${escapeHtml(match.nombreEtapa || PHASE_LABELS[match.phase] || match.phase)}</span>
                <strong>${escapeHtml(participant(match, 'equipoLocalId', teams, matches))} <b>vs</b> ${escapeHtml(participant(match, 'equipoVisitanteId', teams, matches))}</strong>
                ${match.estado === 'finalizado' ? `<small>${(match.sets || []).map((set, index) => `S${index + 1}: ${set.puntosLocal}-${set.puntosVisitante}`).join(' · ')}</small>` : ''}
            </div>
            ${match.estado === 'finalizado' ? `<span class="schedule-score">${escapeHtml(match.score)}</span>` : '<span class="match-status pending">PENDIENTE</span>'}
        </div>
    </article>`;

export function initPlayoffsView() {
    let tournamentId; try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list');
    const controls = document.querySelector('#view-eliminatorias .panel-control');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; container.innerHTML = ''; return; }

    const tournament = DataManager.getTournament(tournamentId);
    const category = DataManager.getCategory(categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const { definition, config } = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const allMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);

    // Formatos sin eliminatorias ni Zona Final (ej. Todos contra Todos o Liga sin playoffs)
    const noFinalStage = ['TODOS_CONTRA_TODOS', 'LIGA_RONDAS'].includes(config.formatId) && !config.includePlayoffs;
    if (noFinalStage) {
        controls.innerHTML = `<div class="form-title"><div><h3>${escapeHtml(tournament.nombre)} · ${escapeHtml(category.nombre)}</h3><p>Formato configurado: <strong>${escapeHtml(formatLabelFor(config))}</strong>. Este formato define la clasificación directamente por tabla general sin instancias eliminatorias.</p></div><span class="calendar-chip">FORMATO ${escapeHtml(definition.code || '')}</span></div>`;
        container.innerHTML = '<div class="empty-state">No se generan eliminatorias para este formato. Consultá la tabla en la pestaña <strong>Posiciones</strong>.</div>';
        return;
    }

    const sourcePhases = config.formatId === 'LIGA_RONDAS' || config.formatId === 'TODOS_CONTRA_TODOS' ? ['LIGA'] : ['ZONAS'];
    const sourceProgress = config.formatId === 'ELIMINACION_DIRECTA'
        ? { ok: teams.length >= 2, mensaje: teams.length >= 2 ? `${teams.length} equipos listos para eliminación directa.` : 'Agregá al menos 2 equipos.' }
        : QualificationEngine.isSourceStageCompleted(tournamentId, categoryId, sourcePhases);

    let generationWarning = '';
    const stageMatches = allMatches.filter(match => ORDERED_STAGE_PHASES.includes(match.phase));
    const hasKnockout = stageMatches.some(match => KnockoutEngine.ALL_KNOCKOUT_PHASES.includes(match.phase));
    const hasFinalGroup = stageMatches.some(match => match.phase === 'ZONA_FINAL');
    const isFinalGroupOnly = config.formatId === 'ZONAS_ZONA_FINAL';

    // Conserva avance automático progresivo únicamente para el flujo legado Top 16 si ya fue iniciado.
    const isLegacyTop16 = config.formatId === 'ZONAS_ELIMINATORIAS'
        && (config.qualificationMode || 'general_top_n') === 'general_top_n'
        && Number(config.qualifiersTotal || 16) === 16
        && teams.length >= 16;

    if (isLegacyTop16 && hasKnockout) {
        try {
            let current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
            const done = phase => current.filter(m => m.phase === phase).length > 0 && current.filter(m => m.phase === phase).every(m => m.estado === 'finalizado');
            if (done('TOP_16') && !current.some(m => m.phase === 'TOP_8')) PlayoffsService.generarTop8(tournamentId, categoryId);
            current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
            if (done('TOP_8') && !current.some(m => m.phase === 'SEMIFINAL')) PlayoffsService.generarTop4(tournamentId, categoryId);
            current = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
            if (done('SEMIFINAL') && !current.some(m => m.phase === 'FINAL')) PlayoffsService.generarFinal(tournamentId, categoryId);
        } catch (error) {
            generationWarning = error?.message || 'No se pudo avanzar automáticamente la siguiente ronda.';
        }
    }

    const updatedMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => ORDERED_STAGE_PHASES.includes(match.phase));
    const groups = ORDERED_STAGE_PHASES.map(phase => ({ phase, items: updatedMatches.filter(match => match.phase === phase) })).filter(group => group.items.length);

    let actionLabel = '';
    if (isFinalGroupOnly && !hasFinalGroup) actionLabel = 'Generar Zona Final';
    else if (!hasKnockout && !isFinalGroupOnly) actionLabel = config.formatId === 'ELIMINACION_DIRECTA' ? 'Generar cuadro de Eliminación Directa' : 'Generar cuadro eliminatorio';
    else if (hasKnockout && !updatedMatches.some(m => m.phase === 'FINAL')) actionLabel = 'Generar siguiente ronda';

    const semisFinished = updatedMatches.filter(m => m.phase === 'SEMIFINAL').length === 2
        && updatedMatches.filter(m => m.phase === 'SEMIFINAL').every(m => m.estado === 'finalizado');
    const canGenerateThird = !isFinalGroupOnly && semisFinished && !updatedMatches.some(m => m.phase === 'THIRD_PLACE');

    const warningMarkup = generationWarning ? `<div class="planning-warning" role="alert"><strong>Aviso:</strong> ${escapeHtml(generationWarning)}</div>` : '';
    const carryBadge = isFinalGroupOnly
        ? `<p class="helper-text">Política de Zona Final: <strong>${config.carryOverMode === 'carry_over' ? 'Conserva resultados previos entre clasificados' : 'Arranque en 0 puntos'}</strong>.</p>`
        : '';

    controls.innerHTML = `
        <div class="form-title">
            <div>
                <h3>${escapeHtml(tournament.nombre)} · ${escapeHtml(category.nombre)}</h3>
                <p>Formato: <strong>${escapeHtml(formatLabelFor(config))}</strong></p>
                <p>${escapeHtml(sourceProgress.mensaje)}</p>
                ${carryBadge}
            </div>
            <span class="calendar-chip">${sourceProgress.ok ? 'LISTO PARA AVANZAR' : 'FASE EN CURSO'}</span>
        </div>
        ${warningMarkup}
        <div class="form-actions">
            ${actionLabel ? `<button id="btn-avanzar-etapa" class="btn-primary btn-large" type="button" ${sourceProgress.ok ? '' : 'disabled'}>${escapeHtml(actionLabel)}</button>` : ''}
            ${canGenerateThird ? '<button id="btn-generar-tercer-puesto" class="btn-secondary" type="button">+ Generar partido por Tercer Puesto</button>' : ''}
        </div>`;

    const isBracketLayout = groups.some(group => KnockoutEngine.ALL_KNOCKOUT_PHASES.includes(group.phase));
    container.innerHTML = groups.length
        ? `<div class="${isBracketLayout ? 'bracket-board' : 'stage-groups-stack'}">${groups.map(group => `
            <section class="schedule-day bracket-column">
                <header>
                    <div><span class="calendar-chip">${escapeHtml(PHASE_LABELS[group.phase].toUpperCase())}</span><h4>${escapeHtml(PHASE_LABELS[group.phase])}</h4></div>
                    <strong>${group.items.length} partido${group.items.length === 1 ? '' : 's'}</strong>
                </header>
                <div class="schedule-match-list">${group.items.map(match => renderMatch(match, teams, updatedMatches)).join('')}</div>
            </section>`).join('')}</div>`
        : `<div class="empty-state">${isFinalGroupOnly ? 'Cuando finalice la fase de zonas, presioná "Generar Zona Final" para crear los enfrentamientos entre clasificados.' : 'Cuando finalice la fase clasificatoria (o desde el inicio en Eliminación Directa), generá el cuadro aquí.'}</div>`;

    controls.querySelector('#btn-avanzar-etapa')?.addEventListener('click', () => {
        try {
            if (isLegacyTop16 && !hasKnockout) {
                PlayoffsService.generarTop16(tournamentId, categoryId);
            } else {
                const hasCalendar = DataManager.getDaySchedules(tournamentId).length > 0;
                CompetitionEngine.advanceStage(tournamentId, categoryId, { schedule: hasCalendar });
            }
            initPlayoffsView();
        } catch (error) {
            alert(error.message);
        }
    });

    controls.querySelector('#btn-generar-tercer-puesto')?.addEventListener('click', () => {
        try {
            PlayoffsService.generarTercerPuesto(tournamentId, categoryId);
            initPlayoffsView();
        } catch (error) {
            alert(error.message);
        }
    });
}
