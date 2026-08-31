import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);

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
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
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

    view.innerHTML = `
        <h2>Resultados</h2>
        <div class="resultados-toolbar"><p><strong>${category.nombre}</strong> · Cargá los puntos reales de cada set. El resultado final y la clasificación se calculan automáticamente.</p><span class="calendar-chip">${matches.length} PARTIDOS</span></div>
        <div id="resultados-list" class="set-results-list">${matches.length ? matches.map(match => {
            const finished = match.estado === 'finalizado';
            return `<article class="card set-result-card" data-id="${match.id}">
                <div class="set-result-head"><div><span class="match-status ${finished ? 'finished' : 'pending'}">${finished ? `FINALIZADO ${match.setsLocal}–${match.setsVisitante}` : 'PENDIENTE'}</span><strong>${stage(match)} · ${zone(match.zonaId)}</strong></div><small>${schedule(match)}</small></div>
                <div class="set-result-teams"><strong>${team(match.equipoLocalId)}</strong><span>vs</span><strong>${team(match.equipoVisitanteId)}</strong></div>
                <div class="sets-editor">${setsForm(match)}</div>
                <div class="set-result-footer"><p class="set-preview ${finished ? 'valid' : ''}">${finished ? `Resultado guardado: ${match.setsLocal}–${match.setsVisitante}. Podés corregir los puntos si es necesario.` : 'Ingresá los dos primeros sets.'}</p><button type="button" class="guardar-sets btn-primary" data-id="${match.id}">Guardar resultado</button></div>
            </article>`;
        }).join('') : '<div class="empty-state">No hay partidos confirmados en esta categoría. Confirmalos desde Programación para poder cargar resultados.</div>'}</div>`;

    const refreshPreview = card => {
        const preview = previewFromInputs(card);
        const target = card.querySelector('.set-preview');
        target.textContent = preview.message;
        target.classList.toggle('valid', preview.valid);
        target.classList.toggle('invalid', !preview.valid && card.querySelector('[data-side="local"]').value !== '');
    };
    view.querySelectorAll('.set-points input').forEach(input => input.addEventListener('input', () => refreshPreview(input.closest('.set-result-card'))));
    view.querySelectorAll('.guardar-sets').forEach(button => button.addEventListener('click', () => {
        const card = button.closest('.set-result-card');
        const sets = [...card.querySelectorAll('.set-points')].map(row => ({
            puntosLocal: row.querySelector('[data-side="local"]').value,
            puntosVisitante: row.querySelector('[data-side="visitante"]').value
        })).filter(set => set.puntosLocal !== '' || set.puntosVisitante !== '');
        try { DataManager.updateMatchResult(button.dataset.id, sets); initResultadosView(); } catch (error) { alert(error.message); }
    }));
}
