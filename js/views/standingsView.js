import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine } from '../engine/index.js';
import { downloadStandingsPdf } from '../services/reportsExport.js';
import { formatLabelFor } from './formatConfigurator.js';

const FINAL_LABELS = ['CAMPEÓN', 'SUBCAMPEÓN', 'TERCER PUESTO'];

const formatDifText = dif => {
    const num = Number(dif || 0);
    if (num > 0) return `+${num}`;
    if (num < 0) return `\u2212${Math.abs(num)}`;
    return '0';
};

const renderDifCell = dif => {
    const num = Number(dif || 0);
    const cls = num > 0 ? 'standing-dif-pos' : (num < 0 ? 'standing-dif-neg' : '');
    return `<td class="num-col ${cls}">${formatDifText(num)}</td>`;
};

const renderTableCard = ({ title, showCardHeader = true, rows, highlightPodium = false, cutLine = 0 }) => {
    const bodyRows = rows.map((row, index) => {
        const classes = [
            highlightPodium && index < 3 ? `standing-top standing-top-${index + 1}` : '',
            !highlightPodium && cutLine > 0 && index < cutLine ? 'standing-qualified' : ''
        ].filter(Boolean).join(' ');
        return `<tr class="${classes}">
            <td><span class="standing-rank-num">${index + 1}</span></td>
            <td class="standing-team">${escapeHtml(row.nombre)}</td>
            <td class="num-col">${row.jugados}</td>
            <td class="num-col">${row.ganados}</td>
            <td class="num-col">${row.perdidos}</td>
            <td class="num-col">${row.setsFavor}</td>
            <td class="num-col">${row.setsContra}</td>
            <td class="num-col">${row.puntosFavor}</td>
            <td class="num-col">${row.puntosContra}</td>
            ${renderDifCell(row.diferenciaPuntos)}
            <td class="num-col standing-pts">${row.puntosTabla ?? 0}</td>
        </tr>`;
    }).join('');

    return `<section class="standings-card" aria-label="${escapeHtml(title)}">
        ${showCardHeader ? `<div class="standings-head"><h3>${escapeHtml(title)}</h3><span class="chip-pill chip-blue">${rows.length} EQUIPOS</span></div>` : ''}
        <div class="standings-table-wrap">
            <table class="standings-table">
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">EQUIPO</th>
                        <th class="num-col" scope="col" title="Partidos jugados">PJ</th>
                        <th class="num-col" scope="col" title="Partidos ganados">PG</th>
                        <th class="num-col" scope="col" title="Partidos perdidos">PP</th>
                        <th class="num-col" scope="col" title="Sets a favor">SF</th>
                        <th class="num-col" scope="col" title="Sets en contra">SC</th>
                        <th class="num-col" scope="col" title="PUNTOS A FAVOR"><abbr tabindex="0" title="PUNTOS A FAVOR" data-col-tip="PUNTOS A FAVOR">PF</abbr></th>
                        <th class="num-col" scope="col" title="PUNTOS EN CONTRA"><abbr tabindex="0" title="PUNTOS EN CONTRA" data-col-tip="PUNTOS EN CONTRA">PC</abbr></th>
                        <th class="num-col" scope="col" title="Diferencia de puntos (PF − PC)">DIF</th>
                        <th class="num-col" scope="col" title="Puntos de la tabla">PTS</th>
                    </tr>
                </thead>
                <tbody>${bodyRows || '<tr><td colspan="11" style="text-align:center;color:var(--text-secondary);padding:28px;">Todavía no hay equipos cargados en esta tabla.</td></tr>'}</tbody>
            </table>
        </div>
    </section>`;
};

