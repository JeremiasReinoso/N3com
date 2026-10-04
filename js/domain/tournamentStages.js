// Contrato único de etapas del torneo. Los textos visibles nunca se usan como
// identificadores persistidos ni como parte de la lógica de planificación.
export const TOURNAMENT_STAGES = Object.freeze([
    'fase_zonas',
    'partidos_garantizados',
    'all_vs_all_crosses',
    'octavos',
    'cuartos',
    'semifinales',
    'final'
]);

export const TOURNAMENT_STAGE_LABELS = Object.freeze({
    fase_zonas: 'Fase de zonas',
    partidos_garantizados: 'Partidos garantizados',
    all_vs_all_crosses: 'Cruces — Todos contra todos',
    octavos: 'Octavos de final (Top 16 → Top 8)',
    cuartos: 'Cuartos de final (Top 8 → Top 4)',
    semifinales: 'Semifinales',
    final: 'Final'
});

// Aliases observados en datos y código existentes. No se usan para generar
// datos nuevos: sólo permiten leer y migrar torneos anteriores sin romperlos.
const STAGE_ALIASES = Object.freeze({
    fase_zonas: 'fase_zonas',
    ZONAS: 'fase_zonas',
    partidos_garantizados: 'partidos_garantizados',
    GARANTIZADOS: 'partidos_garantizados',
    all_vs_all_crosses: 'all_vs_all_crosses',
    ALL_VS_ALL: 'all_vs_all_crosses',
    cruces_todos_contra_todos: 'all_vs_all_crosses',
    octavos: 'octavos',
    cruces: 'octavos',
    top_16: 'octavos',
    TOP_16: 'octavos',
    cuartos: 'cuartos',
    cuartos_final: 'cuartos',
    top_8: 'cuartos',
    TOP_8: 'cuartos',
    semifinales: 'semifinales',
    semifinal: 'semifinales',
    SEMIFINAL: 'semifinales',
    final: 'final',
    FINAL: 'final'
});

export const normalizeTournamentStage = stage => {
    const value = String(stage ?? '').trim();
    return STAGE_ALIASES[value] || value;
};

// Las fases de partidos conservan sus valores históricos para no alterar
// cruces/resultados. Este puente sólo traduce el contrato de etapas oficial.
export const stageFromMatchPhase = phase => ({
    ZONAS: 'fase_zonas',
    TOP_16: 'octavos',
    TOP_8: 'cuartos',
    SEMIFINAL: 'semifinales',
    FINAL: 'final',
    THIRD_PLACE: 'final'
}[phase] || normalizeTournamentStage(phase));

export const matchPhaseFromStage = stage => ({
    fase_zonas: 'ZONAS',
    partidos_garantizados: 'ZONAS',
    all_vs_all_crosses: 'ALL_VS_ALL',
    octavos: 'TOP_16',
    cuartos: 'TOP_8',
    semifinales: 'SEMIFINAL',
    final: 'FINAL'
}[normalizeTournamentStage(stage)]);
