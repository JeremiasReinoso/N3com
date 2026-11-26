import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine } from '../engine/index.js';
import { downloadResultsPdf } from '../services/reportsExport.js';
import { formatLabelFor } from './formatConfigurator.js';
import { showToast } from '../ui/feedback.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'confirmado', 'en_juego', 'finalizado'].includes(match.estado);
const RESULT_PHASE_LABELS = {
    ZONAS: 'Fase de zonas',
    LIGA: 'Todos contra todos',
    ZONA_FINAL: 'Zona Final',
    TOP_32: 'Top 32',
    TOP_16: 'Top 16',
    TOP_8: 'Cuartos de final',
    SEMIFINAL: 'Semifinales',
    THIRD_PLACE: 'Tercer puesto',
    FINAL: 'Final'
};

export const normalizeTeamSearch = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();

const compareMatches = (left, right) => {
    const compareField = field => String(left[field] || '\uffff').localeCompare(String(right[field] || '\uffff'), 'es', { numeric: true });
    return compareField('fecha') || compareField('hora') || compareField('cancha') || compareField('id');
};

export const findTeamMatches = ({ matches, teams, tournamentId, categoryId, query }) => {
    const term = normalizeTeamSearch(query);
    if (!term) return [];
    const scopedTeams = new Map(teams
        .filter(team => team.torneoId === tournamentId && team.categoriaId === categoryId)
        .map(team => [team.id, normalizeTeamSearch(team.nombre)]));
    return matches
        .filter(match => match.torneoId === tournamentId && match.categoriaId === categoryId)
        .filter(match => [match.equipoLocalId, match.equipoVisitanteId].some(teamId => scopedTeams.get(teamId)?.includes(term)))
        .sort(compareMatches);
};

export const getVisibleMatches = filters => normalizeTeamSearch(filters.query)
    ? findTeamMatches(filters)
    : filters.matches;

const formatShortMetaDate = (isoDate, hora, cancha) => {
    const parts = [];
    if (isoDate) {
        try {
            const dt = new Date(`${isoDate}T12:00:00`);
            const short = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(dt).replace('.', '').toUpperCase();
            parts.push(hora ? `${short} ${hora}` : short);
        } catch {
            parts.push(hora ? `${isoDate} ${hora}` : isoDate);
        }
    } else if (hora) {
        parts.push(hora);
    }
    if (cancha) parts.push(cancha.toUpperCase());
    return parts.length ? parts.join(' · ') : 'SIN HORARIO';
};

const previewFromInputs = card => {
    const entries = [...card.querySelectorAll('.set-points')].map(row => ({
        local: row.querySelector('[data-side="local"]').value,
        visitante: row.querySelector('[data-side="visitante"]').value
    }));
    const filled = entries.filter(set => set.local !== '' || set.visitante !== '');
    if (!filled.length) return { message: 'Cargá los puntos de cada set para calcular el ganador.', valid: false };
    if (filled.some(set => set.local === '' || set.visitante === '')) return { message: 'Completá ambos puntajes de cada set.', valid: false };
    if (filled.some(set => Number(set.local) === Number(set.visitante))) return { message: 'Un set no puede terminar empatado.', valid: false };
    if (filled.length < 2) return { message: 'Ingresá al menos dos sets.', valid: false };
    const localWins = filled.filter(set => Number(set.local) > Number(set.visitante)).length;
    const visitanteWins = filled.length - localWins;
    if (filled.length === 2 && (localWins === 2 || visitanteWins === 2)) return { message: `Resultado calculado: ${localWins}–${visitanteWins}`, valid: true };
    if (filled.length === 2) return { message: 'Empate 1–1 en sets: completá el set de desempate.', valid: false };
    const firstTwoAreSplit = (Number(filled[0].local) > Number(filled[0].visitante)) !== (Number(filled[1].local) > Number(filled[1].visitante));
    if (firstTwoAreSplit && ((localWins === 2 && visitanteWins === 1) || (visitanteWins === 2 && localWins === 1))) return { message: `Resultado calculado: ${localWins}–${visitanteWins}`, valid: true };
    return { message: 'El partido debe finalizar 2–0 o 2–1.', valid: false };
};

