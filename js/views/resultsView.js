import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);

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
    const options = match => [['2-0', `${team(match.equipoLocalId)} gana 2–0`], ['2-1', `${team(match.equipoLocalId)} gana 2–1`], ['0-2', `${team(match.equipoVisitanteId)} gana 2–0`], ['1-2', `${team(match.equipoVisitanteId)} gana 2–1`]]
        .map(([value, label]) => `<option value="${value}" ${value === `${match.setsLocal}-${match.setsVisitante}` ? 'selected' : ''}>${label}</option>`).join('');
    view.innerHTML = `
        <h2>Resultados</h2>
        <div class="resultados-toolbar"><p><strong>${category.nombre}</strong> · Elegí sólo el marcador; los puntos se calculan automáticamente.</p><span class="calendar-chip">${matches.length} PARTIDOS</span></div>
        <div id="resultados-list" class="resultados-list">${matches.length ? matches.map(match => {
            const finished = match.estado === 'finalizado';
            return `<article class="card result-card">
                <div class="result-card-head"><span class="match-status ${finished ? 'finished' : 'pending'}">${finished ? 'FINALIZADO' : 'PENDIENTE'}</span><span class="match-meta">${zone(match.zonaId)}</span></div>
                <div class="match-body">
                    <div class="match-team-row"><span>${team(match.equipoLocalId)}</span><b class="versus">VS</b><span>${team(match.equipoVisitanteId)}</span></div>
                    <p class="match-schedule">${match.fecha ? `${match.fecha} · ${match.hora} · ${match.cancha}` : 'Aún sin fecha, horario o cancha.'}</p>
                    ${finished ? `<div class="score-current"><span>Marcador actual</span><strong>${match.setsLocal} – ${match.setsVisitante}</strong></div>` : ''}
                    <div class="result-actions"><select aria-label="Resultado de ${team(match.equipoLocalId)} contra ${team(match.equipoVisitanteId)}" class="resultado-select" data-id="${match.id}"><option value="">Seleccionar marcador</option>${options(match)}</select><button class="guardar-resultado btn-primary" data-id="${match.id}">${finished ? 'Actualizar' : 'Confirmar'}</button></div>
                </div>
            </article>`;
        }).join('') : '<div class="empty-state">No hay partidos confirmados en esta categoría. Confirmalos desde Programación para poder cargar resultados.</div>'}</div>`;
    view.querySelectorAll('.guardar-resultado').forEach(button => button.addEventListener('click', () => {
        const value = view.querySelector(`.resultado-select[data-id="${button.dataset.id}"]`).value;
        if (!value) return alert('Seleccione un marcador válido.');
        const [local, visitante] = value.split('-').map(Number);
        try { DataManager.updateMatchResult(button.dataset.id, local, visitante); initResultadosView(); } catch (error) { alert(error.message); }
    }));
}
