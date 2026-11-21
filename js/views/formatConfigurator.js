import { escapeHtml } from '../core/escapeHtml.js';
import { CompetitionEngine, FormatRegistry, ValidationEngine } from '../engine/index.js';

const STANDINGS_MODE_OPTIONS = [
    ['wins', 'Estándar Newcom (PG → DIF Sets → DIF Puntos → PF)'],
    ['points_table', 'Tabla por puntos FEVA (2-0: 3 pts · 2-1: 2 pts · 1-2: 1 pt · 0-2: 0 pts)'],
    ['legacy_pf', 'Histórico por puntos a favor (PF → DIF Puntos → PG)']
];

const SEEDING_OPTIONS = [
    ['overall_rank', 'Por ranking general (1.º vs último)'],
    ['zone_cross', 'Cruces entre zonas (1.º A vs 2.º B)'],
    ['reseed', 'Re-seeding en cada ronda (legado Top 16)']
];

export const formatLabelFor = rawConfig => {
    const { definition, config } = FormatRegistry.resolve(rawConfig);
    if (config.formatId === 'ZONAS_ZONA_FINAL') {
        const policy = config.carryOverMode === 'carry_over' ? 'con arrastre entre clasificados' : 'arranque en 0 puntos';
        return `${definition.name} (${policy})`;
    }
    if (config.formatId === 'ZONAS_ELIMINATORIAS') {
        const qual = config.qualificationMode === 'per_zone'
            ? `Top ${config.qualifiersPerZone || 2}/zona${config.bestOthers ? ` + ${config.bestOthers} mej.` : ''}`
            : `Top ${config.qualifiersTotal || 16}`;
        return `${definition.name} · ${qual}`;
    }
    if (config.formatId === 'TODOS_CONTRA_TODOS' || config.formatId === 'LIGA_RONDAS') {
        return `${definition.name}${config.vueltas > 1 ? ` (${config.vueltas} vueltas)` : ''}`;
    }
    if (config.formatId === 'PERSONALIZADO') {
        const chain = (config.stages || []).map(stage => stage.type).join(' → ');
        return `${definition.name}${chain ? ` (${chain})` : ''}`;
    }
    return definition.name;
};

const renderOptionList = (items, selected) => items
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');

const renderCustomStageRow = (stage, index, total) => `
    <div class="custom-stage-row" data-stage-index="${index}">
        <div class="custom-stage-head">
            <strong>Fase ${index + 1}</strong>
            ${total > 1 ? `<button type="button" class="btn-secondary remove-custom-stage" data-stage-index="${index}">Quitar</button>` : ''}
        </div>
        <div class="form-grid">
            <label class="form-field">Tipo de fase
                <select class="custom-stage-type" data-stage-index="${index}">
                    ${renderOptionList([
                        ['ZONAS', 'Fase de Zonas'],
                        ['LIGA', 'Todos contra Todos / Liga'],
                        ['ZONA_FINAL', 'Zona Final'],
                        ['ELIMINATORIAS', 'Eliminatorias']
                    ], stage.type)}
                </select>
            </label>
            ${stage.type === 'ZONAS' ? `
                <label class="form-field">Modo de zonas
                    <select class="custom-stage-group-mode" data-stage-index="${index}">
                        ${renderOptionList([['round_robin', 'Todos contra todos por zona'], ['guaranteed', 'Partidos garantizados']], stage.groupMode || 'round_robin')}
                    </select>
                </label>
                <label class="form-field">Zonas previstas
                    <input class="custom-stage-zones" type="number" min="1" max="16" value="${Number(stage.zonesCount || 2)}" data-stage-index="${index}">
                </label>
                <label class="form-field">Clasificados por zona
                    <input class="custom-stage-qpz" type="number" min="1" max="16" value="${Number(stage.qualifiersPerZone || 2)}" data-stage-index="${index}">
                </label>
                <label class="form-field">Mejores adicionales
                    <input class="custom-stage-best" type="number" min="0" max="8" value="${Number(stage.bestOthers || 0)}" data-stage-index="${index}">
                </label>
            ` : ''}
            ${stage.type === 'LIGA' ? `
                <label class="form-field">Vueltas
                    <input class="custom-stage-vueltas" type="number" min="1" max="4" value="${Number(stage.vueltas || 1)}" data-stage-index="${index}">
                </label>
                ${index < total - 1 ? `<label class="form-field">Clasificados a siguiente fase
                    <input class="custom-stage-qtotal" type="number" min="2" max="32" value="${Number(stage.qualifiersTotal || 4)}" data-stage-index="${index}">
                </label>` : ''}
            ` : ''}
            ${stage.type === 'ZONA_FINAL' ? `
                <label class="form-field">Política de puntos (obligatoria)
                    <select class="custom-stage-carryover" data-stage-index="${index}">
                        ${renderOptionList([
                            ['reset', 'Arranque en 0 puntos (todos contra todos nuevo)'],
                            ['carry_over', 'Conservar resultados previos entre clasificados']
                        ], stage.carryOverMode || 'reset')}
                    </select>
                </label>
                <label class="form-field">Vueltas Zona Final
                    <input class="custom-stage-vueltas" type="number" min="1" max="2" value="${Number(stage.vueltas || 1)}" data-stage-index="${index}">
                </label>
            ` : ''}
            ${stage.type === 'ELIMINATORIAS' ? `
                <label class="license-toggle">
                    <input class="custom-stage-third" type="checkbox" data-stage-index="${index}" ${stage.thirdPlace ? 'checked' : ''}> Incluir partido por Tercer Puesto
                </label>
            ` : ''}
        </div>
    </div>`;

