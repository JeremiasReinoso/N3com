import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine } from '../engine/index.js';
import { downloadStandingsPdf, downloadStandingsCsv } from '../services/reportsExport.js';
import { formatLabelFor } from './formatConfigurator.js';

const FINAL_LABELS = ['Campeón', 'Subcampeón', 'Tercer puesto'];

const renderTableCard = ({ title, description, badge, rows, isFinal = false, showPoints = false, cutLine = 0, legend = '' }) => {
    const labelFor = index => (isFinal ? (FINAL_LABELS[index] || `${index + 1}.º puesto`) : `${index + 1}.º`);
    const bodyRows = rows.map((row, index) => {
        const classes = [
            isFinal && index < 3 ? `standing-top standing-top-${index + 1}` : '',
            !isFinal && cutLine > 0 && index < cutLine ? 'standing-qualified' : ''
        ].filter(Boolean).join(' ');
        return `<tr class="${classes}">
            <td><span class="standing-rank">${index + 1}</span></td>
            <td class="standing-place">${labelFor(index)}</td>
            <td class="standing-team">${escapeHtml(row.nombre)}</td>
            <td>${row.jugados}</td><td>${row.ganados}</td><td>${row.perdidos}</td>
            <td>${row.setsFavor}</td><td>${row.setsContra}</td>
            <td>${row.puntosFavor}</td><td>${row.puntosContra}</td>
            <td><strong>${row.diferenciaPuntos > 0 ? '+' : ''}${row.diferenciaPuntos}</strong></td>
            ${showPoints ? `<td><strong>${row.puntosTabla ?? 0}</strong></td>` : ''}
        </tr>`;
    }).join('');
    const podium = isFinal && rows.length
        ? `<div class="final-podium">${rows.slice(0, 3).map((row, index) => `<div class="podium-card podium-${index + 1}"><span>${FINAL_LABELS[index]}</span><strong>${escapeHtml(row.nombre)}</strong><small>${row.ganados} PG · ${row.setsFavor}-${row.setsContra} sets · ${row.diferenciaPuntos > 0 ? '+' : ''}${row.diferenciaPuntos} pts</small></div>`).join('')}</div>`
        : '';
    const colSpan = showPoints ? 12 : 11;
    return `<section class="card standings-card">
        <div class="standings-head"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><span class="calendar-chip">${escapeHtml(badge)}</span></div>
        ${podium}
        <div class="standings-table-wrap"><table class="standings-table">
            <thead><tr><th>#</th><th>Puesto</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>SF</th><th>SC</th><th>PF</th><th>PC</th><th>DIF</th>${showPoints ? '<th>PTS</th>' : ''}</tr></thead>
            <tbody>${bodyRows || `<tr><td colspan="${colSpan}">Aún no hay equipos registrados.</td></tr>`}</tbody>
        </table></div>
        ${legend ? `<p class="standings-legend">${escapeHtml(legend)}</p>` : ''}
    </section>`;
};

export const initStandingsView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('posiciones-list');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) { container.innerHTML = '<p>Seleccione un torneo y una categoría desde Equipos.</p>'; return; }

    const tournament = DataManager.getTournament(tournamentId);
    const category = DataManager.getCategory(categoryId);
    const { config } = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const standingsData = CompetitionEngine.getStandings(tournamentId, categoryId);
    const showPoints = config.standingsMode === 'points_table';
    const legend = showPoints
        ? 'Orden: PTS (FEVA 3-2-1-0) → PG → DIF Sets → DIF Puntos → PF → Enfrentamiento directo.'
        : (config.standingsMode === 'legacy_pf'
            ? 'Orden histórico: PF → DIF Puntos → DIF Sets → PG → Enfrentamiento directo.'
            : 'Orden: PG → DIF Sets → DIF Puntos → PF → Enfrentamiento directo (mini-tabla en empates múltiples).');

    const exportSections = [];
    const cardsMarkup = [];

    if (standingsData.finalClassification) {
        exportSections.push({ title: 'Clasificación Definitiva', note: formatLabelFor(config), rows: standingsData.finalClassification });
        cardsMarkup.push(renderTableCard({
            title: 'Clasificación definitiva',
            description: `Orden final de ${category.nombre} (${formatLabelFor(config)}).`,
            badge: `${standingsData.finalClassification.length} EQUIPOS`,
            rows: standingsData.finalClassification,
            isFinal: true,
            showPoints,
            legend
        }));
    }

    if (standingsData.finalGroup) {
        const carryPolicy = config.carryOverMode === 'carry_over'
            ? 'Conserva resultados previos entre clasificados'
            : 'Arranque en 0 puntos (sin arrastre)';
        exportSections.push({ title: 'Zona Final', note: carryPolicy, rows: standingsData.finalGroup });
        cardsMarkup.push(renderTableCard({
            title: 'Tabla — Zona Final',
            description: `Regla aplicada: ${carryPolicy}.`,
            badge: `${standingsData.finalGroup.length} CLASIFICADOS`,
            rows: standingsData.finalGroup,
            showPoints,
            legend
        }));
    }

    if (standingsData.byZone.length > 1) {
        const perZoneCut = config.qualificationMode === 'per_zone' ? Number(config.qualifiersPerZone || 0) : 0;
        standingsData.byZone.forEach(({ zone, standings }) => {
            exportSections.push({ title: `Posiciones — ${zone.nombre}`, rows: standings });
            cardsMarkup.push(renderTableCard({
                title: `Posiciones — ${zone.nombre}`,
                description: perZoneCut > 0 ? `Clasifican los primeros ${perZoneCut} de la zona.` : 'Tabla acumulada con sets reales.',
                badge: `${standings.length} EQUIPOS`,
                rows: standings,
                showPoints,
                cutLine: perZoneCut
            }));
        });
    }

    if (!standingsData.finalClassification || standingsData.byZone.length <= 1) {
        const generalTitle = config.formatId === 'TODOS_CONTRA_TODOS' || config.formatId === 'LIGA_RONDAS'
            ? 'Tabla general de la liga'
            : 'Clasificación general';
        const generalCut = config.qualificationMode === 'general_top_n' && config.formatId === 'ZONAS_ELIMINATORIAS'
            ? Number(config.qualifiersTotal || 0)
            : 0;
        exportSections.push({ title: generalTitle, rows: standingsData.general });
        cardsMarkup.push(renderTableCard({
            title: generalTitle,
            description: `Formato: ${formatLabelFor(config)}. PF, PC y DIF suman los puntos reales de todos los sets.`,
            badge: `${standingsData.general.length} EQUIPOS`,
            rows: standingsData.general,
            showPoints,
            cutLine: generalCut,
            legend
        }));
    }

    container.innerHTML = `
        <div class="fixture-export-actions" style="margin-bottom: 16px;">
            <button id="export-standings-pdf" class="btn-primary" type="button">Exportar posiciones (PDF)</button>
            <button id="export-standings-csv" class="btn-secondary" type="button">Exportar posiciones (CSV)</button>
        </div>
        <div class="standings-stack">${cardsMarkup.join('')}</div>`;

    container.querySelector('#export-standings-pdf')?.addEventListener('click', () => downloadStandingsPdf({
        tournament,
        category,
        formatLabel: formatLabelFor(config),
        sections: exportSections,
        showPointsColumn: showPoints
    }));
    container.querySelector('#export-standings-csv')?.addEventListener('click', () => downloadStandingsCsv({
        tournament,
        category,
        sections: exportSections,
        showPointsColumn: showPoints
    }));
};
