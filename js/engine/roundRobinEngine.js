// Motor determinista de Round-Robin (Método del Círculo / Tablas de Berger).
// Soporta cualquier cantidad par o impar de equipos, descansos explícitos (byes),
// ida o ida y vuelta, y rondas limitadas sin repetir rivales ni crear partidos ficticios.

const BYE_TOKEN = Object.freeze({ id: '__BYE__', isBye: true });

export const normalizedPairKey = (teamAId, teamBId) => {
    if (!teamAId || !teamBId || teamAId === teamBId) {
        throw new Error('Un equipo no puede jugar contra sí mismo.');
    }
    return [String(teamAId), String(teamBId)].sort().join(':');
};

const validateTeamList = teams => {
    if (!Array.isArray(teams) || teams.length < 2) {
        throw new Error('Se necesitan al menos 2 equipos para generar enfrentamientos.');
    }
    const ids = teams.map(team => team?.id).filter(Boolean);
    if (ids.length !== teams.length || new Set(ids).size !== ids.length) {
        throw new Error('La lista de equipos contiene identificadores vacíos o duplicados.');
    }
};

// Genera una vuelta completa de todos contra todos usando el método del círculo.
// Para N par: N-1 rondas de N/2 partidos sin byes.
// Para N impar: N rondas de (N-1)/2 partidos con exactamente 1 bye por ronda (cada equipo descansa 1 vez).
const buildSingleCycle = teams => {
    validateTeamList(teams);
    const participants = teams.length % 2 === 0 ? [...teams] : [...teams, BYE_TOKEN];
    const total = participants.length;
    const totalRounds = total - 1;
    const half = total / 2;
    const fixed = participants[0];
    const rotating = participants.slice(1);
    const rounds = [];

    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
        const arrangement = [fixed, ...rotating];
        const matches = [];
        const byes = [];

        for (let slot = 0; slot < half; slot += 1) {
            const left = arrangement[slot];
            const right = arrangement[total - 1 - slot];
            if (left.isBye) {
                byes.push(right);
                continue;
            }
            if (right.isBye) {
                byes.push(left);
                continue;
            }
            // Alternancia de localía para equilibrar partidos como local y visitante.
            const flip = (slot === 0 && roundIndex % 2 === 1) || (slot > 0 && (roundIndex + slot) % 2 === 1);
            const local = flip ? right : left;
            const visitante = flip ? left : right;
            matches.push({
                local,
                visitante,
                ronda: roundIndex + 1,
                vuelta: 1,
                revancha: false,
                key: normalizedPairKey(local.id, visitante.id)
            });
        }

        rounds.push({ round: roundIndex + 1, vuelta: 1, matches, byes });
        rotating.unshift(rotating.pop());
    }

    return rounds;
};

export const generateRoundRobin = (teams, options = {}) => {
    const {
        doubleRoundRobin = false,
        vueltas = doubleRoundRobin ? 2 : 1,
        maxRounds = null,
        existingPairs = new Set(),
        startRound = 1
    } = options;

    validateTeamList(teams);
    const totalCycles = Math.max(1, Number(vueltas) || 1);
    if (!Number.isInteger(totalCycles) || totalCycles < 1 || totalCycles > 4) {
        throw new Error('La cantidad de vueltas debe ser un entero entre 1 y 4.');
    }

    const baseCycle = buildSingleCycle(teams);
    const allRounds = [];
    let currentRoundNumber = Math.max(1, Number(startRound) || 1);

    for (let cycle = 1; cycle <= totalCycles; cycle += 1) {
        const swapSides = cycle % 2 === 0;
        for (const baseRound of baseCycle) {
            if (maxRounds !== null && allRounds.length >= maxRounds) break;
            const filteredMatches = baseRound.matches
                .map(item => {
                    const local = swapSides ? item.visitante : item.local;
                    const visitante = swapSides ? item.local : item.visitante;
                    return {
                        local,
                        visitante,
                        ronda: currentRoundNumber,
                        vuelta: cycle,
                        revancha: cycle > 1,
                        key: item.key
                    };
                })
                .filter(item => item.revancha || !existingPairs.has(item.key));

            allRounds.push({
                round: currentRoundNumber,
                vuelta: cycle,
                matches: filteredMatches,
                byes: [...baseRound.byes]
            });
            currentRoundNumber += 1;
        }
    }

    const matches = allRounds.flatMap(round => round.matches);
    const counts = new Map(teams.map(team => [team.id, 0]));
    matches.forEach(match => {
        counts.set(match.local.id, counts.get(match.local.id) + 1);
        counts.set(match.visitante.id, counts.get(match.visitante.id) + 1);
    });

    return {
        rounds: allRounds,
        matches,
        totalMatches: matches.length,
        totalRounds: allRounds.length,
        hasByes: teams.length % 2 === 1,
        matchesPerTeam: Object.fromEntries(counts)
    };
};

