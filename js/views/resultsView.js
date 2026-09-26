import { AppState } from '../core/state.js';
import { renderCategoryWorkspace } from '../core/categoryWorkspace.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);

// Marcadores rápidos según el formato activo del partido: 1 set × 21 en
// zonas y cruces, 2 sets × 15 (más el tercero de desempate) en eliminatorias.
const quickResultsFor = format => format?.sets === 1
    ? {
        'local-win': [{ puntosLocal: 21, puntosVisitante: 15 }],
        'visitante-win': [{ puntosLocal: 15, puntosVisitante: 21 }]
    }
    : {
        'local-20': [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 12 }],
        'local-21': [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 12, puntosVisitante: 15 }, { puntosLocal: 15, puntosVisitante: 11 }],
        'visitante-20': [{ puntosLocal: 10, puntosVisitante: 15 }, { puntosLocal: 12, puntosVisitante: 15 }],
        'visitante-21': [{ puntosLocal: 10, puntosVisitante: 15 }, { puntosLocal: 15, puntosVisitante: 12 }, { puntosLocal: 11, puntosVisitante: 15 }]
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

// El alcance se vuelve a comprobar aquí aunque la vista ya reciba los datos
// filtrados. Así una coincidencia nunca puede recuperar un partido viejo de
// otro torneo o de otra categoría desde el almacenamiento local.
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

const previewFromInputs = (card, format) => {
    const entries = [...card.querySelectorAll('.set-points')].map(row => ({
        local: row.querySelector('[data-side="local"]').value,
        visitante: row.querySelector('[data-side="visitante"]').value
    }));
    const filled = entries.filter(set => set.local !== '' || set.visitante !== '');
    if (filled.some(set => set.local === '' || set.visitante === '')) return { message: 'Completá ambos puntajes de cada set.', valid: false };
    if (filled.some(set => Number(set.local) === Number(set.visitante))) return { message: 'Un set no puede terminar empatado.', valid: false };
    const target = format?.points;
    const reachesTarget = Number(filled[filled.length - 1]?.local) >= target || Number(filled[filled.length - 1]?.visitante) >= target;
    const shortHint = !target || reachesTarget ? '' : ` (El formato pide llegar a ${target} puntos)`;
    if (format?.sets === 1) {
        if (filled.length < 1) return { message: 'Ingresá los puntos del set.', valid: false };
        const localWins = Number(filled[0].local) > Number(filled[0].visitante);
        return { message: `Resultado calculado: ${filled[0].local}–${filled[0].visitante}${shortHint}`, valid: true, localWon: localWins };
    }
    if (filled.length < 2) return { message: 'Ingresá al menos dos sets.', valid: false };
    const localWins = filled.filter(set => Number(set.local) > Number(set.visitante)).length;
    const visitanteWins = filled.length - localWins;
    if (filled.length === 2 && (localWins === 2 || visitanteWins === 2)) return { message: `Resultado calculado: ${localWins}–${visitanteWins}${shortHint}`, valid: true, localWon: localWins === 2 };
    if (filled.length === 2) return { message: 'Hay empate 1–1: completá el tercer set (desempate).', valid: false };
    const firstTwoAreSplit = (Number(filled[0].local) > Number(filled[0].visitante)) !== (Number(filled[1].local) > Number(filled[1].visitante));
    if (firstTwoAreSplit && ((localWins === 2 && visitanteWins === 1) || (visitanteWins === 2 && localWins === 1))) return { message: `Resultado calculado: ${localWins}–${visitanteWins}${shortHint}`, valid: true, localWon: localWins === 2 };
    return { message: 'El partido debe finalizar 2–0. Si quedó 1–1, usá el tercer set.', valid: false };
};

