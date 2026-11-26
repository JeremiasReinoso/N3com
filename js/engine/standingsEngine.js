// Motor central de posiciones y clasificación.
// Calcula PJ, PG, PP, SF, SC, PF, PC, DIF (sets reales), desempates configurables
// (incluyendo mini-tabla de enfrentamiento directo para empates de 2 o más equipos),
// tablas por zona, tabla de Zona Final (cero vs arrastre explícito) y clasificación definitiva.

import { DataManager } from '../data/dataManager.js';
import { isMatchFinished } from './resultsEngine.js';

export const DEFAULT_POINTS_SYSTEM = Object.freeze({
    win20: 3,
    win21: 2,
    loss12: 1,
    loss02: 0
});

const GROUP_PHASE_SET = new Set(['ZONAS', 'LIGA', 'TODOS_CONTRA_TODOS']);
const isRegularStandingMatch = match => (
    GROUP_PHASE_SET.has(match.phase)
    || (!match.phase && ['fase_zonas', 'cruce_especial', 'liga', 'todos_contra_todos'].includes(match.tipo))
);

const computeMatchTablePoints = (setsWon, setsLost, pointsSystem) => {
    const ps = { ...DEFAULT_POINTS_SYSTEM, ...(pointsSystem || {}) };
    if (setsWon === 2 && setsLost === 0) return ps.win20;
    if (setsWon === 2 && setsLost === 1) return ps.win21;
    if (setsWon === 1 && setsLost === 2) return ps.loss12;
    return ps.loss02;
};

const emptyRow = team => ({
    ...team,
    jugados: 0,
    ganados: 0,
    perdidos: 0,
    setsFavor: 0,
    setsContra: 0,
    puntosFavor: 0,
    puntosContra: 0,
    puntosTabla: 0,
    puntosClasificacion: 0,
    diferenciaSets: 0,
    diferenciaPuntos: 0
});

const accumulateRows = (teams, matches, pointsSystem) => {
    const rows = new Map((teams || []).map(team => [team.id, emptyRow(team)]));
    (matches || []).filter(isMatchFinished).forEach(match => {
        const local = rows.get(match.equipoLocalId);
        const visitante = rows.get(match.equipoVisitanteId);
        const allowPartialInterzonal = Boolean(match.interzonal || match.tipo === 'cruce_especial');
        if ((!local || !visitante) && !allowPartialInterzonal) return;
        if (!local && !visitante) return;

        let localPts = 0;
        let awayPts = 0;
        match.sets.forEach(set => {
            localPts += set.puntosLocal;
            awayPts += set.puntosVisitante;
        });

        if (local) {
            local.jugados += 1;
            local.setsFavor += Number(match.setsLocal || 0);
            local.setsContra += Number(match.setsVisitante || 0);
            local.puntosFavor += localPts;
            local.puntosContra += awayPts;
            local.puntosTabla += computeMatchTablePoints(match.setsLocal, match.setsVisitante, pointsSystem);
            if (match.ganadorId === local.id) local.ganados += 1;
            else local.perdidos += 1;
        }

        if (visitante) {
            visitante.jugados += 1;
            visitante.setsFavor += Number(match.setsVisitante || 0);
            visitante.setsContra += Number(match.setsLocal || 0);
            visitante.puntosFavor += awayPts;
            visitante.puntosContra += localPts;
            visitante.puntosTabla += computeMatchTablePoints(match.setsVisitante, match.setsLocal, pointsSystem);
            if (match.ganadorId === visitante.id) visitante.ganados += 1;
            else visitante.perdidos += 1;
        }
    });

    return [...rows.values()].map(row => ({
        ...row,
        diferenciaSets: row.setsFavor - row.setsContra,
        diferenciaPuntos: row.puntosFavor - row.puntosContra
    }));
};

const CRITERIA_EXTRACTORS = {
    puntosTabla: row => row.puntosTabla,
    ganados: row => row.ganados,
    diferenciaSets: row => row.diferenciaSets,
    setsFavor: row => row.setsFavor,
    diferenciaPuntos: row => row.diferenciaPuntos,
    puntosFavor: row => row.puntosFavor
};