// Genera enfrentamientos equilibrados para alcanzar una cantidad exacta de partidos
// garantizados por equipo. Usa rondas del método del círculo cuando es posible para
// minimizar rondas totales y equilibrar descansos.
export const generateGuaranteedRoundRobin = (teams, requiredMatches, options = {}) => {
    validateTeamList(teams);
    const required = Number(requiredMatches);
    if (!Number.isInteger(required) || required < 1) {
        throw new Error('La cantidad de partidos garantizados debe ser un entero mayor o igual a 1.');
    }

    const { existingMatches = [], allowReplays = true } = options;
    const teamIds = new Set(teams.map(team => team.id));
    const counts = new Map(teams.map(team => [team.id, 0]));
    const pairCounts = new Map();

    existingMatches.forEach(match => {
        const localIn = teamIds.has(match.equipoLocalId);
        const awayIn = teamIds.has(match.equipoVisitanteId);
        if (localIn) counts.set(match.equipoLocalId, counts.get(match.equipoLocalId) + 1);
        if (awayIn) counts.set(match.equipoVisitanteId, counts.get(match.equipoVisitanteId) + 1);
        if (localIn && awayIn) {
            const key = normalizedPairKey(match.equipoLocalId, match.equipoVisitanteId);
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
    });

    if ([...counts.values()].every(count => count >= required)) {
        return { rounds: [], matches: [], warnings: [] };
    }

    const warnings = [];
    const needsReplay = required > teams.length - 1;
    if (needsReplay && !allowReplays) {
        throw new Error(`Con ${teams.length} equipos no se pueden jugar ${required} partidos únicos por equipo sin revanchas.`);
    }
    if (needsReplay && (teams.length * required) % 2 !== 0) {
        throw new Error(`No es matemáticamente posible repartir exactamente ${required} partidos por equipo con ${teams.length} equipos.`);
    }

    // Caso óptimo limpio: sin partidos previos y todos contra todos completo (o múltiplo exacto).
    const noExisting = existingMatches.length === 0;
    if (noExisting && required === teams.length - 1) {
        const rr = generateRoundRobin(teams, { vueltas: 1 });
        return { ...rr, warnings };
    }
    if (noExisting && teams.length % 2 === 0 && required < teams.length - 1) {
        const rr = generateRoundRobin(teams, { vueltas: 1, maxRounds: required });
        return { ...rr, warnings };
    }
    if (noExisting && needsReplay && required % (teams.length - 1) === 0) {
        const rr = generateRoundRobin(teams, { vueltas: required / (teams.length - 1) });
        return { ...rr, warnings };
    }

    // Caso general (con partidos previos o N impar con k impar < N-1):
    // selecciona desde ciclos Berger para minimizar rondas y respetar balance.
    const maxCycles = Math.max(1, Math.ceil(required / Math.max(1, teams.length - 1)) + 1);
    const fullPlan = generateRoundRobin(teams, { vueltas: maxCycles });
    const selected = [];
    const activePairCounts = new Map(pairCounts);

    if (!needsReplay && (teams.length * required) % 2 !== 0) {
        warnings.push(`Con ${teams.length} equipos y ${required} partidos garantizados (producto impar), un equipo disputará ${required + 1} partidos para completar el mínimo de todos.`);
    }

    // Prioriza partidos donde ambos equipos están debajo del mínimo, luego completa faltantes.
    const tryPick = requireBothBelow => {
        for (const round of fullPlan.rounds) {
            for (const match of round.matches) {
                const countA = counts.get(match.local.id);
                const countB = counts.get(match.visitante.id);
                const alreadyUsed = activePairCounts.get(match.key) || 0;
                if (!needsReplay && alreadyUsed > 0) continue;
                if (needsReplay && match.vuelta <= alreadyUsed) continue;
                const eligible = requireBothBelow
                    ? (countA < required && countB < required)
                    : (countA < required || countB < required);
                if (!eligible) continue;
                const replay = alreadyUsed > 0;
                activePairCounts.set(match.key, alreadyUsed + 1);
                counts.set(match.local.id, countA + 1);
                counts.set(match.visitante.id, countB + 1);
                selected.push({ ...match, revancha: replay });
                if ([...counts.values()].every(value => value >= required)) return true;
            }
        }
        return false;
    };

    tryPick(true);
    if ([...counts.values()].some(value => value < required)) tryPick(false);

    if ([...counts.values()].some(value => value < required)) {
        throw new Error('No se encontró una combinación válida para completar los partidos garantizados.');
    }

    // Compacta los números de ronda preservando que ningún equipo juegue 2 veces en la misma ronda.
    const usedByRound = new Map();
    existingMatches.forEach(match => {
        if (!Number.isInteger(match.ronda)) return;
        const used = usedByRound.get(match.ronda) || new Set();
        used.add(match.equipoLocalId);
        used.add(match.equipoVisitanteId);
        usedByRound.set(match.ronda, used);
    });

    const matchesWithRounds = selected.map(match => {
        let round = 1;
        while ((usedByRound.get(round) || new Set()).has(match.local.id) || (usedByRound.get(round) || new Set()).has(match.visitante.id)) {
            round += 1;
        }
        const used = usedByRound.get(round) || new Set();
        used.add(match.local.id);
        used.add(match.visitante.id);
        usedByRound.set(round, used);
        return { ...match, ronda: round };
    });

    const roundsMap = new Map();
    matchesWithRounds.forEach(match => {
        const list = roundsMap.get(match.ronda) || [];
        list.push(match);
        roundsMap.set(match.ronda, list);
    });
    const rounds = [...roundsMap.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([round, matches]) => {
            const active = new Set(matches.flatMap(item => [item.local.id, item.visitante.id]));
            return {
                round,
                matches,
                byes: teams.filter(team => !active.has(team.id))
            };
        });

    return {
        rounds,
        matches: matchesWithRounds,
        totalMatches: matchesWithRounds.length,
        totalRounds: rounds.length,
        hasByes: rounds.some(round => round.byes.length > 0),
        matchesPerTeam: Object.fromEntries(counts),
        warnings
    };
};

export const RoundRobinEngine = {
    BYE_TOKEN,
    normalizedPairKey,
    generateRoundRobin,
    generateGuaranteedRoundRobin
};