export const initStandingsView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const container = document.getElementById('posiciones-list');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        container.innerHTML = '<div class="empty-state"><strong>Elegí una categoría</strong><p>Seleccioná un torneo y una categoría desde Equipos para consultar las posiciones.</p></div>';
        return;
    }

    const tournament = DataManager.getTournament(tournamentId);
    const category = DataManager.getCategory(categoryId);
    const { config } = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const standingsData = CompetitionEngine.getStandings(tournamentId, categoryId);

    const orderFormula = config.standingsMode === 'points_table'
        ? 'Orden: puntos FEVA → PG → dif. sets → dif. puntos → PF → enfrentamiento directo'
        : (config.standingsMode === 'legacy_pf'
            ? 'Orden: Puntos a favor (PF) → dif. puntos → dif. sets → PG → enfrentamiento directo'
            : 'Orden: PG → dif. sets → dif. puntos → Puntos a favor (PF) → enfrentamiento directo');

    const hasFinal = Boolean(standingsData.finalClassification && standingsData.finalClassification.length);
    const mainTitleSuffix = hasFinal ? 'Clasificación final' : 'Posiciones';

    const podiumRows = hasFinal ? standingsData.finalClassification.slice(0, 3) : [];
    const podiumMarkup = podiumRows.length ? `
        <div class="final-podium" aria-label="Podio de la categoría">
            ${podiumRows.map((row, index) => `
                <article class="podium-card podium-${index + 1}">
                    <span>${FINAL_LABELS[index]}</span>
                    <strong>${escapeHtml(row.nombre)}</strong>
                    <small>${row.ganados} PG · ${row.setsFavor}–${row.setsContra} sets · ${formatDifText(row.diferenciaPuntos)}</small>
                </article>`).join('')}
        </div>` : '';

    const exportSections = [];
    const cardsMarkup = [];

    if (hasFinal) {
        exportSections.push({ title: 'Clasificación final', note: formatLabelFor(config), rows: standingsData.finalClassification });
        cardsMarkup.push(renderTableCard({
            title: 'Clasificación final',
            showCardHeader: false,
            rows: standingsData.finalClassification,
            highlightPodium: true
        }));
    }

    if (standingsData.finalGroup) {
        const carryPolicy = config.carryOverMode === 'carry_over'
            ? 'Conserva resultados previos entre clasificados'
            : 'Arranque en 0 puntos';
        exportSections.push({ title: 'Zona Final', note: carryPolicy, rows: standingsData.finalGroup });
        cardsMarkup.push(renderTableCard({
            title: `Zona Final · ${carryPolicy}`,
            showCardHeader: true,
            rows: standingsData.finalGroup,
            highlightPodium: !hasFinal
        }));
    }

    if (standingsData.byZone.length > 1) {
        const perZoneCut = config.qualificationMode === 'per_zone' ? Number(config.qualifiersPerZone || 0) : 0;
        standingsData.byZone.forEach(({ zone, standings }) => {
            exportSections.push({ title: `Posiciones — ${zone.nombre}`, rows: standings });
            cardsMarkup.push(renderTableCard({
                title: zone.nombre,
                showCardHeader: true,
                rows: standings,
                cutLine: perZoneCut
            }));
        });
    }

    if (!hasFinal || standingsData.byZone.length <= 1) {
        if (!hasFinal) {
            const generalTitle = config.formatId === 'TODOS_CONTRA_TODOS' || config.formatId === 'LIGA_RONDAS'
                ? 'Tabla general de la liga'
                : 'Clasificación general';
            const generalCut = config.qualificationMode === 'general_top_n' && config.formatId === 'ZONAS_ELIMINATORIAS'
                ? Number(config.qualifiersTotal || 0)
                : 0;
            exportSections.push({ title: generalTitle, rows: standingsData.general });
            cardsMarkup.push(renderTableCard({
                title: generalTitle,
                showCardHeader: standingsData.byZone.length > 1,
                rows: standingsData.general,
                highlightPodium: false,
                cutLine: generalCut
            }));
        }
    }

    container.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">TABLA DE POSICIONES</span>
                <h1>${escapeHtml(category.nombre)} · ${escapeHtml(mainTitleSuffix)}</h1>
                <p>${escapeHtml(orderFormula)}</p>
            </div>
            <div class="page-header-actions">
                <button id="export-standings-pdf" class="btn-primary" type="button">Exportar PDF</button>
            </div>
        </div>
        ${podiumMarkup}
        <div class="standings-stack">${cardsMarkup.join('')}</div>`;

    container.querySelector('#export-standings-pdf')?.addEventListener('click', () => downloadStandingsPdf({
        tournament,
        category,
        formatLabel: formatLabelFor(config),
        sections: exportSections,
        showPointsColumn: true
    }));
};