export function initResultadosView(options = {}) {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-resultados');
    const categories = tournamentId ? DataManager.getCategoriesByTournament(tournamentId) : [];
    const categoryId = AppState.getCategory();
    const category = categories.find(item => item.id === categoryId);
    if (!tournamentId || !category) {
        view.innerHTML = '<h2>Resultados</h2><div class="empty-state">Seleccione un torneo y una categoría desde Equipos.</div>';
        return;
    }
    const byPoints = DataManager.getTournamentClassificationMode(tournamentId) === 'points';
    const setFormats = DataManager.getTournamentSetFormats(tournamentId);
    const formatByKey = Object.fromEntries(DataManager.getSetFormatOptions().map(item => [item.key, item]));
    const formatForMatch = match => DataManager.isPlayoffPhase(match) ? setFormats.playoffs : setFormats.zones;
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const categoryMatches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const unscheduledGroupMatch = categoryMatches.some(match => isOfficialMatch(match) && (!match.phase || match.phase === 'ZONAS') && (!match.fecha || !match.hora || !match.cancha));
    if (unscheduledGroupMatch && DataManager.getDaySchedules(tournamentId).length) {
        try { SchedulerService.programarEmparejamientos(tournamentId, categoryId); } catch { /* La pantalla conserva el resultado y la Programación informa cualquier conflicto. */ }
    }
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(isOfficialMatch);
    const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo';
    const zone = id => zones.find(item => item.id === id)?.nombre || 'Eliminatorias';
    const stage = match => match.nombreEtapa || (match.tipo === 'final' ? 'Final' : (match.tipo === 'semifinal' ? 'Semifinal' : `Ronda ${match.ronda || 1}`));
    const schedule = match => {
        const place = [match.hora, match.cancha].filter(Boolean).join(' · ');
        return match.fecha ? `${match.fecha}${place ? ` · ${place}` : ''}` : 'Fecha y sede por definir';
    };
    const setsForm = (match, format) => Array.from({ length: format.sets === 1 ? 1 : 3 }, (_, index) => {
        const saved = match.sets?.[index];
        const decider = format.sets !== 1 && index === 2;
        const label = decider ? 'Set 3 (desempate)' : `Set ${index + 1} (a ${format.points})`;
        return `<div class="set-points ${decider ? 'third-set' : ''}"><span>${label}</span><input data-side="local" type="number" min="0" inputmode="numeric" aria-label="Puntos de ${team(match.equipoLocalId)} en ${label}" value="${saved?.puntosLocal ?? ''}"><b>–</b><input data-side="visitante" type="number" min="0" inputmode="numeric" aria-label="Puntos de ${team(match.equipoVisitanteId)} en ${label}" value="${saved?.puntosVisitante ?? ''}"></div>`;
    }).join('');
    const savedSets = match => `<div class="saved-sets">${match.sets.map((set, index) => `<span><strong>S${index + 1}</strong> ${set.puntosLocal}–${set.puntosVisitante}</span>`).join('')}</div>`;
    const scoreLabel = (match, format) => format.sets === 1 && match.sets?.length === 1
        ? `${match.sets[0].puntosLocal}–${match.sets[0].puntosVisitante}`
        : (match.score || `${match.setsLocal}-${match.setsVisitante}`);
    const matchCard = match => {
        const format = formatForMatch(match);
        const finished = match.estado === 'finalizado';
        const expanded = options.expandedMatchId === match.id;
        const quickButtons = format.sets === 1
            ? `<div><button type="button" class="quick-result" data-id="${match.id}" data-result="local-win">${team(match.equipoLocalId)} gana</button><button type="button" class="quick-result" data-id="${match.id}" data-result="visitante-win">${team(match.equipoVisitanteId)} gana</button></div>`
            : `<div><button type="button" class="quick-result" data-id="${match.id}" data-result="local-20">${team(match.equipoLocalId)} 2–0</button><button type="button" class="quick-result" data-id="${match.id}" data-result="local-21">${team(match.equipoLocalId)} 2–1</button><button type="button" class="quick-result" data-id="${match.id}" data-result="visitante-21">${team(match.equipoVisitanteId)} 2–1</button><button type="button" class="quick-result" data-id="${match.id}" data-result="visitante-20">${team(match.equipoVisitanteId)} 2–0</button></div>`;
        const quickActions = `<fieldset class="quick-result-actions"><legend>Marcador rápido · ${format.label}</legend>${quickButtons}</fieldset>`;
        const detailedEditor = `<details class="score-details"${byPoints ? ' open' : ''}><summary>${finished ? 'Corregir puntos por set' : 'Cargar puntos por set'}</summary><div class="sets-editor">${setsForm(match, format)}</div><div class="set-result-footer"><p class="set-preview ${finished ? 'valid' : ''}">${finished ? 'Podés corregir el detalle y guardar nuevamente.' : `Completá ${format.sets === 1 ? 'el set' : 'los sets'} del partido (formato ${format.label}).`}</p><button type="button" class="guardar-sets btn-primary" data-id="${match.id}">${finished ? 'Guardar cambios' : 'Guardar resultado'}</button></div></details>`;
        const editor = finished || byPoints ? detailedEditor : `${quickActions}${detailedEditor}`;
        return `<article class="card set-result-card ${finished ? 'is-finished' : ''}" data-id="${match.id}" data-format="${format.key}">
            <div class="set-result-head"><div><span class="match-status ${finished ? 'finished' : 'pending'}">${finished ? 'JUGADO' : 'PENDIENTE'}</span><strong>${stage(match)} · ${zone(match.zonaId)}</strong></div><small>${schedule(match)}</small></div>
            <div class="set-result-teams"><strong>${team(match.equipoLocalId)}</strong><span>${finished ? scoreLabel(match, format) : 'vs'}</span><strong>${team(match.equipoVisitanteId)}</strong></div>
            ${finished ? savedSets(match) : ''}
            <div class="result-entry-action"><button type="button" class="btn-primary toggle-result-editor" data-id="${match.id}" aria-expanded="${expanded}">${finished ? 'Editar resultado' : 'Cargar resultado'}</button></div>
            <div class="result-entry-editor" ${expanded ? '' : 'hidden'}>${editor}</div>
        </article>`;
    };

    view.innerHTML = `
        <h2>Resultados</h2>
        <section class="form-card panel-control results-search-panel" aria-label="Buscar partidos por equipo">
            <div class="results-search-fields">
                <label class="form-field" for="result-category">Categoría<select id="result-category">${categories.map(item => `<option value="${item.id}" ${item.id === categoryId ? 'selected' : ''}>${item.nombre}</option>`).join('')}</select></label>
                <label class="form-field" for="result-team-search">Buscar equipo<input id="result-team-search" type="search" autocomplete="off" placeholder="Buscar equipo..." value="${String(options.initialQuery || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></label>
            </div>
        </section>
        <div class="resultados-toolbar"><p><strong>${category.nombre}</strong> · La búsqueda incluye partidos pendientes y jugados de esta categoría.</p><span id="result-match-count" class="calendar-chip">${matches.length} PARTIDOS</span></div>
        <p class="helper-text">Formato activo — Zonas y cruces: <strong>${setFormats.zones.label}</strong> · Eliminatorias: <strong>${setFormats.playoffs.label}</strong>. Se cambia en Programación → Formato de sets.</p>
        <div id="resultados-list" class="set-results-list" aria-live="polite"></div>`;

    const list = view.querySelector('#resultados-list');
    const searchInput = view.querySelector('#result-team-search');
    const count = view.querySelector('#result-match-count');

    const refreshPreview = card => {
        const preview = previewFromInputs(card, formatByKey[card.dataset.format]);
        const target = card.querySelector('.set-preview');
        target.textContent = preview.message;
        target.classList.toggle('valid', preview.valid);
        target.classList.toggle('invalid', !preview.valid && card.querySelector('[data-side="local"]').value !== '');
    };
    const refreshKeepingSearch = matchId => initResultadosView({ initialQuery: searchInput.value, expandedMatchId: matchId });
    const bindMatchActions = () => {
        list.querySelectorAll('.toggle-result-editor').forEach(button => button.addEventListener('click', () => {
            const editor = button.closest('.set-result-card').querySelector('.result-entry-editor');
            const willOpen = editor.hidden;
            list.querySelectorAll('.result-entry-editor').forEach(item => { item.hidden = true; });
            list.querySelectorAll('.toggle-result-editor').forEach(item => item.setAttribute('aria-expanded', 'false'));
            editor.hidden = !willOpen;
            button.setAttribute('aria-expanded', String(willOpen));
            if (willOpen) editor.querySelector('input')?.focus();
        }));
        list.querySelectorAll('.set-points input').forEach(input => input.addEventListener('input', () => refreshPreview(input.closest('.set-result-card'))));
        list.querySelectorAll('.quick-result').forEach(button => button.addEventListener('click', () => {
            const format = formatByKey[button.closest('.set-result-card')?.dataset.format];
            try { DataManager.updateMatchResult(button.dataset.id, quickResultsFor(format)[button.dataset.result]); refreshKeepingSearch(button.dataset.id); } catch (error) { alert(error.message); }
        }));
        list.querySelectorAll('.guardar-sets').forEach(button => button.addEventListener('click', () => {
            const card = button.closest('.set-result-card');
            const sets = [...card.querySelectorAll('.set-points')].map(row => ({
                puntosLocal: row.querySelector('[data-side="local"]').value,
                puntosVisitante: row.querySelector('[data-side="visitante"]').value
            })).filter(set => set.puntosLocal !== '' || set.puntosVisitante !== '');
            try { DataManager.updateMatchResult(button.dataset.id, sets); refreshKeepingSearch(button.dataset.id); } catch (error) { alert(error.message); }
        }));
    };
    const renderSearch = () => {
        const query = searchInput.value;
        const hasQuery = Boolean(normalizeTeamSearch(query));
        const visibleMatches = getVisibleMatches({ matches, teams, tournamentId, categoryId, query });
        count.textContent = hasQuery ? `${visibleMatches.length} PARTIDOS ENCONTRADOS` : `${matches.length} PARTIDOS`;
        list.innerHTML = visibleMatches.length
            ? visibleMatches.map(matchCard).join('')
            : `<div class="empty-state">${hasQuery ? 'No se encontraron partidos para este equipo.' : 'No hay partidos confirmados en esta categoría. Confirmalos desde Programación para poder cargar resultados.'}</div>`;
        bindMatchActions();
    };

    view.querySelector('#result-category').addEventListener('change', event => {
        AppState.setCategory(event.currentTarget.value);
        renderCategoryWorkspace();
        initResultadosView();
    });
    searchInput.addEventListener('input', renderSearch);
    renderSearch();
}