const defaultCriteriaForMode = mode => {
    if (mode === 'legacy_pf') return ['puntosFavor', 'diferenciaPuntos', 'diferenciaSets', 'ganados'];
    if (mode === 'points_table') return ['puntosTabla', 'ganados', 'diferenciaSets', 'diferenciaPuntos', 'puntosFavor'];
    return ['ganados', 'diferenciaSets', 'diferenciaPuntos', 'puntosFavor'];
};

const deterministicCompare = (left, right) => (
    String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
    || String(left.id).localeCompare(String(right.id))
);

const compareByCriteria = (criteria, left, right) => {
    for (const key of criteria) {
        const extractor = CRITERIA_EXTRACTORS[key];
        if (!extractor) continue;
        const diff = extractor(right) - extractor(left);
        if (diff !== 0) return diff;
    }
    return 0;
};

// Desempate por mini-tabla entre los equipos empatados (funciona correctamente
// tanto para empates entre 2 equipos como para empates triples o múltiples).
const resolveTiedGroup = (tiedRows, finishedMatches, criteria, pointsSystem) => {
    if (tiedRows.length <= 1) return tiedRows;
    const tiedIds = new Set(tiedRows.map(row => row.id));
    const headToHeadMatches = finishedMatches.filter(match => (
        tiedIds.has(match.equipoLocalId) && tiedIds.has(match.equipoVisitanteId)
    ));
    if (!headToHeadMatches.length) {
        return [...tiedRows].sort(deterministicCompare);
    }
    const miniRows = new Map(
        accumulateRows(tiedRows.map(row => ({ id: row.id, nombre: row.nombre })), headToHeadMatches, pointsSystem)
            .map(row => [row.id, row])
    );
    return [...tiedRows].sort((left, right) => {
        const miniDiff = compareByCriteria(criteria, miniRows.get(left.id), miniRows.get(right.id));
        if (miniDiff !== 0) return miniDiff;
        return deterministicCompare(left, right);
    });
};

// Función pura principal: calcula la tabla ordenada sobre cualquier lista de equipos y partidos.
export const calculateTable = (teams, matches, rules = {}) => {
    const mode = rules.mode || 'wins';
    const pointsSystem = rules.pointsSystem || DEFAULT_POINTS_SYSTEM;
    const rawCriteria = Array.isArray(rules.tiebreakers) && rules.tiebreakers.length
        ? rules.tiebreakers
        : defaultCriteriaForMode(mode);
    const useHeadToHead = rules.headToHead !== false && !rawCriteria.includes('noHeadToHead');
    const numericCriteria = rawCriteria.filter(item => Boolean(CRITERIA_EXTRACTORS[item]));

    const finishedMatches = (matches || []).filter(isMatchFinished);
    const rows = accumulateRows(teams, finishedMatches, pointsSystem).map(row => ({
        ...row,
        puntosClasificacion: mode === 'legacy_pf'
            ? row.puntosFavor
            : (mode === 'points_table' ? row.puntosTabla : row.ganados)
    }));

    const preSorted = [...rows].sort((left, right) => (
        compareByCriteria(numericCriteria, left, right) || deterministicCompare(left, right)
    ));

    if (!useHeadToHead) return preSorted;

    // Agrupa empates exactos en todos los criterios numéricos y aplica mini-tabla directa.
    const resolved = [];
    let index = 0;
    while (index < preSorted.length) {
        let end = index + 1;
        while (end < preSorted.length && compareByCriteria(numericCriteria, preSorted[index], preSorted[end]) === 0) {
            end += 1;
        }
        const group = preSorted.slice(index, end);
        resolved.push(...resolveTiedGroup(group, finishedMatches, numericCriteria, pointsSystem));
        index = end;
    }
    return resolved;
};

