import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PlayoffsService } from '../services/playoffs.js';

export function initPlayoffsView() {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('eliminatorias-list');
    const controls = document.querySelector('#view-eliminatorias .panel-control');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        controls.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>';
        container.innerHTML = '';
        return;
    }
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId)
        .filter(match => match.tipo === 'semifinal' || match.tipo === 'final');
    const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo';
    controls.innerHTML = `<p>Las semifinales se forman con la clasificación general: 1.º vs 4.º y 2.º vs 3.º.</p><button id="btn-generar-eliminatorias" class="btn-primary btn-large">Generar semifinales</button><button id="btn-generar-final" class="btn-primary btn-large">Generar final</button>`;
    container.innerHTML = matches.length ? matches.map(match => `<article class="card"><p><strong>${match.nombreEtapa || match.tipo}</strong> · ${match.estado === 'finalizado' ? 'FINALIZADO' : 'PENDIENTE'}</p><h4>${team(match.equipoLocalId)} vs ${team(match.equipoVisitanteId)}</h4><p>${match.fecha} · ${match.hora} · ${match.cancha}</p>${match.estado === 'finalizado' ? `<p>${match.setsLocal}-${match.setsVisitante}</p>` : ''}</article>`).join('') : '<p>No hay eliminatorias generadas.</p>';
    document.getElementById('btn-generar-eliminatorias').addEventListener('click', () => {
        try { PlayoffsService.generarSemifinales(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); }
    });
    document.getElementById('btn-generar-final').addEventListener('click', () => {
        try { PlayoffsService.generarFinal(tournamentId, categoryId); initPlayoffsView(); } catch (error) { alert(error.message); }
    });
}
