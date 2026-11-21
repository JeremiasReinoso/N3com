import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { PosicionesService } from '../services/standings.js';

export const initStandingsView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('posiciones-list');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { container.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; return; }
    const finalRows = PosicionesService.calcularClasificacionFinal(tournamentId, categoryId);
    const rows = finalRows || PosicionesService.calcularPosiciones(tournamentId, categoryId);
    const finalLabels = ['Campeón', 'Subcampeón', 'Tercer puesto'];
    const labelFor = index => finalRows ? (finalLabels[index] || `${index + 1}.º puesto`) : `${index + 1}.º`;
    const tableRows = rows.map((row, index) => `<tr class="${index < 3 && finalRows ? `standing-top standing-top-${index + 1}` : ''}">
        <td><span class="standing-rank">${index + 1}</span></td><td class="standing-place">${labelFor(index)}</td><td class="standing-team">${escapeHtml(row.nombre)}</td>
        <td>${row.jugados}</td><td>${row.ganados}</td><td>${row.perdidos}</td><td>${row.setsFavor}</td><td>${row.setsContra}</td><td>${row.puntosFavor}</td><td>${row.puntosContra}</td><td><strong>${row.diferenciaPuntos > 0 ? '+' : ''}${row.diferenciaPuntos}</strong></td>
    </tr>`).join('');
    const title = finalRows ? 'Clasificación final' : 'Clasificación general';
    const description = finalRows ? 'Orden definitivo según los resultados de las instancias finales y la fase clasificatoria.' : 'Tabla clasificatoria calculada con sets reales: PJ, PG, PP, SF, SC, PF, PC y DIF.';
    const podium = finalRows && rows.length ? `<div class="final-podium">${rows.slice(0, 3).map((row, index) => `<div class="podium-card podium-${index + 1}"><span>${finalLabels[index]}</span><strong>${escapeHtml(row.nombre)}</strong><small>${row.ganados} PG · ${row.setsFavor}-${row.setsContra} sets · ${row.diferenciaPuntos > 0 ? '+' : ''}${row.diferenciaPuntos} pts</small></div>`).join('')}</div>` : '';
    container.innerHTML = `<section class="card standings-card"><div class="standings-head"><div><h3>${title}</h3><p>${description}</p></div><span class="calendar-chip">${rows.length} EQUIPOS</span></div>${podium}<div class="standings-table-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Puesto</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>SF</th><th>SC</th><th>PF</th><th>PC</th><th>DIF</th></tr></thead><tbody>${tableRows || `<tr><td colspan="11">Aún no hay equipos en esta categoría.</td></tr>`}</tbody></table></div><p class="standings-legend">Orden: PG → DIF Sets → DIF Puntos → PF → Enfrentamiento directo → Criterio determinista.</p></section>`;
};