export const mountCategoryFormatConfigurator = ({ container, tournamentId, categoryId, teamCount, zoneCount, onSaved }) => {
    if (!container) return;
    const formats = FormatRegistry.list().filter(item => ['A', 'B', 'C', 'D', 'E', 'F'].includes(item.code));
    let draft = structuredClone(CompetitionEngine.getCategoryFormat(tournamentId, categoryId).config);
    if (!Array.isArray(draft.stages) || !draft.stages.length) {
        draft.stages = [
            { type: 'ZONAS', groupMode: 'round_robin', zonesCount: Math.max(1, zoneCount || 2), qualifiersPerZone: 2, bestOthers: 0 },
            { type: 'ELIMINATORIAS', thirdPlace: true }
        ];
    }

    const render = () => {
        const validation = ValidationEngine.validateFormatConfig(draft, {
            ...(teamCount ? { teamCount } : {}),
            ...(zoneCount ? { zoneCount } : {})
        });
        const activeDef = FormatRegistry.get(draft.formatId) || formats[0];
        const statusMarkup = !validation.valid
            ? `<div class="planning-warning" role="alert"><strong>Configuración inválida:</strong> ${escapeHtml(validation.errors.join(' '))}</div>`
            : (validation.warnings.length
                ? `<div class="planning-notice">${escapeHtml(validation.warnings.join(' '))}</div>`
                : '<p class="helper-text">Configuración coherente y validada para esta categoría.</p>');

        container.innerHTML = `
            <section class="form-card panel-control format-configurator" aria-label="Formato de competición de la categoría">
                <div class="form-title">
                    <div>
                        <h3>Formato de competición y reglas</h3>
                        <p>${escapeHtml(activeDef.shortDescription)}</p>
                    </div>
                    <span class="calendar-chip">FORMATO ${escapeHtml(activeDef.code || '')}</span>
                </div>
                <form id="category-format-form" class="format-config-form">
                    <div class="form-grid">
                        <label class="form-field">Modalidad de competición
                            <select id="cfg-format-id">
                                ${formats.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.formatId ? 'selected' : ''}>Formato ${escapeHtml(item.code)} — ${escapeHtml(item.name)}</option>`).join('')}
                            </select>
                        </label>
                        <label class="form-field">Regla de tabla / desempate
                            <select id="cfg-standings-mode">
                                ${renderOptionList(STANDINGS_MODE_OPTIONS, draft.standingsMode || 'wins')}
                            </select>
                        </label>
                    </div>

                    ${draft.formatId === 'ZONAS_ELIMINATORIAS' ? `
                        <div class="form-grid">
                            <label class="form-field">Partidos en fase de zonas
                                <select id="cfg-group-mode">
                                    ${renderOptionList([
                                        ['guaranteed', 'Partidos garantizados'],
                                        ['round_robin', 'Todos contra todos dentro de cada zona']
                                    ], draft.groupMode || 'guaranteed')}
                                </select>
                            </label>
                            ${(draft.groupMode || 'guaranteed') === 'guaranteed' ? `
                                <label class="form-field">Garantizados por equipo
                                    <input id="cfg-guaranteed" type="number" min="1" max="20" value="${Number(draft.guaranteedMatches || 3)}">
                                </label>
                            ` : ''}
                            <label class="form-field">Clasificación a eliminatorias
                                <select id="cfg-qual-mode">
                                    ${renderOptionList([
                                        ['general_top_n', 'Mejores de la tabla general (Top N)'],
                                        ['per_zone', 'Mejores por zona (+ mejores terceros opcional)']
                                    ], draft.qualificationMode || 'general_top_n')}
                                </select>
                            </label>
                            ${(draft.qualificationMode || 'general_top_n') === 'general_top_n' ? `
                                <label class="form-field">Cantidad de clasificados (Top N)
                                    <select id="cfg-qual-total">
                                        ${renderOptionList([['2', 'Top 2 (Final directa)'], ['4', 'Top 4 (Semifinales)'], ['8', 'Top 8 (Cuartos)'], ['16', 'Top 16 (Octavos)'], ['3', 'Top 3 (con bye)'], ['6', 'Top 6 (con byes)'], ['12', 'Top 12 (con byes)']], String(draft.qualifiersTotal || 16))}
                                    </select>
                                </label>
                            ` : `
                                <label class="form-field">Clasificados por zona
                                    <input id="cfg-qual-per-zone" type="number" min="1" max="16" value="${Number(draft.qualifiersPerZone || 2)}">
                                </label>
                                <label class="form-field">Mejores adicionales (terceros)
                                    <input id="cfg-best-others" type="number" min="0" max="8" value="${Number(draft.bestOthers || 0)}">
                                </label>
                            `}
                            <label class="form-field">Ordenamiento de cruces
                                <select id="cfg-seeding-mode">
                                    ${renderOptionList(SEEDING_OPTIONS, draft.seedingMode || 'overall_rank')}
                                </select>
                            </label>
                            <label class="license-toggle">
                                <input id="cfg-third-place" type="checkbox" ${draft.thirdPlace ? 'checked' : ''}> Incluir partido por Tercer Puesto
                            </label>
                        </div>
                    ` : ''}

                    ${draft.formatId === 'TODOS_CONTRA_TODOS' || draft.formatId === 'LIGA_RONDAS' ? `
                        <div class="form-grid">
                            <label class="form-field">Cantidad de vueltas
                                <select id="cfg-vueltas">
                                    ${renderOptionList([['1', '1 vuelta (enfrentamiento único)'], ['2', '2 vueltas (ida y vuelta)']], String(draft.vueltas || 1))}
                                </select>
                            </label>
                            <label class="license-toggle">
                                <input id="cfg-include-playoffs" type="checkbox" ${draft.includePlayoffs ? 'checked' : ''}> Agregar eliminatorias finales al cerrar la tabla
                            </label>
                            ${draft.includePlayoffs ? `
                                <label class="form-field">Clasificados a eliminatorias
                                    <input id="cfg-qual-total" type="number" min="2" max="16" value="${Number(draft.qualifiersTotal || 4)}">
                                </label>
                                <label class="license-toggle">
                                    <input id="cfg-third-place" type="checkbox" ${draft.thirdPlace ? 'checked' : ''}> Incluir Tercer Puesto
                                </label>
                            ` : ''}
                        </div>
                    ` : ''}

                    ${draft.formatId === 'ZONAS_ZONA_FINAL' ? `
                        <div class="form-grid">
                            <label class="form-field">Política de puntos en Zona Final (explícita)
                                <select id="cfg-carry-over">
                                    ${renderOptionList([
                                        ['reset', 'Comienzan en cero puntos (todos contra todos nuevo)'],
                                        ['carry_over', 'Conservan resultados previos entre clasificados']
                                    ], draft.carryOverMode || 'reset')}
                                </select>
                            </label>
                            <label class="form-field">Clasificación hacia Zona Final
                                <select id="cfg-qual-mode">
                                    ${renderOptionList([['per_zone', 'Top por zona'], ['general_top_n', 'Top N tabla general']], draft.qualificationMode || 'per_zone')}
                                </select>
                            </label>
                            ${(draft.qualificationMode || 'per_zone') === 'per_zone' ? `
                                <label class="form-field">Clasificados por zona
                                    <input id="cfg-qual-per-zone" type="number" min="1" max="8" value="${Number(draft.qualifiersPerZone || 2)}">
                                </label>
                                <label class="form-field">Mejores adicionales
                                    <input id="cfg-best-others" type="number" min="0" max="8" value="${Number(draft.bestOthers || 0)}">
                                </label>
                            ` : `
                                <label class="form-field">Total en Zona Final
                                    <input id="cfg-qual-total" type="number" min="2" max="12" value="${Number(draft.qualifiersTotal || 4)}">
                                </label>
                            `}
                            <label class="form-field">Vueltas en Zona Final
                                <select id="cfg-final-vueltas">
                                    ${renderOptionList([['1', '1 vuelta'], ['2', '2 vueltas']], String(draft.finalVueltas || 1))}
                                </select>
                            </label>
                        </div>
                        <p class="helper-text">La Zona Final define la clasificación definitiva y no genera eliminatorias automáticas.</p>
                    ` : ''}

                    ${draft.formatId === 'ELIMINACION_DIRECTA' ? `
                        <div class="form-grid">
                            <label class="license-toggle">
                                <input id="cfg-third-place" type="checkbox" ${draft.thirdPlace ? 'checked' : ''}> Incluir partido por Tercer Puesto
                            </label>
                        </div>
                        <p class="helper-text">Si la cantidad de equipos no es potencia de dos (3, 5, 6, 10, 12, 20…), los mejores seeds recibirán descansos (byes) automáticos sin crear cruces ficticios.</p>
                    ` : ''}

                    ${draft.formatId === 'PERSONALIZADO' ? `
                        <div class="custom-stages-builder">
                            ${(draft.stages || []).map((stage, index, list) => renderCustomStageRow(stage, index, list.length)).join('')}
                            <div class="form-actions">
                                <button type="button" id="add-custom-stage" class="btn-secondary">+ Agregar fase</button>
                            </div>
                        </div>
                    ` : ''}

                    ${statusMarkup}
                    <div class="form-actions">
                        <button class="btn-primary" type="submit" ${validation.valid ? '' : 'disabled'}>Guardar formato de categoría</button>
                    </div>
                </form>
            </section>`;

        const form = container.querySelector('#category-format-form');
        const syncAndRender = updater => {
            updater();
            render();
        };

        form.querySelector('#cfg-format-id')?.addEventListener('change', event => syncAndRender(() => {
            const nextId = event.currentTarget.value;
            const prevStandings = draft.standingsMode;
            draft = FormatRegistry.createConfig(nextId, { standingsMode: nextId === 'LIGA_RONDAS' ? 'points_table' : (prevStandings || 'wins') });
        }));
        form.querySelector('#cfg-standings-mode')?.addEventListener('change', event => syncAndRender(() => { draft.standingsMode = event.currentTarget.value; }));
        form.querySelector('#cfg-group-mode')?.addEventListener('change', event => syncAndRender(() => { draft.groupMode = event.currentTarget.value; }));
        form.querySelector('#cfg-guaranteed')?.addEventListener('change', event => syncAndRender(() => { draft.guaranteedMatches = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-qual-mode')?.addEventListener('change', event => syncAndRender(() => { draft.qualificationMode = event.currentTarget.value; }));
        form.querySelector('#cfg-qual-total')?.addEventListener('change', event => syncAndRender(() => { draft.qualifiersTotal = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-qual-per-zone')?.addEventListener('change', event => syncAndRender(() => { draft.qualifiersPerZone = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-best-others')?.addEventListener('change', event => syncAndRender(() => { draft.bestOthers = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-seeding-mode')?.addEventListener('change', event => syncAndRender(() => { draft.seedingMode = event.currentTarget.value; }));
        form.querySelector('#cfg-third-place')?.addEventListener('change', event => syncAndRender(() => { draft.thirdPlace = event.currentTarget.checked; }));
        form.querySelector('#cfg-vueltas')?.addEventListener('change', event => syncAndRender(() => { draft.vueltas = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-include-playoffs')?.addEventListener('change', event => syncAndRender(() => {
            draft.includePlayoffs = event.currentTarget.checked;
            if (draft.includePlayoffs && !draft.qualifiersTotal) draft.qualifiersTotal = 4;
        }));
        form.querySelector('#cfg-carry-over')?.addEventListener('change', event => syncAndRender(() => { draft.carryOverMode = event.currentTarget.value; }));
        form.querySelector('#cfg-final-vueltas')?.addEventListener('change', event => syncAndRender(() => { draft.finalVueltas = Number(event.currentTarget.value); }));

        form.querySelector('#add-custom-stage')?.addEventListener('click', () => syncAndRender(() => {
            draft.stages = [...(draft.stages || []), { type: 'ELIMINATORIAS', thirdPlace: false }];
        }));
        form.querySelectorAll('.remove-custom-stage').forEach(btn => btn.addEventListener('click', () => syncAndRender(() => {
            const idx = Number(btn.dataset.stageIndex);
            draft.stages.splice(idx, 1);
        })));
        form.querySelectorAll('.custom-stage-type').forEach(sel => sel.addEventListener('change', event => syncAndRender(() => {
            const idx = Number(sel.dataset.stageIndex);
            const type = event.currentTarget.value;
            if (type === 'ZONAS') draft.stages[idx] = { type, groupMode: 'round_robin', zonesCount: 2, qualifiersPerZone: 2, bestOthers: 0 };
            else if (type === 'LIGA') draft.stages[idx] = { type, vueltas: 1, qualifiersTotal: 4 };
            else if (type === 'ZONA_FINAL') draft.stages[idx] = { type, carryOverMode: 'reset', vueltas: 1 };
            else draft.stages[idx] = { type: 'ELIMINATORIAS', thirdPlace: false };
        })));
        form.querySelectorAll('.custom-stage-group-mode').forEach(sel => sel.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(sel.dataset.stageIndex)].groupMode = event.currentTarget.value; })));
        form.querySelectorAll('.custom-stage-zones').forEach(inp => inp.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(inp.dataset.stageIndex)].zonesCount = Number(event.currentTarget.value); })));
        form.querySelectorAll('.custom-stage-qpz').forEach(inp => inp.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(inp.dataset.stageIndex)].qualifiersPerZone = Number(event.currentTarget.value); })));
        form.querySelectorAll('.custom-stage-best').forEach(inp => inp.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(inp.dataset.stageIndex)].bestOthers = Number(event.currentTarget.value); })));
        form.querySelectorAll('.custom-stage-vueltas').forEach(inp => inp.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(inp.dataset.stageIndex)].vueltas = Number(event.currentTarget.value); })));
        form.querySelectorAll('.custom-stage-qtotal').forEach(inp => inp.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(inp.dataset.stageIndex)].qualifiersTotal = Number(event.currentTarget.value); })));
        form.querySelectorAll('.custom-stage-carryover').forEach(sel => sel.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(sel.dataset.stageIndex)].carryOverMode = event.currentTarget.value; })));
        form.querySelectorAll('.custom-stage-third').forEach(chk => chk.addEventListener('change', event => syncAndRender(() => { draft.stages[Number(chk.dataset.stageIndex)].thirdPlace = event.currentTarget.checked; })));

        form.addEventListener('submit', event => {
            event.preventDefault();
            try {
                CompetitionEngine.setCategoryFormat(tournamentId, categoryId, draft);
                alert('Formato y reglas de la categoría guardados correctamente.');
                onSaved?.();
            } catch (error) {
                alert(error.message);
            }
        });
    };

    render();
};
