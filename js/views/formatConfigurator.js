import { escapeHtml } from '../core/escapeHtml.js';
import { CompetitionEngine, FormatRegistry, ValidationEngine } from '../engine/index.js';
import { showToast } from '../ui/feedback.js';
import { icon } from '../ui/icons.js';

const STANDINGS_MODE_OPTIONS = [
    ['wins', 'Estándar Newcom (PG → DIF Sets → DIF Puntos → PF)'],
    ['points_table', 'Tabla por puntos FEVA (2-0: 3 pts · 2-1: 2 pts · 1-2: 1 pt · 0-2: 0 pts)'],
    ['legacy_pf', 'Histórico por puntos a favor (PF → DIF Puntos → PG)']
];

const SEEDING_OPTIONS = [
    ['overall_rank', 'Por tabla general (1.º vs último clasificado)'],
    ['zone_cross', 'Cruces entre zonas (1.º A vs 2.º B)'],
    ['reseed', 'Re-ordenar en cada ronda (tradicional TOP 16)']
];

// Plantillas claras de 1 clic para el organizador (incluyendo TOP 16 y esquemas reales Águilas Doradas)
export const TOURNAMENT_MODALITY_PRESETS = Object.freeze([
    {
        key: 'GARANTIZADOS_ACTUAL',
        title: 'Formato Actual (Garantizados)',
        subtitle: 'Mínimo de partidos garantizados por equipo + llaves finales.',
        build: (guaranteed = 3) => FormatRegistry.createConfig('ZONAS_ELIMINATORIAS', {
            presetKey: 'GARANTIZADOS_ACTUAL',
            groupMode: 'guaranteed',
            guaranteedMatches: Number(guaranteed || 3),
            qualificationMode: 'general_top_n',
            qualifiersTotal: 8,
            seedingMode: 'overall_rank',
            thirdPlace: true
        })
    },
    {
        key: 'TOP_16',
        title: 'TOP 16 Clásico',
        subtitle: 'Fase inicial → Tabla general → 1.º vs 16.º hasta Campeón.',
        build: (guaranteed = 3) => FormatRegistry.createConfig('ZONAS_ELIMINATORIAS', {
            presetKey: 'TOP_16',
            groupMode: 'guaranteed',
            guaranteedMatches: Number(guaranteed || 3),
            qualificationMode: 'general_top_n',
            qualifiersTotal: 16,
            seedingMode: 'overall_rank',
            thirdPlace: true
        })
    },
    {
        key: 'ZONAS_CLASICO',
        title: 'Torneo por Zonas',
        subtitle: 'Todos contra todos en cada zona → Clasifican los mejores.',
        build: () => FormatRegistry.createConfig('ZONAS_ELIMINATORIAS', {
            presetKey: 'ZONAS_CLASICO',
            groupMode: 'round_robin',
            qualificationMode: 'per_zone',
            qualifiersPerZone: 2,
            bestOthers: 0,
            seedingMode: 'zone_cross',
            thirdPlace: true
        })
    },
    {
        key: 'CAMPEONATO_ESTIMULO',
        title: 'Campeonato + Estímulo / Triangulares',
        subtitle: 'Zonas → Sub-zonas por puestos (Z1-Z2 Oro + Z3-Z6 Estímulo) y Finales.',
        build: () => FormatRegistry.createConfig('ZONAS_SUBZONAS', {
            presetKey: 'CAMPEONATO_ESTIMULO',
            groupMode: 'round_robin',
            subZoneScheme: 'auto',
            qualifiersPerZone: 2,
            thirdPlace: true,
            placementCrosses: true
        })
    },
    {
        key: 'ZONA_UNICA_SEMIS',
        title: 'Todos contra Todos + Semifinales',
        subtitle: 'Zona única todos contra todos → Semis (1.ºv4.º / 2.ºv3.º) y Final.',
        build: () => FormatRegistry.createConfig('TODOS_CONTRA_TODOS', {
            presetKey: 'ZONA_UNICA_SEMIS',
            vueltas: 1,
            includePlayoffs: true,
            qualifiersTotal: 4,
            thirdPlace: true
        })
    },
    {
        key: 'TODOS_CONTRA_TODOS_PURO',
        title: 'Todos contra Todos (Tabla directa)',
        subtitle: 'Liga completa sin eliminatorias; define campeón por tabla.',
        build: () => FormatRegistry.createConfig('TODOS_CONTRA_TODOS', {
            presetKey: 'TODOS_CONTRA_TODOS_PURO',
            vueltas: 1,
            includePlayoffs: false
        })
    }
]);

