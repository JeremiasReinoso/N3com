// Fuente única de verdad para las etapas que pueden aparecer en una
// planificación. Los valores son los identificadores canónicos persistidos.
export const TOURNAMENT_STAGES = Object.freeze({
    ZONES: 'ZONAS',
    GUARANTEED: 'GARANTIZADOS',
    TOP_16: 'TOP_16',
    TOP_8: 'TOP_8',
    TOP_4: 'TOP_4',
    SEMIFINALS: 'SEMIFINAL',
    FINAL: 'FINAL'
});

// Alias de API conservados para consumidores antiguos de la interfaz.
export const PLANNING_STAGES = Object.freeze({
    ...TOURNAMENT_STAGES,
    ROUND_OF_16: TOURNAMENT_STAGES.TOP_16,
    QUARTERFINALS: TOURNAMENT_STAGES.TOP_8
});

export const PLANNING_STAGE_DEFINITIONS = Object.freeze([
    { id: TOURNAMENT_STAGES.ZONES, label: 'Fase de zonas' },
    { id: TOURNAMENT_STAGES.GUARANTEED, label: 'Partidos garantizados' },
    { id: TOURNAMENT_STAGES.TOP_16, label: 'Top 16' },
    { id: TOURNAMENT_STAGES.TOP_8, label: 'Top 8 / 4tos de final' },
    { id: TOURNAMENT_STAGES.TOP_4, label: 'Top 4' },
    { id: TOURNAMENT_STAGES.SEMIFINALS, label: 'Semifinales' },
    { id: TOURNAMENT_STAGES.FINAL, label: 'Finales' }
]);

const canonicalStages = new Set(PLANNING_STAGE_DEFINITIONS.map(stage => stage.id));
const aliases = new Map([
    ['ZONA', TOURNAMENT_STAGES.ZONES],
    ['ZONAS', TOURNAMENT_STAGES.ZONES],
    ['FASE_ZONAS', TOURNAMENT_STAGES.ZONES],
    ['PARTIDOS_GARANTIZADOS', TOURNAMENT_STAGES.GUARANTEED],
    ['GARANTIZADOS', TOURNAMENT_STAGES.GUARANTEED],
    ['TOP16', TOURNAMENT_STAGES.TOP_16],
    ['TOP 16', TOURNAMENT_STAGES.TOP_16],
    ['OCTAVOS', TOURNAMENT_STAGES.TOP_16],
    ['OCTAVOS_DE_FINAL', TOURNAMENT_STAGES.TOP_16],
    ['TOP8', TOURNAMENT_STAGES.TOP_8],
    ['TOP 8', TOURNAMENT_STAGES.TOP_8],
    ['CUARTOS', TOURNAMENT_STAGES.TOP_8],
    ['CUARTOS_DE_FINAL', TOURNAMENT_STAGES.TOP_8],
    ['TOP4', TOURNAMENT_STAGES.TOP_4],
    ['TOP 4', TOURNAMENT_STAGES.TOP_4],
    ['SEMIFINAL', TOURNAMENT_STAGES.SEMIFINALS],
    ['SEMIFINALES', TOURNAMENT_STAGES.SEMIFINALS],
    ['SEMIFINALS', TOURNAMENT_STAGES.SEMIFINALS],
    ['SEMI_FINAL', TOURNAMENT_STAGES.SEMIFINALS],
    ['FINAL', TOURNAMENT_STAGES.FINAL],
    ['FINALES', TOURNAMENT_STAGES.FINAL]
]);

const stageValue = value => {
    if (value && typeof value === 'object') return value.id ?? value.stage ?? value.phase ?? value.value;
    return value;
};

export const normalizeTournamentStage = value => {
    const raw = stageValue(value);
    if (typeof raw !== 'string') return raw;
    const key = raw.trim().toLocaleUpperCase('es').replace(/-/g, '_').replace(/\s+/g, ' ');
    const underscored = key.replace(/ /g, '_');
    return aliases.get(key) ?? aliases.get(underscored) ?? (canonicalStages.has(key) ? key : raw.trim());
};

export const isValidPlanningStage = value => canonicalStages.has(normalizeTournamentStage(value));

