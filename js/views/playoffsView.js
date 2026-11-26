import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';
import { CompetitionEngine, KnockoutEngine, QualificationEngine } from '../engine/index.js';
import { formatLabelFor } from './formatConfigurator.js';

const PHASE_LABELS = {
    ZONA_FINAL: 'ZONA FINAL',
    TOP_32: 'DIECISEISAVOS DE FINAL',
    TOP_16: 'OCTAVOS DE FINAL',
    TOP_8: 'CUARTOS DE FINAL',
    SEMIFINAL: 'SEMIFINALES',
    THIRD_PLACE: 'TERCER PUESTO',
    FINAL: 'FINAL'
};
const ORDERED_STAGE_PHASES = ['ZONA_FINAL', 'TOP_32', 'TOP_16', 'TOP_8', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];

const nameOf = (teams, id) => teams.find(team => team.id === id)?.nombre || 'Por definir';
const sourceLabel = (sourceId, matches, isLoser = false) => {
    if (!sourceId) return 'Por definir';
    const sourceMatch = matches.find(item => item.id === sourceId);
    if (!sourceMatch) return 'Por definir';
    const stage = { TOP_32: 'Top 32', TOP_16: 'Octavos', TOP_8: 'Cuartos', SEMIFINAL: 'Semifinal' }[sourceMatch.phase] || sourceMatch.phase;
    return `${isLoser ? 'Perdedor' : 'Ganador'} ${stage} ${sourceMatch.orden || 1}`;
};
const participant = (match, side, teams, matches) => {
    if (match[side]) return nameOf(teams, match[side]);
    const slot = side === 'equipoLocalId' ? 0 : 1;
    if (match.sourceLoserMatchIds?.[slot]) return sourceLabel(match.sourceLoserMatchIds[slot], matches, true);
    return sourceLabel(match.sourceMatchIds?.[slot], matches, false);
};

const formatScoreDash = score => String(score || '').replace('-', '–');

const renderMatchMeta = match => {
    const bits = [match.hora || match.fecha || 'Horario a definir', match.cancha || ''].filter(Boolean);
    return bits.join(' · ');
};

const renderBracketCard = (match, teams, matches, isFinal = false) => {
    const finished = match.estado === 'finalizado';
    return `
        <article class="bracket-card ${isFinal ? 'is-final-card' : ''}">
            <span class="bracket-card-meta">${escapeHtml(renderMatchMeta(match))}</span>
            <div class="bracket-card-teams">
                <strong>${escapeHtml(participant(match, 'equipoLocalId', teams, matches))}</strong>
                <span class="vs-sep">vs</span>
                <strong>${escapeHtml(participant(match, 'equipoVisitanteId', teams, matches))}</strong>
            </div>
            <span class="bracket-card-score ${finished ? '' : 'is-pending'}">${finished ? escapeHtml(formatScoreDash(match.score)) : 'Pendiente'}</span>
        </article>`;
};

