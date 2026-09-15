import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);

const QUICK_RESULTS = {
    'local-20': [{ puntosLocal: 25, puntosVisitante: 15 }, { puntosLocal: 25, puntosVisitante: 15 }],
    'local-21': [{ puntosLocal: 25, puntosVisitante: 15 }, { puntosLocal: 18, puntosVisitante: 25 }, { puntosLocal: 15, puntosVisitante: 10 }],
    'visitante-20': [{ puntosLocal: 15, puntosVisitante: 25 }, { puntosLocal: 15, puntosVisitante: 25 }],
    'visitante-21': [{ puntosLocal: 15, puntosVisitante: 25 }, { puntosLocal: 25, puntosVisitante: 18 }, { puntosLocal: 10, puntosVisitante: 15 }]
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

export function initResultadosView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-resultados');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        view.innerHTML = '<h2>Carga de resultados</h2><div class="empty-state">Seleccione un torneo y una categoría desde Equipos.</div>';
        return;
    }
    const category = DataManager.getCategory(categoryId);
    const classificationMode = DataManager.getTournamentClassificationMode(tournamentId);
    const byPoints = classificationMode === 'points';
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
        const quickActions = `<fieldset class="quick-result-actions"><legend>Marcador rápido</legend><div><button type="button" class="quick-result" data-id="${match.id}" data-result="local-20">${team(match.equipoLocalId)} 2–0</button><button type="button" class="quick-result" data-id="${match.id}" data-result="local-21">${team(match.equipoLocalId)} 2–1</button><button type="button" class="quick-result" data-id="${match.id}" data-result="visitante-21">${team(match.equipoVisitanteId)} 2–1</button><button type="button" class="quick-result" data-id="${match.id}" data-result="visitante-20">${team(match.equipoVisitanteId)} 2–0</button></div></fieldset>`;
        const detailedEditor = `<details class="score-details"><summary>${finished ? 'Corregir puntos por set' : 'Cargar puntos por set'}</summary><div class="sets-editor">${setsForm(match)}</div><div class="set-result-footer"><p class="set-preview ${finished ? 'valid' : ''}">${finished ? 'Podés corregir el detalle y guardar nuevamente.' : 'Completá los sets si necesitás un marcador detallado.'}</p><button type="button" class="guardar-sets btn-primary" data-id="${match.id}">${finished ? 'Guardar cambios' : 'Guardar resultado'}</button></div></details>`;
        const pendingEntry = byPoints ? detailedEditor.replace('<details class="score-details">', '<details class="score-details" open>') : `${quickActions}${detailedEditor}`;
        return `<article class="card set-result-card ${finished ? 'is-finished' : ''}" data-id="${match.id}">
            <div class="set-result-head"><div><span class="match-status ${finished ? 'finished' : 'pending'}">${finished ? `FINALIZADO ${match.setsLocal}–${match.setsVisitante}` : 'PENDIENTE'}</span><strong>${stage(match)} · ${zone(match.zonaId)}</strong></div><small>${schedule(match)}</small></div>
            <div class="set-result-teams"><strong>${team(match.equipoLocalId)}</strong><span>${finished ? `${match.score || `${match.setsLocal}-${match.setsVisitante}`}` : 'vs'}</span><strong>${team(match.equipoVisitanteId)}</strong></div>
            ${finished ? `${savedSets(match)}${detailedEditor}` : pendingEntry}
        </article>`;
    };
    const pendingMatches = matches.filter(match => match.estado !== 'finalizado');
    const finishedMatches = matches.filter(match => match.estado === 'finalizado');

    view.innerHTML = `
        <h2>Resultados</h2>
        <div class="resultados-toolbar"><p><strong>${category.nombre}</strong> · ${byPoints ? 'Modo por puntos: cargá los puntos reales de cada set; la tabla usa ese rendimiento.' : 'Modo por sets ganados: elegí el marcador para cargar un partido en un clic; la tabla aplica 3/1 o 2/1 automáticamente.'}</p><span class="calendar-chip">${matches.length} PARTIDOS</span></div>
        <div id="resultados-list" class="set-results-list">${matches.length ? `<section class="results-group"><div class="results-group-head"><h3>Por cargar</h3><span>${pendingMatches.length}</span></div>${pendingMatches.length ? pendingMatches.map(matchCard).join('') : '<div class="empty-state compact">No quedan resultados pendientes.</div>'}</section>${finishedMatches.length ? `<details class="finished-results"><summary>Partidos finalizados <span>${finishedMatches.length}</span></summary><div class="results-group">${finishedMatches.map(matchCard).join('')}</div></details>` : ''}` : '<div class="empty-state">No hay partidos confirmados en esta categoría. Confirmalos desde Programación para poder cargar resultados.</div>'}</div>`;

    const refreshPreview = card => {
        const preview = previewFromInputs(card);
        const target = card.querySelector('.set-preview');
        target.textContent = preview.message;
        target.classList.toggle('valid', preview.valid);
        target.classList.toggle('invalid', !preview.valid && card.querySelector('[data-side="local"]').value !== '');
    };
    view.querySelectorAll('.set-points input').forEach(input => input.addEventListener('input', () => refreshPreview(input.closest('.set-result-card'))));
    view.querySelectorAll('.quick-result').forEach(button => button.addEventListener('click', () => {
        try { DataManager.updateMatchResult(button.dataset.id, QUICK_RESULTS[button.dataset.result]); initResultadosView(); } catch (error) { alert(error.message); }
    }));
    view.querySelectorAll('.guardar-sets').forEach(button => button.addEventListener('click', () => {
        const card = button.closest('.set-result-card');
        const sets = [...card.querySelectorAll('.set-points')].map(row => ({
            puntosLocal: row.querySelector('[data-side="local"]').value,
            puntosVisitante: row.querySelector('[data-side="visitante"]').value
        })).filter(set => set.puntosLocal !== '' || set.puntosVisitante !== '');
        try { DataManager.updateMatchResult(button.dataset.id, sets); initResultadosView(); } catch (error) { alert(error.message); }
    }));
}