export function initResultadosView(options = {}) {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-resultados');
    const categories = tournamentId ? DataManager.getCategoriesByTournament(tournamentId) : [];
    const categoryId = AppState.getCategory();
    const category = categories.find(item => item.id === categoryId);
    if (!tournamentId || !category) {
        view.innerHTML = '<div class="empty-state"><strong>Elegí una categoría</strong><p>Seleccioná un torneo y una categoría desde Equipos para cargar resultados.</p></div>';
        return;
    }

    const tournament = DataManager.getTournament(tournamentId);
    const activeFormat = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(isOfficialMatch);
    const finishedCount = matches.filter(match => match.estado === 'finalizado').length;
    const pendingCount = matches.length - finishedCount;
    const team = id => teams.find(item => item.id === id)?.nombre || 'Por definir';
    const zone = id => zones.find(item => item.id === id)?.nombre || '';
    const stage = match => match.nombreEtapa || RESULT_PHASE_LABELS[match.phase] || (match.tipo === 'final' ? 'Final' : (match.tipo === 'semifinal' ? 'Semifinal' : (match.tipo === 'tercer_puesto' ? 'Tercer puesto' : 'Fase de zonas')));

    const setsForm = match => Array.from({ length: 3 }, (_, index) => {
        const saved = match.sets?.[index];
        const thirdEnabled = match.sets?.length === 3;
        const disabled = index === 2 && !thirdEnabled ? ' disabled' : '';
        const label = index === 2 ? 'SET 3 · DESEMPATE' : `SET ${index + 1}`;
        return `<div class="set-points ${index === 2 ? 'third-set' : ''}">
            <span>${label}</span>
            <input data-side="local" type="number" min="0" inputmode="numeric" aria-label="Puntos de ${escapeHtml(team(match.equipoLocalId))} en set ${index + 1}" value="${saved?.puntosLocal ?? ''}"${disabled}>
            <b>–</b>
            <input data-side="visitante" type="number" min="0" inputmode="numeric" aria-label="Puntos de ${escapeHtml(team(match.equipoVisitanteId))} en set ${index + 1}" value="${saved?.puntosVisitante ?? ''}"${disabled}>
        </div>`;
    }).join('');

    const formatScoreDash = score => String(score || '').replace('-', '–');

    const matchCard = match => {
        const finished = match.estado === 'finalizado';
        const unresolved = !match.equipoLocalId || !match.equipoVisitanteId;
        const zoneLabel = match.zonaId ? zone(match.zonaId) : '';
        const metaParts = [
            finished ? 'JUGADO' : 'PENDIENTE',
            stage(match).toUpperCase(),
            zoneLabel ? zoneLabel.toUpperCase() : '',
            formatShortMetaDate(match.fecha, match.hora, match.cancha)
        ].filter(Boolean).join(' · ');

        if (unresolved) {
            return `<article class="set-result-card">
                <div class="result-card-top">
                    <div class="result-card-info">
                        <span class="result-meta-eyebrow is-pending">${escapeHtml(metaParts)}</span>
                        <div class="result-matchup"><strong>${escapeHtml(team(match.equipoLocalId))}</strong> <span class="vs-sep">vs</span> <strong>${escapeHtml(team(match.equipoVisitanteId))}</strong></div>
                        <span class="result-sets-summary">Se habilita cuando finalicen los cruces previos.</span>
                    </div>
                </div>
            </article>`;
        }

        const isEditingFinished = finished && options.expandedMatchId === match.id;
        const showSetEditor = !finished || isEditingFinished;

        if (finished && !isEditingFinished) {
            const setsText = (match.sets || []).map(set => `${set.puntosLocal}–${set.puntosVisitante}`).join(' · ');
            return `<article class="set-result-card is-finished" data-id="${escapeHtml(match.id)}">
                <div class="result-card-top">
                    <div class="result-card-info">
                        <span class="result-meta-eyebrow is-finished">${escapeHtml(metaParts)}</span>
                        <div class="result-matchup"><strong>${escapeHtml(team(match.equipoLocalId))}</strong> <span class="vs-sep">vs</span> <strong>${escapeHtml(team(match.equipoVisitanteId))}</strong></div>
                        <span class="result-sets-summary">Sets: ${escapeHtml(setsText)}</span>
                    </div>
                    <div class="result-card-right">
                        <strong class="result-final-score">${escapeHtml(formatScoreDash(match.score || `${match.setsLocal}–${match.setsVisitante}`))}</strong>
                        <button type="button" class="btn-secondary toggle-result-editor" data-id="${escapeHtml(match.id)}">Editar</button>
                    </div>
                </div>
            </article>`;
        }

        return `<article class="set-result-card ${showSetEditor ? 'is-editing-card' : ''}" data-id="${escapeHtml(match.id)}">
            <div class="result-card-top">
                <div class="result-card-info">
                    <span class="result-meta-eyebrow ${finished ? 'is-finished' : 'is-pending'}">${escapeHtml(metaParts)}</span>
                    <div class="result-matchup"><strong>${escapeHtml(team(match.equipoLocalId))}</strong> <span class="vs-sep">vs</span> <strong>${escapeHtml(team(match.equipoVisitanteId))}</strong></div>
                </div>
                <div class="result-card-right">
                    ${isEditingFinished ? `<button type="button" class="btn-secondary cancel-result-editor" data-id="${escapeHtml(match.id)}">Cancelar</button>` : ''}
                    <button type="button" class="btn-primary guardar-sets" data-id="${escapeHtml(match.id)}">Guardar resultado</button>
                </div>
            </div>
            <div class="sets-editor">${setsForm(match)}</div>
            <div class="set-result-calc-row">
                <p class="set-preview ${finished ? 'valid' : ''}">${finished ? `Resultado calculado: ${escapeHtml(formatScoreDash(match.score))}` : 'Cargá los puntos de cada set para calcular el resultado.'}</p>
            </div>
        </article>`;
    };

    const availablePhases = [...new Set(matches.map(match => match.phase || 'ZONAS'))];
    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">RESULTADOS · ${escapeHtml(category.nombre.toUpperCase())}</span>
                <h1>Cargar resultados</h1>
                <p>${finishedCount} de ${matches.length} partidos finalizados · Pendientes: ${pendingCount}</p>
            </div>
            <div class="page-header-actions">
                <button id="export-results-pdf" class="btn-secondary" type="button">Exportar PDF</button>
            </div>
        </div>

        <div class="results-filter-row" role="search" aria-label="Filtrar partidos">
            <input id="result-team-search" type="search" autocomplete="off" aria-label="Buscar equipo" placeholder="Buscar equipo" value="${escapeHtml(options.initialQuery || '')}">
            <select id="result-phase-filter" aria-label="Filtrar por etapa">
                <option value="">Todas las etapas</option>
                ${availablePhases.map(phase => `<option value="${escapeHtml(phase)}" ${options.initialPhase === phase ? 'selected' : ''}>${escapeHtml(RESULT_PHASE_LABELS[phase] || phase)}</option>`).join('')}
            </select>
            <select id="result-status-filter" aria-label="Filtrar por estado">
                <option value="">Todos los estados</option>
                <option value="pending" ${options.initialStatus === 'pending' ? 'selected' : ''}>Pendientes</option>
                <option value="finished" ${options.initialStatus === 'finished' ? 'selected' : ''}>Jugados</option>
            </select>
        </div>

        <div id="resultados-list" class="set-results-list" aria-live="polite"></div>`;

    const list = view.querySelector('#resultados-list');
    const searchInput = view.querySelector('#result-team-search');
    const phaseFilter = view.querySelector('#result-phase-filter');
    const statusFilter = view.querySelector('#result-status-filter');

    const refreshPreview = card => {
        const preview = previewFromInputs(card);
        const target = card.querySelector('.set-preview');
        if (!target) return;
        target.textContent = preview.message;
        target.classList.toggle('valid', preview.valid);
        target.classList.toggle('invalid', !preview.valid && card.querySelector('[data-side="local"]')?.value !== '');
    };

    const refreshKeepingSearch = (expandedMatchId = null) => initResultadosView({
        initialQuery: searchInput.value,
        initialPhase: phaseFilter.value,
        initialStatus: statusFilter.value,
        expandedMatchId
    });

    const bindMatchActions = () => {
        list.querySelectorAll('.toggle-result-editor').forEach(button => button.addEventListener('click', () => {
            refreshKeepingSearch(button.dataset.id);
        }));
        list.querySelectorAll('.cancel-result-editor').forEach(button => button.addEventListener('click', () => {
            refreshKeepingSearch(null);
        }));
        list.querySelectorAll('.set-points input').forEach(input => input.addEventListener('input', () => {
            const card = input.closest('.set-result-card');
            const sets = [...card.querySelectorAll('.set-points')];
            const firstTwo = sets.slice(0, 2).map(row => [row.querySelector('[data-side="local"]').value, row.querySelector('[data-side="visitante"]').value]);
            const needsThird = firstTwo.every(set => set[0] !== '' && set[1] !== '')
                && Number(firstTwo[0][0]) !== Number(firstTwo[0][1])
                && Number(firstTwo[1][0]) !== Number(firstTwo[1][1])
                && ((Number(firstTwo[0][0]) > Number(firstTwo[0][1])) !== (Number(firstTwo[1][0]) > Number(firstTwo[1][1])));
            sets[2].querySelectorAll('input').forEach(field => {
                field.disabled = !needsThird;
                if (!needsThird) field.value = '';
            });
            refreshPreview(card);
        }));
        list.querySelectorAll('.guardar-sets').forEach(button => button.addEventListener('click', () => {
            const card = button.closest('.set-result-card');
            const sets = [...card.querySelectorAll('.set-points')].map(row => {
                const localField = row.querySelector('[data-side="local"]');
                const awayField = row.querySelector('[data-side="visitante"]');
                if (localField.disabled || awayField.disabled) return null;
                return { puntosLocal: localField.value, puntosVisitante: awayField.value };
            }).filter(set => set && (set.puntosLocal !== '' || set.puntosVisitante !== ''));
            try {
                DataManager.updateMatchResult(button.dataset.id, sets);
                showToast('Resultado guardado.', { type: 'success', duration: 2400 });
                refreshKeepingSearch(null);
            } catch (error) {
                showToast(error.message, { type: 'error' });
            }
        }));
    };

    const filteredMatches = () => {
        const query = searchInput.value;
        const selectedPhase = phaseFilter.value;
        const selectedStatus = statusFilter.value;
        return getVisibleMatches({ matches, teams, tournamentId, categoryId, query }).filter(match => (
            (!selectedPhase || (match.phase || 'ZONAS') === selectedPhase)
            && (!selectedStatus || (selectedStatus === 'finished' ? match.estado === 'finalizado' : match.estado !== 'finalizado'))
        ));
    };

    const renderSearch = () => {
        const hasFilter = Boolean(normalizeTeamSearch(searchInput.value) || phaseFilter.value || statusFilter.value);
        const visibleMatches = filteredMatches();
        list.innerHTML = visibleMatches.length
            ? visibleMatches.map(matchCard).join('')
            : `<div class="empty-state"><strong>${hasFilter ? 'No se encontraron partidos con estos filtros' : 'Todavía no hay partidos confirmados'}</strong><p>${hasFilter ? 'Probá cambiando el equipo buscado, la etapa o el estado.' : 'Confirmá los emparejamientos en Programación para habilitar la carga por set.'}</p></div>`;
        bindMatchActions();
    };

    view.querySelector('#export-results-pdf')?.addEventListener('click', () => downloadResultsPdf({
        tournament,
        category,
        formatLabel: formatLabelFor(activeFormat.config),
        matches: filteredMatches(),
        teams,
        zones,
        phaseLabels: RESULT_PHASE_LABELS
    }));

    searchInput.addEventListener('input', renderSearch);
    phaseFilter.addEventListener('change', renderSearch);
    statusFilter.addEventListener('change', renderSearch);
    renderSearch();
}
