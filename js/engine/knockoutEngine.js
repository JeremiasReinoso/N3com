// Motor de Eliminación Directa (cuadro completo y progresivo).
// Soporta cualquier cantidad N >= 2 de equipos (potencias de 2 y no-potencias de 2),
// asignando descansos (byes) a los mejores seeds sin crear jamás partidos ficticios.
// Incluye soporte para 3.º puesto opcional, modo cuadro fijo y modo re-seeding legado.

import { DataManager } from '../data/dataManager.js';
import { isMatchFinished } from './resultsEngine.js';

export const PHASE_FOR_BRACKET_SIZE = Object.freeze({
    32: 'TOP_32',
    16: 'TOP_16',
    8: 'TOP_8',
    4: 'SEMIFINAL',
    2: 'FINAL'
});

export const LABEL_FOR_PHASE = Object.freeze({
    TOP_32: 'Top 32',
    TOP_16: 'Top 16',
    TOP_8: 'Cuartos de final',
    SEMIFINAL: 'Semifinal',
    THIRD_PLACE: 'Tercer puesto',
    FINAL: 'Final'
});

export const nextPowerOfTwo = count => {
    let size = 2;
    while (size < count) size *= 2;
    return size;
};

// Genera el ordenamiento oficial de seeds para un cuadro de tamaño potencia de 2:
// 2 -> [1,2], 4 -> [1,4,2,3], 8 -> [1,8,4,5,2,7,3,6], 16 -> [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
export const buildStandardSeedOrder = bracketSize => {
    if (bracketSize < 2 || (bracketSize & (bracketSize - 1)) !== 0) {
        throw new Error('El tamaño del cuadro debe ser una potencia de 2 mayor o igual a 2.');
    }
    let order = [1, 2];
    while (order.length < bracketSize) {
        const sum = order.length * 2 + 1;
        order = order.flatMap(seed => [seed, sum - seed]);
    }
    return order;
};

export const phaseForRoundSize = size => PHASE_FOR_BRACKET_SIZE[size] || `TOP_${size}`;

const assertSeededTeamsValid = seededTeams => {
    if (!Array.isArray(seededTeams) || seededTeams.length < 2) {
        throw new Error('Se necesitan al menos 2 equipos para generar un cuadro eliminatorio.');
    }
    const ids = seededTeams.map(team => team?.id).filter(Boolean);
    if (ids.length !== seededTeams.length || new Set(ids).size !== ids.length) {
        throw new Error('Los equipos clasificados contienen duplicados o identificadores inválidos.');
    }
};

// Construye un plan puro de cuadro eliminatorio completo con byes exactos.
// Los equipos con bye avanzan directamente a la ronda siguiente SIN crear partidos ficticios.
export const buildBracketPlan = (seededTeams, options = {}) => {
    assertSeededTeamsValid(seededTeams);
    const { thirdPlace = false } = options;
    const count = seededTeams.length;
    const bracketSize = nextPowerOfTwo(count);
    const seedOrder = buildStandardSeedOrder(bracketSize);
    const bySeed = new Map(seededTeams.map((team, index) => [index + 1, { ...team, seed: team.seed || index + 1 }]));

    const rounds = [];
    const byes = [];

    // Nodos actuales del árbol: cada entrada es un equipo real (bye/seed) o la referencia a un partido real previo.
    let currentNodes = seedOrder.map(seed => {
        const team = bySeed.get(seed) || null;
        return team ? { kind: 'team', team, seed } : { kind: 'empty' };
    });

    let roundSize = bracketSize;
    let roundIndex = 0;

    while (roundSize >= 2) {
        const phase = phaseForRoundSize(roundSize);
        const label = LABEL_FOR_PHASE[phase] || phase;
        const roundMatches = [];
        const nextNodes = [];
        let order = 0;

        for (let pairIndex = 0; pairIndex < currentNodes.length; pairIndex += 2) {
            const left = currentNodes[pairIndex];
            const right = currentNodes[pairIndex + 1];

            // Si uno de los dos lados está vacío, el rival obtiene BYE y avanza sin partido ficticio.
            if (left.kind === 'empty' && right.kind === 'empty') {
                nextNodes.push({ kind: 'empty' });
                continue;
            }
            if (left.kind === 'team' && right.kind === 'empty') {
                byes.push({ team: left.team, seed: left.seed, bypassedPhase: phase, advancesToPhase: phaseForRoundSize(roundSize / 2) });
                nextNodes.push(left);
                continue;
            }
            if (left.kind === 'empty' && right.kind === 'team') {
                byes.push({ team: right.team, seed: right.seed, bypassedPhase: phase, advancesToPhase: phaseForRoundSize(roundSize / 2) });
                nextNodes.push(right);
                continue;
            }

            order += 1;
            const key = `${phase}_${order}`;
            const matchNode = {
                key,
                phase,
                label: roundSize === 2 ? label : `${label} ${order}`,
                roundIndex,
                order,
                bracketSize: roundSize,
                equipoLocalId: left.kind === 'team' ? left.team.id : null,
                equipoVisitanteId: right.kind === 'team' ? right.team.id : null,
                seedLocal: left.kind === 'team' ? left.seed : null,
                seedVisitante: right.kind === 'team' ? right.seed : null,
                sourceKeys: [
                    left.kind === 'match' ? left.key : null,
                    right.kind === 'match' ? right.key : null
                ],
                sourceLoserKeys: []
            };
            roundMatches.push(matchNode);
            nextNodes.push({ kind: 'match', key });
        }

        if (roundMatches.length) {
            rounds.push({ phase, label, bracketSize: roundSize, matches: roundMatches });
        }
        currentNodes = nextNodes;
        roundSize /= 2;
        roundIndex += 1;
    }

    // Partido por el tercer puesto: sólo si está habilitado y existen 2 semifinales reales.
    const semiRound = rounds.find(round => round.phase === 'SEMIFINAL');
    let thirdPlaceMatch = null;
    if (thirdPlace && semiRound && semiRound.matches.length === 2) {
        thirdPlaceMatch = {
            key: 'THIRD_PLACE_1',
            phase: 'THIRD_PLACE',
            label: LABEL_FOR_PHASE.THIRD_PLACE,
            roundIndex: rounds.length - 1,
            order: 1,
            bracketSize: 2,
            equipoLocalId: null,
            equipoVisitanteId: null,
            seedLocal: null,
            seedVisitante: null,
            sourceKeys: [],
            sourceLoserKeys: [semiRound.matches[0].key, semiRound.matches[1].key]
        };
    }

    const matches = [
        ...rounds.flatMap(round => round.matches),
        ...(thirdPlaceMatch ? [thirdPlaceMatch] : [])
    ];

    return {
        teamCount: count,
        bracketSize,
        byeCount: byes.length,
        byes,
        rounds,
        thirdPlaceMatch,
        matches
    };
};