export const formatLabelFor = rawConfig => {
    const { definition, config } = FormatRegistry.resolve(rawConfig);
    if (config.presetKey === 'TOP_16' || (config.formatId === 'ZONAS_ELIMINATORIAS' && config.qualificationMode === 'general_top_n' && Number(config.qualifiersTotal) === 16)) {
        const modeTxt = config.groupMode === 'round_robin' ? 'Zonas todos c/todos' : `${config.guaranteedMatches || 3} garantizados`;
        return `TOP 16 (${modeTxt} → Llave 1.º al 16.º)`;
    }
    if (config.formatId === 'ZONAS_SUBZONAS') {
        const schemeLabel = config.subZoneScheme === 'triangulares_3z'
            ? '3 Zonas → Triangulares Z1-Z6'
            : (config.subZoneScheme === 'campeonato_estimulo_4z' ? '4 Zonas → Z1-Z2 Campeonato + Z3 Estímulo' : 'Campeonato + Estímulo');
        return `Zonas + ${schemeLabel}`;
    }
    if (config.formatId === 'ZONAS_ZONA_FINAL') {
        const policy = config.carryOverMode === 'carry_over' ? 'con arrastre entre clasificados' : 'arranque en 0 puntos';
        return `${definition.name} (${policy})`;
    }
    if (config.formatId === 'ZONAS_ELIMINATORIAS') {
        const qual = config.qualificationMode === 'per_zone'
            ? `Top ${config.qualifiersPerZone || 2}/zona${config.bestOthers ? ` + ${config.bestOthers} mej.` : ''}`
            : `Top ${config.qualifiersTotal || 8}`;
        return `${definition.name} · ${qual}`;
    }
    if (config.formatId === 'TODOS_CONTRA_TODOS' || config.formatId === 'LIGA_RONDAS') {
        const suffix = config.includePlayoffs ? ` + Top ${config.qualifiersTotal || 4}` : '';
        return `${definition.name}${config.vueltas > 1 ? ` (${config.vueltas} vueltas)` : ''}${suffix}`;
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
            ${total > 1 ? `<button type="button" class="btn-secondary btn-sm remove-custom-stage" data-stage-index="${index}">Quitar</button>` : ''}
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
    const formats = FormatRegistry.list().filter(item => ['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(item.code));
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
            ? `<div class="planning-warning" role="alert"><strong>Revisá esta configuración:</strong> ${escapeHtml(validation.errors.join(' '))}</div>`
            : (validation.warnings.length
                ? `<div class="planning-notice">${escapeHtml(validation.warnings.join(' '))}</div>`
                : `<p class="helper-text">${icon('checkCircle', { size: 15 })} Modalidad lista y validada: <strong>${escapeHtml(formatLabelFor(draft))}</strong>.</p>`);

        container.innerHTML = `
            <section class="form-card panel-control format-configurator" aria-label="Formato de competición de la categoría">
                <div class="form-title">
                    <div>
                        <h3>Modalidad de competencia</h3>
                        <p>Elegí una plantilla rápida en 1 clic o ajustá los detalles de clasificación de esta categoría.</p>
                    </div>
                    <span class="calendar-chip">${escapeHtml(formatLabelFor(draft))}</span>
                </div>

                <div class="preset-grid" role="group" aria-label="Plantillas rápidas de competencia">
                    ${TOURNAMENT_MODALITY_PRESETS.map(preset => {
                        const isSelected = draft.presetKey === preset.key;
                        return `<button type="button" class="preset-card ${isSelected ? 'active' : ''}" data-preset-key="${escapeHtml(preset.key)}">
                            <strong>${escapeHtml(preset.title)}</strong>
                            <small>${escapeHtml(preset.subtitle)}</small>
                        </button>`;
                    }).join('')}
                </div>

                <form id="category-format-form" class="format-config-form">
                    <div class="form-grid">
                        <label class="form-field">Estructura base
                            <select id="cfg-format-id">
                                ${formats.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.formatId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
                            </select>
                        </label>
                    </div>

                    ${draft.formatId === 'ZONAS_ELIMINATORIAS' ? `
                        <div class="form-grid">
                            <label class="form-field">Partidos en fase de zonas
                                <select id="cfg-group-mode">
                                    ${renderOptionList([
                                        ['guaranteed', 'Partidos garantizados por equipo'],
                                        ['round_robin', 'Todos contra todos dentro de cada zona']
                                    ], draft.groupMode || 'guaranteed')}
                                </select>
                            </label>
                            ${(draft.groupMode || 'guaranteed') === 'guaranteed' ? `
                                <label class="form-field">Mínimo garantizado en zonas
                                    <input id="cfg-guaranteed" type="number" min="1" max="20" value="${Number(draft.guaranteedMatches || 3)}">
                                </label>
                            ` : ''}
                            <label class="form-field">Cómo clasifican a eliminatorias
                                <select id="cfg-qual-mode">
                                    ${renderOptionList([
                                        ['general_top_n', 'Por tabla general (ej. TOP 16, Top 8, Top 4)'],
                                        ['per_zone', 'Por puesto en cada zona (ej. 1.º y 2.º de cada zona)']
                                    ], draft.qualificationMode || 'general_top_n')}
                                </select>
                            </label>
                            ${(draft.qualificationMode || 'general_top_n') === 'general_top_n' ? `
                                <label class="form-field">Equipos que avanzan
                                    <select id="cfg-qual-total">
                                        ${renderOptionList([
                                            ['16', 'TOP 16 (Octavos: 1.º vs 16.º … 8.º vs 9.º)'],
                                            ['8', 'Top 8 (Cuartos de final)'],
                                            ['4', 'Top 4 (Semifinales: 1.º vs 4.º y 2.º vs 3.º)'],
                                            ['2', 'Top 2 (Final directa)'],
                                            ['6', 'Top 6 (con descanso para 1.º y 2.º)'],
                                            ['12', 'Top 12 (con descanso para mejores 4)']
                                        ], String(draft.qualifiersTotal || 16))}
                                    </select>
                                </label>
                            ` : `
                                <label class="form-field">Clasificados directos por zona
                                    <input id="cfg-qual-per-zone" type="number" min="1" max="16" value="${Number(draft.qualifiersPerZone || 2)}">
                                </label>
                                <label class="form-field">Mejores terceros / adicionales
                                    <input id="cfg-best-others" type="number" min="0" max="8" value="${Number(draft.bestOthers || 0)}">
                                </label>
                            `}
                            <label class="license-toggle">
                                <input id="cfg-third-place" type="checkbox" ${draft.thirdPlace ? 'checked' : ''}> Disputar partido por 3.º y 4.º Puesto
                            </label>
                        </div>
                    ` : ''}

                    ${draft.formatId === 'ZONAS_SUBZONAS' ? `
                        <div class="form-grid">
                            <label class="form-field">Fase inicial de grupos
                                <select id="cfg-group-mode">
                                    ${renderOptionList([
                                        ['round_robin', 'Todos contra todos dentro de cada zona'],
                                        ['guaranteed', 'Partidos garantizados por equipo']
                                    ], draft.groupMode || 'round_robin')}
                                </select>
                            </label>
                            ${draft.groupMode === 'guaranteed' ? `
                                <label class="form-field">Garantizados en fase inicial
                                    <input id="cfg-guaranteed" type="number" min="1" max="20" value="${Number(draft.guaranteedMatches || 3)}">
                                </label>
                            ` : ''}
                            <label class="form-field">Esquema de Sub-zonas (2.ª fase)
                                <select id="cfg-subzone-scheme">
                                    ${renderOptionList([
                                        ['auto', 'Automático según cantidad de zonas (recomendado)'],
                                        ['campeonato_estimulo_4z', '4 Zonas → Z1 y Z2 Campeonato (1.º-8.º) + Z3 Estímulo (9.º+)'],
                                        ['triangulares_3z', '3 Zonas → Z1 y Z2 Campeonato (1.º-6.º) + Triangulares por puesto (7.º+)'],
                                        ['general_split', 'División general Campeonato + Estímulo']
                                    ], draft.subZoneScheme || 'auto')}
                                </select>
                            </label>
                            <label class="license-toggle">
                                <input id="cfg-third-place" type="checkbox" ${draft.thirdPlace !== false ? 'checked' : ''}> Incluir partido por 3.º y 4.º Puesto
                            </label>
                            <label class="license-toggle">
                                <input id="cfg-placement-crosses" type="checkbox" ${draft.placementCrosses !== false ? 'checked' : ''}> Incluir cruces por 5.º/6.º y 7.º/8.º Puesto (3.º Z1 vs 3.º Z2, etc.)
                            </label>
                        </div>
                    ` : ''}

                    ${draft.formatId === 'TODOS_CONTRA_TODOS' || draft.formatId === 'LIGA_RONDAS' ? `
                        <div class="form-grid">
                            <label class="form-field">Cantidad de vueltas
                                <select id="cfg-vueltas">
                                    ${renderOptionList([['1', '1 vuelta (todos contra todos simple)'], ['2', '2 vueltas (ida y vuelta)']], String(draft.vueltas || 1))}
                                </select>
                            </label>
                            <label class="license-toggle">
                                <input id="cfg-include-playoffs" type="checkbox" ${draft.includePlayoffs ? 'checked' : ''}> Jugar Semifinales / Eliminatorias al terminar la tabla
                            </label>
                            ${draft.includePlayoffs ? `
                                <label class="form-field">Clasificados a etapa final
                                    <select id="cfg-qual-total">
                                        ${renderOptionList([
                                            ['4', 'Top 4 → Semifinales (1.º vs 4.º y 2.º vs 3.º) + Final'],
                                            ['2', 'Top 2 → Final directa (1.º vs 2.º)'],
                                            ['8', 'Top 8 → Cuartos, Semifinales y Final']
                                        ], String(draft.qualifiersTotal || 4))}
                                    </select>
                                </label>
                                <label class="license-toggle">
                                    <input id="cfg-third-place" type="checkbox" ${draft.thirdPlace ? 'checked' : ''}> Incluir partido por 3.º y 4.º Puesto
                                </label>
                            ` : ''}
                        </div>
                    ` : ''}

                    ${draft.formatId === 'ZONAS_ZONA_FINAL' ? `
                        <div class="form-grid">
                            <label class="form-field">Puntaje en Zona Final
                                <select id="cfg-carry-over">
                                    ${renderOptionList([
                                        ['reset', 'Comienzan en cero puntos (todos contra todos nuevo)'],
                                        ['carry_over', 'Conservan resultados previos entre clasificados']
                                    ], draft.carryOverMode || 'reset')}
                                </select>
                            </label>
                            <label class="form-field">Clasificación hacia Zona Final
                                <select id="cfg-qual-mode">
                                    ${renderOptionList([['per_zone', 'Mejores de cada zona'], ['general_top_n', 'Mejores de tabla general']], draft.qualificationMode || 'per_zone')}
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
                    ` : ''}

                    ${draft.formatId === 'ELIMINACION_DIRECTA' ? `
                        <div class="form-grid">
                            <label class="license-toggle">
                                <input id="cfg-third-place" type="checkbox" ${draft.thirdPlace ? 'checked' : ''}> Incluir partido por 3.º y 4.º Puesto
                            </label>
                        </div>
                    ` : ''}

                    ${draft.formatId === 'PERSONALIZADO' ? `
                        <div class="custom-stages-builder">
                            ${(draft.stages || []).map((stage, index, list) => renderCustomStageRow(stage, index, list.length)).join('')}
                            <div class="form-actions">
                                <button type="button" id="add-custom-stage" class="btn-secondary">+ Agregar fase</button>
                            </div>
                        </div>
                    ` : ''}

                    <details class="schedule-editor">
                        <summary>Opciones avanzadas de reglamento y desempate</summary>
                        <div class="form-grid" style="padding: 8px 14px 14px;">
                            <label class="form-field">Criterio de tabla y desempate
                                <select id="cfg-standings-mode">
                                    ${renderOptionList(STANDINGS_MODE_OPTIONS, draft.standingsMode || 'wins')}
                                </select>
                            </label>
                            ${draft.formatId === 'ZONAS_ELIMINATORIAS' ? `
                                <label class="form-field">Ordenamiento de llaves
                                    <select id="cfg-seeding-mode">
                                        ${renderOptionList(SEEDING_OPTIONS, draft.seedingMode || 'overall_rank')}
                                    </select>
                                </label>
                            ` : ''}
                        </div>
                    </details>

                    ${statusMarkup}
                    <div class="form-actions">
                        <button class="btn-primary" type="submit" ${validation.valid ? '' : 'disabled'}>Guardar modalidad de la categoría</button>
                    </div>
                </form>
            </section>`;

        const form = container.querySelector('#category-format-form');
        const syncAndRender = updater => {
            updater();
            render();
        };

        container.querySelectorAll('[data-preset-key]').forEach(btn => btn.addEventListener('click', () => syncAndRender(() => {
            const preset = TOURNAMENT_MODALITY_PRESETS.find(item => item.key === btn.dataset.presetKey);
            if (!preset) return;
            const prevStandings = draft.standingsMode || 'wins';
            draft = { ...preset.build(draft.guaranteedMatches || 3), standingsMode: prevStandings };
        })));

        form.querySelector('#cfg-format-id')?.addEventListener('change', event => syncAndRender(() => {
            const nextId = event.currentTarget.value;
            const prevStandings = draft.standingsMode;
            draft = FormatRegistry.createConfig(nextId, { standingsMode: nextId === 'LIGA_RONDAS' ? 'points_table' : (prevStandings || 'wins') });
        }));
        form.querySelector('#cfg-standings-mode')?.addEventListener('change', event => syncAndRender(() => { draft.standingsMode = event.currentTarget.value; }));
        form.querySelector('#cfg-group-mode')?.addEventListener('change', event => syncAndRender(() => { delete draft.presetKey; draft.groupMode = event.currentTarget.value; }));
        form.querySelector('#cfg-guaranteed')?.addEventListener('change', event => syncAndRender(() => { draft.guaranteedMatches = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-qual-mode')?.addEventListener('change', event => syncAndRender(() => { delete draft.presetKey; draft.qualificationMode = event.currentTarget.value; }));
        form.querySelector('#cfg-qual-total')?.addEventListener('change', event => syncAndRender(() => {
            const val = Number(event.currentTarget.value);
            draft.qualifiersTotal = val;
            if (draft.formatId === 'ZONAS_ELIMINATORIAS' && val === 16) draft.presetKey = 'TOP_16';
            else delete draft.presetKey;
        }));
        form.querySelector('#cfg-qual-per-zone')?.addEventListener('change', event => syncAndRender(() => { draft.qualifiersPerZone = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-best-others')?.addEventListener('change', event => syncAndRender(() => { draft.bestOthers = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-seeding-mode')?.addEventListener('change', event => syncAndRender(() => { draft.seedingMode = event.currentTarget.value; }));
        form.querySelector('#cfg-subzone-scheme')?.addEventListener('change', event => syncAndRender(() => { draft.subZoneScheme = event.currentTarget.value; }));
        form.querySelector('#cfg-third-place')?.addEventListener('change', event => syncAndRender(() => { draft.thirdPlace = event.currentTarget.checked; }));
        form.querySelector('#cfg-placement-crosses')?.addEventListener('change', event => syncAndRender(() => { draft.placementCrosses = event.currentTarget.checked; }));
        form.querySelector('#cfg-vueltas')?.addEventListener('change', event => syncAndRender(() => { draft.vueltas = Number(event.currentTarget.value); }));
        form.querySelector('#cfg-include-playoffs')?.addEventListener('change', event => syncAndRender(() => {
            delete draft.presetKey;
            draft.includePlayoffs = event.currentTarget.checked;
            if (draft.includePlayoffs && !draft.qualifiersTotal) draft.qualifiersTotal = 4;
        }));
        form.querySelector('#cfg-carry-over')?.addEventListener('change', event => syncAndRender(() => { draft.carryOverMode = event.currentTarget.value; }));
        form.querySelector('#cfg-final-vueltas')?.addEventListener('change', event => syncAndRender(() => { draft.finalVueltas = Number(event.currentTarget.value); }));

        form.querySelector('#add-custom-stage')?.addEventListener('click', () => syncAndRender(() => {
            draft.stages = [...(draft.stages || []), { type: 'ELIMINATORIAS', thirdPlace: false }];
        }));
        form.querySelectorAll('.remove-custom-stage').forEach(btn => btn.addEventListener('click', () => syncAndRender(() => {
            draft.stages.splice(Number(btn.dataset.stageIndex), 1);
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
                showToast('Modalidad y reglas guardadas para esta categoría.', { type: 'success' });
                onSaved?.();
            } catch (error) {
                showToast(error.message, { type: 'error' });
            }
        });
    };

    render();
};