export function initPlayoffsView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list');
    const controls = document.querySelector('#view-eliminatorias .panel-control');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        controls.innerHTML = '';
        container.innerHTML = '<div class="empty-state"><strong>Elegí una categoría</strong><p>Seleccioná un torneo y una categoría desde Equipos para ver sus eliminatorias.</p></div>';
        return;
    }

    const category = DataManager.getCategory(categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const { config } = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const catStatus = CompetitionEngine.getCategoryStatus(tournamentId, categoryId);
    const allMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);

    const noFinalStage = ['TODOS_CONTRA_TODOS', 'LIGA_RONDAS'].includes(config.formatId) && !config.includePlayoffs;
    if (noFinalStage) {
        controls.innerHTML = `
            <div class="page-header" style="margin-bottom:0;">
                <div class="page-header-main">
                    <span class="page-eyebrow">ELIMINATORIAS · ${escapeHtml(category.nombre.toUpperCase())}</span>
                    <h1>Cuadro final</h1>
                    <p>${escapeHtml(formatLabelFor(config))} · Definición directa por tabla general.</p>
                </div>
                ${catStatus.champion ? `<div class="page-header-actions"><span class="chip-pill chip-green">Campeón: ${escapeHtml(catStatus.champion.nombre)}</span></div>` : ''}
            </div>`;
        container.innerHTML = '<div class="empty-state"><strong>Modalidad sin cruces eliminatorios</strong><p>Esta categoría define el campeón directamente en la pestaña Posiciones.</p></div>';
        return;
    }

    const sourcePhases = config.formatId === 'LIGA_RONDAS' || config.formatId === 'TODOS_CONTRA_TODOS' ? ['LIGA'] : ['ZONAS'];
    const sourceProgress = config.formatId === 'ELIMINACION_DIRECTA'
        ? { ok: teams.length >= 2, mensaje: teams.length >= 2 ? `${teams.length} equipos listos para eliminación directa` : 'Cargá al menos 2 equipos' }
        : QualificationEngine.isSourceStageCompleted(tournamentId, categoryId, sourcePhases);

    let generationWarning = '';
    const stageMatches = allMatches.filter(match => ORDERED_STAGE_PHASES.includes(match.phase));
    const hasKnockout = stageMatches.some(match => KnockoutEngine.ALL_KNOCKOUT_PHASES.includes(match.phase));
    const hasFinalGroup = stageMatches.some(match => match.phase === 'ZONA_FINAL');
    const isFinalGroupOnly = config.formatId === 'ZONAS_ZONA_FINAL';

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

    let actionLabel = '';
    if (isFinalGroupOnly && !hasFinalGroup) actionLabel = 'Generar Zona Final';
    else if (!hasKnockout && !isFinalGroupOnly) actionLabel = config.formatId === 'ELIMINACION_DIRECTA' ? 'Generar cuadro' : 'Generar eliminatorias';
    else if (hasKnockout && !updatedMatches.some(m => m.phase === 'FINAL')) actionLabel = 'Generar siguiente ronda';

    const semisFinished = updatedMatches.filter(m => m.phase === 'SEMIFINAL').length === 2
        && updatedMatches.filter(m => m.phase === 'SEMIFINAL').every(m => m.estado === 'finalizado');
    const canGenerateThird = !isFinalGroupOnly && semisFinished && !updatedMatches.some(m => m.phase === 'THIRD_PLACE');

    const subtitleStatus = sourceProgress.ok ? 'Fase clasificatoria completada' : sourceProgress.mensaje;

    controls.innerHTML = `
        <div class="page-header" style="margin-bottom:0;">
            <div class="page-header-main">
                <span class="page-eyebrow">ELIMINATORIAS · ${escapeHtml(category.nombre.toUpperCase())}</span>
                <h1>Cuadro final</h1>
                <p>${escapeHtml(formatLabelFor(config))} · ${escapeHtml(subtitleStatus)}</p>
            </div>
            <div class="page-header-actions">
                ${catStatus.champion ? `<span class="chip-pill chip-green">Campeón: ${escapeHtml(catStatus.champion.nombre)}</span>` : ''}
                ${canGenerateThird ? '<button id="btn-generar-tercer-puesto" class="btn-secondary" type="button">+ Tercer puesto</button>' : ''}
                ${actionLabel ? `<button id="btn-avanzar-etapa" class="btn-primary" type="button" ${sourceProgress.ok ? '' : 'disabled'}>${escapeHtml(actionLabel)}</button>` : ''}
            </div>
        </div>
        ${generationWarning ? `<div class="planning-warning" role="alert" style="margin-top:16px;">${escapeHtml(generationWarning)}</div>` : ''}`;

    if (!updatedMatches.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>Todavía no se generaron los cruces finales</strong>
                <p>${isFinalGroupOnly ? 'Cuando finalice la fase de zonas, presioná "Generar Zona Final" para armar los enfrentamientos entre clasificados.' : 'Completá la fase clasificatoria y presioná "Generar eliminatorias" para armar el cuadro.'}</p>
            </div>`;
    } else if (isFinalGroupOnly) {
        const finalZoneMatches = updatedMatches.filter(m => m.phase === 'ZONA_FINAL');
        container.innerHTML = `
            <div class="bracket-cards-stack">
                ${finalZoneMatches.map(m => renderBracketCard(m, teams, updatedMatches, false)).join('')}
            </div>`;
    } else {
        // Arma columnas de llaves apilando TERCER PUESTO debajo de SEMIFINALES y destacando FINAL en dorado.
        const earlyPhases = ['TOP_32', 'TOP_16', 'TOP_8'].filter(phase => updatedMatches.some(m => m.phase === phase));
        const semis = updatedMatches.filter(m => m.phase === 'SEMIFINAL');
        const third = updatedMatches.filter(m => m.phase === 'THIRD_PLACE');
        const finals = updatedMatches.filter(m => m.phase === 'FINAL');

        const columnsMarkup = [];
        earlyPhases.forEach(phase => {
            const items = updatedMatches.filter(m => m.phase === phase);
            columnsMarkup.push(`
                <section class="bracket-col" aria-label="${escapeHtml(PHASE_LABELS[phase])}">
                    <div class="bracket-col-block">
                        <h3 class="bracket-col-title">${escapeHtml(PHASE_LABELS[phase])}</h3>
                        <div class="bracket-cards-stack">
                            ${items.map(m => renderBracketCard(m, teams, updatedMatches, false)).join('')}
                        </div>
                    </div>
                </section>`);
        });

        if (semis.length || third.length) {
            columnsMarkup.push(`
                <section class="bracket-col" aria-label="Semifinales y Tercer puesto">
                    ${semis.length ? `
                        <div class="bracket-col-block">
                            <h3 class="bracket-col-title">SEMIFINALES</h3>
                            <div class="bracket-cards-stack">
                                ${semis.map(m => renderBracketCard(m, teams, updatedMatches, false)).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${third.length ? `
                        <div class="bracket-col-block">
                            <h3 class="bracket-col-title">TERCER PUESTO</h3>
                            <div class="bracket-cards-stack">
                                ${third.map(m => renderBracketCard(m, teams, updatedMatches, false)).join('')}
                            </div>
                        </div>
                    ` : ''}
                </section>`);
        }

        if (finals.length) {
            columnsMarkup.push(`
                <section class="bracket-col" aria-label="Final">
                    <div class="bracket-col-block">
                        <h3 class="bracket-col-title is-final">FINAL</h3>
                        <div class="bracket-cards-stack">
                            ${finals.map(m => renderBracketCard(m, teams, updatedMatches, true)).join('')}
                        </div>
                    </div>
                </section>`);
        }

        const boardClass = columnsMarkup.length >= 4 ? 'bracket-board cols-4' : 'bracket-board';
        container.innerHTML = `<div class="${boardClass}">${columnsMarkup.join('')}</div>`;
    }

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