const phaseMatches = (torneoId, categoriaId, phase) => DataManager
    .getMatchesByTournamentAndCategory(torneoId, categoriaId)
    .filter(match => match.phase === phase);

const ALL_KNOCKOUT_PHASES = ['TOP_32', 'TOP_16', 'TOP_8', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];

export const KnockoutEngine = {
    PHASE_FOR_BRACKET_SIZE,
    LABEL_FOR_PHASE,
    ALL_KNOCKOUT_PHASES,
    nextPowerOfTwo,
    buildStandardSeedOrder,
    phaseForRoundSize,
    buildBracketPlan,

    // Persiste el cuadro eliminatorio completo (sin partidos ficticios de bye) y enlaza
    // automáticamente sourceMatchIds (ganadores) y sourceLoserMatchIds (3.º puesto).
    generateBracket(torneoId, categoriaId, seededTeams, options = {}) {
        const existing = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => ALL_KNOCKOUT_PHASES.includes(match.phase));
        if (existing.length && !options.allowExisting) {
            return { created: [], matches: existing, plan: null, alreadyExists: true };
        }

        const plan = buildBracketPlan(seededTeams, { thirdPlace: Boolean(options.thirdPlace) });
        const keyToMatchId = new Map();
        const createdAll = [];

        try {
            // Persiste ronda por ronda para poder resolver los IDs reales de sourceMatchIds.
            const groupedPhases = [
                ...plan.rounds.map(round => round.matches),
                ...(plan.thirdPlaceMatch ? [[plan.thirdPlaceMatch]] : [])
            ];

            for (const batch of groupedPhases) {
                const payload = batch.map(node => ({
                    torneoId,
                    categoriaId,
                    zonaId: null,
                    phase: node.phase,
                    tipo: node.phase.toLowerCase(),
                    nombreEtapa: node.label,
                    bracketKey: node.key,
                    equipoLocalId: node.equipoLocalId,
                    equipoVisitanteId: node.equipoVisitanteId,
                    seedLocal: node.seedLocal,
                    seedVisitante: node.seedVisitante,
                    sourceMatchIds: node.sourceKeys.map(key => (key ? keyToMatchId.get(key) || null : null)),
                    sourceLoserMatchIds: node.sourceLoserKeys.map(key => (key ? keyToMatchId.get(key) || null : null)),
                    fecha: null,
                    hora: null,
                    cancha: null,
                    orden: node.order,
                    estado: 'pendiente',
                    confirmado: true
                }));
                const created = DataManager.addMatches(payload);
                created.forEach((match, index) => {
                    keyToMatchId.set(batch[index].key, match.id);
                    createdAll.push(match);
                });
            }
        } catch (error) {
            createdAll.forEach(match => {
                try { DataManager.removeMatch(match.id); } catch { /* ya removido */ }
            });
            throw error;
        }

        return {
            created: createdAll,
            matches: createdAll,
            plan,
            alreadyExists: false
        };
    },

    // Genera únicamente la ronda siguiente en modo progresivo (para flujos paso a paso
    // o re-seeding tradicional como Top 16 -> Top 8 -> Semifinal -> Final).
    advanceProgressiveRound(torneoId, categoriaId, options = {}) {
        const allMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const knockout = allMatches.filter(match => ALL_KNOCKOUT_PHASES.includes(match.phase));
        if (!knockout.length) {
            throw new Error('Todavía no se inició el cuadro eliminatorio.');
        }

        const progression = ['TOP_32', 'TOP_16', 'TOP_8', 'SEMIFINAL', 'FINAL'];
        const existingPhases = progression.filter(phase => knockout.some(match => match.phase === phase));
        const latestPhase = existingPhases.at(-1);
        if (latestPhase === 'FINAL') {
            return { created: [], phase: 'FINAL', finished: knockout.some(m => m.phase === 'FINAL' && isMatchFinished(m)) };
        }

        const currentRound = phaseMatches(torneoId, categoriaId, latestPhase);
        if (currentRound.some(match => !isMatchFinished(match))) {
            throw new Error(`Finalice todos los partidos de ${LABEL_FOR_PHASE[latestPhase] || latestPhase} antes de generar la siguiente ronda.`);
        }

        const nextPhase = progression[progression.indexOf(latestPhase) + 1];
        if (phaseMatches(torneoId, categoriaId, nextPhase).length) {
            return { created: [], phase: nextPhase, alreadyExists: true };
        }

        const winners = currentRound.map(match => ({
            id: match.ganadorId,
            seed: match.ganadorId === match.equipoLocalId ? match.seedLocal : match.seedVisitante,
            source: match
        }));
        if (new Set(winners.map(item => item.id)).size !== winners.length) {
            throw new Error(`${latestPhase} contiene ganadores repetidos.`);
        }

        let pairs;
        if (options.reseed) {
            const ordered = [...winners].sort((left, right) => (left.seed || 999) - (right.seed || 999));
            pairs = Array.from({ length: ordered.length / 2 }, (_, index) => [ordered[index], ordered[ordered.length - 1 - index]]);
        } else {
            const ordered = [...winners].sort((left, right) => Number(left.source.orden || 0) - Number(right.source.orden || 0));
            pairs = Array.from({ length: ordered.length / 2 }, (_, index) => [ordered[index * 2], ordered[index * 2 + 1]]);
        }

        const toCreate = pairs.map(([left, right], index) => ({
            torneoId,
            categoriaId,
            zonaId: null,
            phase: nextPhase,
            tipo: nextPhase.toLowerCase(),
            nombreEtapa: nextPhase === 'FINAL' ? 'Final' : `${LABEL_FOR_PHASE[nextPhase] || nextPhase} ${index + 1}`,
            equipoLocalId: left.id,
            equipoVisitanteId: right.id,
            seedLocal: left.seed || null,
            seedVisitante: right.seed || null,
            sourceMatchIds: [left.source.id, right.source.id],
            fecha: null,
            hora: null,
            cancha: null,
            orden: index + 1,
            estado: 'pendiente',
            confirmado: true
        }));

        if (nextPhase === 'FINAL' && options.thirdPlace && currentRound.length === 2 && !phaseMatches(torneoId, categoriaId, 'THIRD_PLACE').length) {
            const losers = currentRound.map(match => {
                const loserId = match.ganadorId === match.equipoLocalId ? match.equipoVisitanteId : match.equipoLocalId;
                const seed = loserId === match.equipoLocalId ? match.seedLocal : match.seedVisitante;
                return { id: loserId, seed, source: match };
            });
            toCreate.push({
                torneoId,
                categoriaId,
                zonaId: null,
                phase: 'THIRD_PLACE',
                tipo: 'tercer_puesto',
                nombreEtapa: 'Tercer puesto',
                equipoLocalId: losers[0].id,
                equipoVisitanteId: losers[1].id,
                seedLocal: losers[0].seed || null,
                seedVisitante: losers[1].seed || null,
                sourceMatchIds: [],
                sourceLoserMatchIds: [losers[0].source.id, losers[1].source.id],
                fecha: null,
                hora: null,
                cancha: null,
                orden: 1,
                estado: 'pendiente',
                confirmado: true
            });
        }

        const created = DataManager.addMatches(toCreate);
        return { created, phase: nextPhase, alreadyExists: false };
    }
};
