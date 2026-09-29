import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { PosicionesService } from '../services/standings.js';

export const initStandingsView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('posiciones-list');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { container.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; return; }
    const bySets = false;
    const finalRows = PosicionesService.calcularClasificacionFinal(tournamentId, categoryId);
    const rows = finalRows || PosicionesService.calcularPosiciones(tournamentId, categoryId);
    const finalLabels = ['Campeón', 'Subcampeón', 'Tercer puesto'];
    const labelFor = index => finalRows ? (finalLabels[index] || `${index + 1}.º puesto`) : `${index + 1}.º`;
    const tableRows = rows.map((row, index) => `<tr class="${index < 3 && finalRows ? `standing-top standing-top-${index + 1}` : ''}">
        <td><span class="standing-rank">${index + 1}</span></td><td class="standing-place">${labelFor(index)}</td><td class="standing-team">${row.nombre}</td>
        <td>${row.jugados}</td><td>${row.ganados}</td><td>${row.perdidos}</td><td>${row.puntosFavor}</td><td>${row.puntosContra}</td><td><strong>${row.diferenciaPuntos > 0 ? '+' : ''}${row.diferenciaPuntos}</strong></td>
    </tr>`).join('');
    const title = finalRows ? 'Clasificación final' : 'Clasificación general';
    const description = finalRows ? 'La final define campeón y subcampeón.' : 'Tabla única de todas las zonas: PF, PC y DIF usan los puntos reales de cada set. Los 16 mejores pasan al Top 16.';
    const podium = finalRows && rows.length ? `<div class="final-podium">${rows.slice(0, 3).map((row, index) => `<div class="podium-card podium-${index + 1}"><span>${finalLabels[index]}</span><strong>${row.nombre}</strong><small>${row.ganados} PG · ${row.diferenciaPuntos > 0 ? '+' : ''}${row.diferenciaPuntos} puntos</small></div>`).join('')}</div>` : '';
    const columnCount = bySets ? 13 : 12;
    container.innerHTML = `<section class="card standings-card"><div class="standings-head"><div><h3>${title}</h3><p>${description}</p></div><span class="calendar-chip">${rows.length} EQUIPOS</span></div>${podium}<div class="standings-table-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Puesto</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>PF</th><th>PC</th><th>DIF</th></tr></thead><tbody>${tableRows || `<tr><td colspan="9">Aún no hay equipos en esta categoría.</td></tr>`}</tbody></table></div><p class="standings-legend">Orden: PF → DIF → resultado entre ambos → criterio determinista.</p></section>`;
};