export const StandingsEngine = {
    DEFAULT_POINTS_SYSTEM,
    calculateTable,

    calculateGeneralTable(torneoId, categoriaId, options = {}) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const category = DataManager.getCategory(categoriaId);
        const rules = {
            mode: options.mode || category?.formatConfig?.standingsMode || category?.standingsMode || 'wins',
            tiebreakers: options.tiebreakers || category?.formatConfig?.tiebreakers,
            pointsSystem: options.pointsSystem || category?.formatConfig?.pointsSystem,
            headToHead: options.headToHead
        };
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => (options.phases ? options.phases.includes(match.phase) : isRegularStandingMatch(match)));
        return calculateTable(teams, matches, rules);
    },

    calculateZoneTables(torneoId, categoriaId, options = {}) {
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const category = DataManager.getCategory(categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isRegularStandingMatch(match));
        const rules = {
            mode: options.mode || category?.formatConfig?.standingsMode || category?.standingsMode || 'wins',
            tiebreakers: options.tiebreakers || category?.formatConfig?.tiebreakers,
            pointsSystem: options.pointsSystem || category?.formatConfig?.pointsSystem
        };

        return zones.map(zone => {
            const zoneTeams = teams.filter(team => team.zonaId === zone.id);
            const zoneTeamIds = new Set(zoneTeams.map(team => team.id));
            // Incluye partidos dentro de la zona y cruces interzonales/especiales de sus equipos.
            const zoneMatches = matches.filter(match => (
                match.zonaId === zone.id
                || (zoneTeamIds.has(match.equipoLocalId) && zoneTeamIds.has(match.equipoVisitanteId))
                || ((match.interzonal || match.tipo === 'cruce_especial')
                    && (zoneTeamIds.has(match.equipoLocalId) || zoneTeamIds.has(match.equipoVisitanteId)))
            ));
            return {
                zone,
                standings: calculateTable(zoneTeams, zoneMatches, rules)
            };
        });
    },

    // Tabla específica para Zona Final (Formato C / Personalizado).
    // Exige política explícita: 'reset' (cero puntos) o 'carry_over' (arrastra resultados entre clasificados).
    calculateFinalGroupTable(torneoId, categoriaId, { qualifiedTeamIds, carryOverMode, rules = {} } = {}) {
        if (!['reset', 'carry_over'].includes(carryOverMode)) {
            throw new Error('La Zona Final requiere especificar explícitamente carryOverMode: "reset" o "carry_over".');
        }
        const allTeams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const allMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const finalGroupMatches = allMatches.filter(match => match.phase === 'ZONA_FINAL');

        const inferredIds = [...new Set(finalGroupMatches.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]).filter(Boolean))];
        const targetIds = Array.isArray(qualifiedTeamIds) && qualifiedTeamIds.length ? qualifiedTeamIds : inferredIds;
        const targetSet = new Set(targetIds);
        const qualifiedTeams = allTeams.filter(team => targetSet.has(team.id));

        let relevantMatches;
        if (carryOverMode === 'reset') {
            relevantMatches = finalGroupMatches;
        } else {
            const carriedPrior = allMatches.filter(match => (
                isRegularStandingMatch(match)
                && isMatchFinished(match)
                && targetSet.has(match.equipoLocalId)
                && targetSet.has(match.equipoVisitanteId)
            ));
            relevantMatches = [...carriedPrior, ...finalGroupMatches];
        }

        const category = DataManager.getCategory(categoriaId);
        const effectiveRules = {
            mode: rules.mode || category?.formatConfig?.standingsMode || category?.standingsMode || 'wins',
            tiebreakers: rules.tiebreakers || category?.formatConfig?.tiebreakers,
            pointsSystem: rules.pointsSystem || category?.formatConfig?.pointsSystem
        };
        return calculateTable(qualifiedTeams, relevantMatches, effectiveRules);
    },

    calculateFinalClassification(torneoId, categoriaId) {
        const category = DataManager.getCategory(categoriaId);
        const formatConfig = category?.formatConfig || null;
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const general = this.calculateGeneralTable(torneoId, categoriaId);

        // 1. Si hay Final eliminatoria finalizada, construye ranking completo por instancia alcanzada.
        const final = matches.find(match => match.phase === 'FINAL' && isMatchFinished(match));
        if (final) {
            const loserOf = match => (match.ganadorId === match.equipoLocalId ? match.equipoVisitanteId : match.equipoLocalId);
            const generalRank = new Map(general.map((team, index) => [team.id, index]));
            const sortByGeneralRank = ids => [...new Set(ids.filter(Boolean))]
                .sort((left, right) => (generalRank.get(left) ?? Number.MAX_SAFE_INTEGER) - (generalRank.get(right) ?? Number.MAX_SAFE_INTEGER));

            const orderedIds = [];
            const append = id => { if (id && !orderedIds.includes(id)) orderedIds.push(id); };

            append(final.ganadorId);
            append(loserOf(final));

            const thirdPlace = matches.find(match => (
                match.phase === 'THIRD_PLACE'
                && (!match.placementRank || match.placementRank === 3)
                && isMatchFinished(match)
            ));
            if (thirdPlace) {
                append(thirdPlace.ganadorId);
                append(loserOf(thirdPlace));
            }

            const semifinalLosers = matches
                .filter(match => match.phase === 'SEMIFINAL' && isMatchFinished(match))
                .map(loserOf);
            sortByGeneralRank(semifinalLosers).forEach(append);

            // Cruces por puestos adicionales (ej. 5.º/6.º puesto y 7.º/8.º puesto en Ronda Campeonato)
            const extraPlacementMatches = matches
                .filter(match => match.phase === 'THIRD_PLACE' && Number(match.placementRank) >= 5 && isMatchFinished(match))
                .sort((a, b) => Number(a.placementRank) - Number(b.placementRank));
            extraPlacementMatches.forEach(pm => {
                append(pm.ganadorId);
                append(loserOf(pm));
            });

            // Sub-zonas de reclasificación / Estímulo / Triangulares por puestos (ej. Zona 3 a Zona 6)
            const subZoneMatches = matches.filter(match => match.phase === 'ZONA_FINAL' && match.subZoneId);
            if (subZoneMatches.length) {
                const allTeams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
                const byTeam = new Map(allTeams.map(t => [t.id, t]));
                const rules = {
                    mode: formatConfig?.standingsMode || category?.standingsMode || 'wins',
                    tiebreakers: formatConfig?.tiebreakers,
                    pointsSystem: formatConfig?.pointsSystem
                };
                const subGroups = new Map();
                subZoneMatches.forEach(m => {
                    const g = subGroups.get(m.subZoneId) || {
                        tier: m.subZoneTier || 'campeonato',
                        rankStart: Number(m.rankStart || 999),
                        code: m.subZoneCode || m.subZoneId,
                        matches: [],
                        teamIds: new Set()
                    };
                    g.matches.push(m);
                    if (m.equipoLocalId) g.teamIds.add(m.equipoLocalId);
                    if (m.equipoVisitanteId) g.teamIds.add(m.equipoVisitanteId);
                    subGroups.set(m.subZoneId, g);
                });
                [...subGroups.values()]
                    .sort((a, b) => (a.tier === b.tier ? 0 : (a.tier === 'campeonato' ? -1 : 1))
                        || a.rankStart - b.rankStart
                        || String(a.code).localeCompare(String(b.code), 'es', { numeric: true }))
                    .forEach(group => {
                        const groupTeams = [...group.teamIds].map(id => byTeam.get(id)).filter(Boolean);
                        calculateTable(groupTeams, group.matches, rules).forEach(row => append(row.id));
                    });
            }

            for (const phase of ['TOP_8', 'TOP_16', 'TOP_32']) {
                const losers = matches
                    .filter(match => match.phase === phase && isMatchFinished(match))
                    .map(loserOf);
                sortByGeneralRank(losers).forEach(append);
            }

            const byId = new Map(general.map(team => [team.id, team]));
            return [
                ...orderedIds.map(id => byId.get(id)).filter(Boolean),
                ...general.filter(team => !orderedIds.includes(team.id))
            ];
        }

        // 2. Si el formato es Zonas + Zona Final única y todos los partidos de Zona Final concluyeron.
        const finalGroupMatches = matches.filter(match => match.phase === 'ZONA_FINAL' && !match.subZoneId);
        if (finalGroupMatches.length && finalGroupMatches.every(isMatchFinished)) {
            const carryOverMode = formatConfig?.carryOverMode
                || formatConfig?.stages?.find(stage => stage.type === 'ZONA_FINAL')?.carryOverMode
                || 'reset';
            const finalGroupTable = this.calculateFinalGroupTable(torneoId, categoriaId, { carryOverMode });
            const rankedIds = new Set(finalGroupTable.map(team => team.id));
            return [
                ...finalGroupTable,
                ...general.filter(team => !rankedIds.has(team.id))
            ];
        }

        // 3. Si es Todos contra Todos o Liga por Rondas sin eliminatorias y todos los partidos terminaron.
        if (['TODOS_CONTRA_TODOS', 'LIGA_RONDAS'].includes(formatConfig?.formatId) && !formatConfig?.includePlayoffs) {
            const official = matches.filter(match => match.confirmado || match.estado !== 'borrador');
            if (official.length && official.every(isMatchFinished)) return general;
        }

        return null;
    }
};
