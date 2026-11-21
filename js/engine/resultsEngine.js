// Fuente única de verdad para validación y cálculo de resultados por sets reales de Newcom.
// Módulo puro sin dependencias de DOM ni de persistencia: funciona igual en Electron, web y Node.

export const OFFICIAL_MATCH_STATUSES = Object.freeze([
    'pendiente',
    'programado',
    'confirmado',
    'en_juego',
    'finalizado'
]);

export const isOfficialMatch = match => Boolean(
    match && (match.confirmado || OFFICIAL_MATCH_STATUSES.includes(match.estado))
);

export const isMatchFinished = match => Boolean(
    match
    && match.estado === 'finalizado'
    && Array.isArray(match.sets)
    && match.sets.length >= 2
    && match.ganadorId
);

export const normalizeSets = rawSets => {
    if (!Array.isArray(rawSets) || rawSets.length < 2 || rawSets.length > 3) {
        throw new Error('Ingrese los puntos de 2 o 3 sets.');
    }
    return rawSets.map((set, index) => {
        const puntosLocal = Number(set?.puntosLocal);
        const puntosVisitante = Number(set?.puntosVisitante);
        if (
            !Number.isInteger(puntosLocal)
            || !Number.isInteger(puntosVisitante)
            || puntosLocal < 0
            || puntosVisitante < 0
        ) {
            throw new Error(`El set ${index + 1} debe tener puntos enteros iguales o mayores a cero.`);
        }
        if (puntosLocal === puntosVisitante) {
            throw new Error(`El set ${index + 1} no puede terminar empatado.`);
        }
        return { puntosLocal, puntosVisitante };
    });
};

export const evaluateMatchSets = (rawSets, equipoLocalId, equipoVisitanteId) => {
    const sets = normalizeSets(rawSets);
    const setsLocal = sets.filter(set => set.puntosLocal > set.puntosVisitante).length;
    const setsVisitante = sets.length - setsLocal;
    const firstTwoAreSplit = sets.length === 3
        && (sets[0].puntosLocal > sets[0].puntosVisitante) !== (sets[1].puntosLocal > sets[1].puntosVisitante);
    const isTwoSetFinish = sets.length === 2 && (setsLocal === 2 || setsVisitante === 2);
    const isThreeSetFinish = sets.length === 3 && firstTwoAreSplit && (setsLocal === 2 || setsVisitante === 2);

    if (!isTwoSetFinish && !isThreeSetFinish) {
        throw new Error('El resultado debe finalizar 2-0 o 2-1. Si los primeros dos sets quedan 1-1, cargue el tercer set.');
    }

    const puntosFavor = sets.reduce((total, set) => total + set.puntosLocal, 0);
    const puntosContra = sets.reduce((total, set) => total + set.puntosVisitante, 0);
    const localWon = setsLocal === 2;

    return {
        estado: 'finalizado',
        status: 'FINALIZADO',
        sets,
        setsLocal,
        setsVisitante,
        puntosFavor,
        puntosContra,
        diferenciaPuntos: puntosFavor - puntosContra,
        ganadorId: localWon ? equipoLocalId : equipoVisitanteId,
        perdedorId: localWon ? equipoVisitanteId : equipoLocalId,
        score: `${setsLocal}-${setsVisitante}`
    };
};

export const applyMatchSets = (match, rawSets) => {
    const evaluated = evaluateMatchSets(rawSets, match.equipoLocalId, match.equipoVisitanteId);
    Object.assign(match, evaluated);
    return match;
};

export const ResultsEngine = {
    OFFICIAL_MATCH_STATUSES,
    isOfficialMatch,
    isMatchFinished,
    normalizeSets,
    evaluateMatchSets,
    applyMatchSets
};
