import { AppState } from '../core/state.js';
import { renderCategoryWorkspace } from '../core/categoryWorkspace.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);

const QUICK_RESULTS = {
    'local-20': [{ puntosLocal: 25, puntosVisitante: 15 }, { puntosLocal: 25, puntosVisitante: 15 }],
    'local-21': [{ puntosLocal: 25, puntosVisitante: 15 }, { puntosLocal: 18, puntosVisitante: 25 }, { puntosLocal: 15, puntosVisitante: 10 }],
    'visitante-20': [{ puntosLocal: 15, puntosVisitante: 25 }, { puntosLocal: 15, puntosVisitante: 25 }],
    'visitante-21': [{ puntosLocal: 15, puntosVisitante: 25 }, { puntosLocal: 25, puntosVisitante: 18 }, { puntosLocal: 10, puntosVisitante: 15 }]
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

const previewFromInputs = card => {
    const entries = [...card.querySelectorAll('.set-points')].map(row => ({
        local: row.querySelector('[data-side="local"]').value,
        visitante: row.querySelector('[data-side="visitante"]').value
    }));
    const filled = entries.filter(set => set.local !== '' || set.visitante !== '');
    if (filled.some(set => set.local === '' || set.visitante === '')) return { message: 'Completá ambos puntajes de cada set.', valid: false };
    if (filled.some(set => Number(set.local) === Number(set.visitante))) return { message: 'Un set no puede terminar empatado.', valid: false };
    if (filled.length < 2) return { message: 'Ingresá al menos dos sets.', valid: false };
    const localWins = filled.filter(set => Number(set.local) > Number(set.visitante)).length;
    const visitanteWins = filled.length - localWins;
    if (filled.length === 2 && (localWins === 2 || visitanteWins === 2)) return { message: `Resultado calculado: ${localWins}–${visitanteWins}`, valid: true };
    if (filled.length === 2) return { message: 'Hay empate 1–1: completá el tercer set.', valid: false };
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
        view.innerHTML = '<h2>Resultados</h2><div class="empty-state">Seleccione un torneo y una categoría desde Equipos.</div>';
        return;
    }
    const byPoints = DataManager.getTournamentClassificationMode(tournamentId) === 'points';
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
    const setsForm = match => Array.from({ length: 3 }, (_, index) => {
        const saved = match.sets?.[index];
        return `<div class="set-points ${index === 2 ? 'third-set' : ''}"><span>Set ${index + 1}${index === 2 ? ' (desempate)' : ''}</span><input data-side="local" type="number" min="0" inputmode="numeric" aria-label="Puntos de ${team(match.equipoLocalId)} en set ${index + 1}" value="${saved?.puntosLocal ?? ''}"><b>–</b><input data-side="visitante" type="number" min="0" inputmode="numeric" aria-label="Puntos de ${team(match.equipoVisitanteId)} en set ${index + 1}" value="${saved?.puntosVisitante ?? ''}"></div>`;
    }).join('');
    const savedSets = match => `<div class="saved-sets">${match.sets.map((set, index) => `<span><strong>S${index + 1}</strong> ${set.puntosLocal}–${set.puntosVisitante}</span>`).join('')}</div>`;
    const matchCard = match => {
        const finished = match.estado === 'finalizado';
        const expanded = options.expandedMatchId === match.id;
        const quickActions = `<fieldset class="quick-result-actions"><legend>Marcador rápido</legend><div><button type="button" class="quick-result" data-id="${match.id}" data-result="local-20">${team(match.equipoLocalId)} 2–0</button><button type="button" class="quick-result" data-id="${match.id}" data-result="local-21">${team(match.equipoLocalId)} 2–1</button><button type="button" class="quick-result" data-id="${match.id}" data-result="visitante-21">${team(match.equipoVisitanteId)} 2–1</button><button type="button" class="quick-result" data-id="${match.id}" data-result="visitante-20">${team(match.equipoVisitanteId)} 2–0</button></div></fieldset>`;
        const detailedEditor = `<details class="score-details"${byPoints ? ' open' : ''}><summary>${finished ? 'Corregir puntos por set' : 'Cargar puntos por set'}</summary><div class="sets-editor">${setsForm(match)}</div><div class="set-result-footer"><p class="set-preview ${finished ? 'valid' : ''}">${finished ? 'Podés corregir el detalle y guardar nuevamente.' : 'Completá los sets si necesitás un marcador detallado.'}</p><button type="button" class="guardar-sets btn-primary" data-id="${match.id}">${finished ? 'Guardar cambios' : 'Guardar resultado'}</button></div></details>`;
        const editor = finished || byPoints ? detailedEditor : `${quickActions}${detailedEditor}`;
        return `<article class="card set-result-card ${finished ? 'is-finished' : ''}" data-id="${match.id}">
            <div class="set-result-head"><div><span class="match-status ${finished ? 'finished' : 'pending'}">${finished ? 'JUGADO' : 'PENDIENTE'}</span><strong>${stage(match)} · ${zone(match.zonaId)}</strong></div><small>${schedule(match)}</small></div>
            <div class="set-result-teams"><strong>${team(match.equipoLocalId)}</strong><span>${finished ? `${match.score || `${match.setsLocal}-${match.setsVisitante}`}` : 'vs'}</span><strong>${team(match.equipoVisitanteId)}</strong></div>
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
        <div id="resultados-list" class="set-results-list" aria-live="polite"></div>`;

    const list = view.querySelector('#resultados-list');
    const searchInput = view.querySelector('#result-team-search');
    const count = view.querySelector('#result-match-count');

    const refreshPreview = card => {
        const preview = previewFromInputs(card);
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
            try { DataManager.updateMatchResult(button.dataset.id, QUICK_RESULTS[button.dataset.result]); refreshKeepingSearch(button.dataset.id); } catch (error) { alert(error.message); }
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
        const found = findTeamMatches({ matches, teams, tournamentId, categoryId, query });
        count.textContent = normalizeTeamSearch(query) ? `${found.length} ENCONTRADOS` : `${matches.length} PARTIDOS`;
        if (!normalizeTeamSearch(query)) {
            list.innerHTML = '<div class="empty-state">Escribí el nombre de un equipo para ver todos sus partidos.</div>';
            return;
        }
        list.innerHTML = found.length ? found.map(matchCard).join('') : '<div class="empty-state">No se encontraron partidos para este equipo.</div>';
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
