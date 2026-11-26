// Motor de Reclasificación por Sub-zonas (Ronda Campeonato + Ronda Estímulo / Triangulares)
// y Cruces Definitorios por Puestos (Semifinales, Final, 3.º/4.º, 5.º/6.º, 7.º/8.º) + Interzonales controlados.
// Diseñado sobre las fases persistidas existentes ('ZONA_FINAL', 'LIGA', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL')
// para mantener 100% de compatibilidad con DataManager, LogisticsService y Planificación sin tocarlos.

import { DataManager } from '../data/dataManager.js';
import { RoundRobinEngine } from './roundRobinEngine.js';
import { StandingsEngine } from './standingsEngine.js';
import { isMatchFinished, isOfficialMatch } from './resultsEngine.js';

const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

const pickAt = (zoneTables, zoneIdx, rankIdx) => {
    const entry = zoneTables[zoneIdx];
    if (!entry) return null;
    const team = entry.standings[rankIdx];
    if (!team) return null;
    return {
        ...team,
        sourceZoneId: entry.zone.id,
        sourceZoneName: entry.zone.nombre,
        sourceZoneRank: rankIdx + 1
    };
};

// Construye la distribución de Sub-zonas (Campeonato y Estímulo / Triangulares) a partir de las tablas de Fase 1.
export const buildSubZonesPlan = (zoneTables, options = {}) => {
    const scheme = options.subZoneScheme || 'auto';
    const zCount = zoneTables.length;
    if (zCount < 2) {
        throw new Error('Se requieren al menos 2 zonas iniciales para generar sub-zonas de reclasificación.');
    }

    const groups = [];
    const effectiveScheme = scheme === 'auto'
        ? (zCount === 3 ? 'triangulares_3z' : (zCount === 4 ? 'campeonato_estimulo_4z' : 'general_split'))
        : scheme;

    if (effectiveScheme === 'campeonato_estimulo_4z' && zCount === 4) {
        // Esquema clásico Nacional 4 Zonas (ej. +50 Águilas Doradas: Z1 [1A,1B,2C,2D], Z2 [1C,1D,2A,2B], Z3 [3° y 4°])
        const z1Teams = [
            pickAt(zoneTables, 0, 0),
            pickAt(zoneTables, 1, 0),
            pickAt(zoneTables, 2, 1),
            pickAt(zoneTables, 3, 1)
        ].filter(Boolean);

        const z2Teams = [
            pickAt(zoneTables, 2, 0),
            pickAt(zoneTables, 3, 0),
            pickAt(zoneTables, 0, 1),
            pickAt(zoneTables, 1, 1)
        ].filter(Boolean);

        if (z1Teams.length >= 2) {
            groups.push({
                subZoneId: 'SUB_Z1',
                code: 'Z1',
                name: 'Zona 1 · Campeonato',
                tier: 'campeonato',
                rankStart: 1,
                rankEnd: z1Teams.length + z2Teams.length,
                teams: z1Teams
            });
        }
        if (z2Teams.length >= 2) {
            groups.push({
                subZoneId: 'SUB_Z2',
                code: 'Z2',
                name: 'Zona 2 · Campeonato',
                tier: 'campeonato',
                rankStart: 1,
                rankEnd: z1Teams.length + z2Teams.length,
                teams: z2Teams
            });
        }

        const picked = new Set([...z1Teams, ...z2Teams].map(t => t.id));
        const estimuloTeams = [];
        const maxDepth = Math.max(...zoneTables.map(z => z.standings.length));
        for (let r = 2; r < maxDepth; r += 1) {
            for (let z = 0; z < zCount; z += 1) {
                const candidate = pickAt(zoneTables, z, r);
                if (candidate && !picked.has(candidate.id)) {
                    picked.add(candidate.id);
                    estimuloTeams.push(candidate);
                }
            }
        }
        if (estimuloTeams.length >= 2) {
            const startRank = z1Teams.length + z2Teams.length + 1;
            groups.push({
                subZoneId: 'SUB_Z3',
                code: 'Z3',
                name: `Zona 3 · Estímulo (${startRank}.º al ${startRank + estimuloTeams.length - 1}.º)`,
                tier: 'estimulo',
                rankStart: startRank,
                rankEnd: startRank + estimuloTeams.length - 1,
                teams: estimuloTeams
            });
        }
        return groups;
    }

    if (effectiveScheme === 'triangulares_3z' && zCount === 3) {
        // Esquema clásico 3 Zonas (ej. +60 Águilas Doradas: Z1 [1A,2B,1C], Z2 [2A,1B,2C], Z3 [3°s], Z4 [4°s], Z5 [5°s], Z6 [6°s])
        const z1Teams = [pickAt(zoneTables, 0, 0), pickAt(zoneTables, 1, 1), pickAt(zoneTables, 2, 0)].filter(Boolean);
        const z2Teams = [pickAt(zoneTables, 0, 1), pickAt(zoneTables, 1, 0), pickAt(zoneTables, 2, 1)].filter(Boolean);

        if (z1Teams.length >= 2) {
            groups.push({
                subZoneId: 'SUB_Z1',
                code: 'Z1',
                name: 'Zona 1 · Campeonato',
                tier: 'campeonato',
                rankStart: 1,
                rankEnd: z1Teams.length + z2Teams.length,
                teams: z1Teams
            });
        }
        if (z2Teams.length >= 2) {
            groups.push({
                subZoneId: 'SUB_Z2',
                code: 'Z2',
                name: 'Zona 2 · Campeonato',
                tier: 'campeonato',
                rankStart: 1,
                rankEnd: z1Teams.length + z2Teams.length,
                teams: z2Teams
            });
        }

        let nextRank = z1Teams.length + z2Teams.length + 1;
        const maxDepth = Math.max(...zoneTables.map(z => z.standings.length));
        for (let r = 2; r < maxDepth; r += 1) {
            const tierTeams = [];
            for (let z = 0; z < zCount; z += 1) {
                const candidate = pickAt(zoneTables, z, r);
                if (candidate) tierTeams.push(candidate);
            }
            if (tierTeams.length >= 2) {
                const zoneNumber = r + 1;
                const endRank = nextRank + tierTeams.length - 1;
                groups.push({
                    subZoneId: `SUB_Z${zoneNumber}`,
                    code: `Z${zoneNumber}`,
                    name: `Zona ${zoneNumber} · Puestos ${nextRank}.º al ${endRank}.º`,
                    tier: 'estimulo',
                    rankStart: nextRank,
                    rankEnd: endRank,
                    teams: tierTeams
                });
                nextRank = endRank + 1;
            }
        }
        return groups;
    }

    // Esquema general adaptable para N zonas (serpiente en 2 zonas Campeonato + grupo(s) Estímulo)
    const qualifiersPerZone = Math.max(1, Number(options.qualifiersPerZone || 2));
    const topPool = [];
    for (let r = 0; r < qualifiersPerZone; r += 1) {
        for (let z = 0; z < zCount; z += 1) {
            const candidate = pickAt(zoneTables, z, r);
            if (candidate) topPool.push(candidate);
        }
    }

    if (topPool.length >= 6) {
        const z1 = [];
        const z2 = [];
        topPool.forEach((team, idx) => {
            const row = Math.floor(idx / 2);
            const toFirst = (row % 2 === 0) ? (idx % 2 === 0) : (idx % 2 === 1);
            if (toFirst) z1.push(team);
            else z2.push(team);
        });
        groups.push(
            { subZoneId: 'SUB_Z1', code: 'Z1', name: 'Zona 1 · Campeonato', tier: 'campeonato', rankStart: 1, rankEnd: topPool.length, teams: z1 },
            { subZoneId: 'SUB_Z2', code: 'Z2', name: 'Zona 2 · Campeonato', tier: 'campeonato', rankStart: 1, rankEnd: topPool.length, teams: z2 }
        );
    } else if (topPool.length >= 2) {
        groups.push({
            subZoneId: 'SUB_Z1',
            code: 'Z1',
            name: 'Zona Campeonato',
            tier: 'campeonato',
            rankStart: 1,
            rankEnd: topPool.length,
            teams: topPool
        });
    }

    const picked = new Set(topPool.map(t => t.id));
    const remaining = [];
    const maxDepth = Math.max(...zoneTables.map(z => z.standings.length));
    for (let r = qualifiersPerZone; r < maxDepth; r += 1) {
        for (let z = 0; z < zCount; z += 1) {
            const candidate = pickAt(zoneTables, z, r);
            if (candidate && !picked.has(candidate.id)) {
                picked.add(candidate.id);
                remaining.push(candidate);
            }
        }
    }
    if (remaining.length >= 2) {
        const startRank = topPool.length + 1;
        const nextNum = groups.length + 1;
        groups.push({
            subZoneId: `SUB_Z${nextNum}`,
            code: `Z${nextNum}`,
            name: `Zona ${nextNum} · Estímulo (${startRank}.º al ${startRank + remaining.length - 1}.º)`,
            tier: 'estimulo',
            rankStart: startRank,
            rankEnd: startRank + remaining.length - 1,
            teams: remaining
        });
    }

    return groups;
};

export const ReclassificationEngine = {
    buildSubZonesPlan,

    // Genera todos los partidos todos-contra-todos de cada Sub-zona (Campeonato y Estímulo / Triangulares).
    generateSubZoneMatches(torneoId, categoriaId, options = {}) {
        const existing = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => match.phase === 'ZONA_FINAL' && match.subZoneId);
        if (existing.length) {
            return { created: [], matches: existing, alreadyExists: true };
        }

        const zoneStageMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => (match.phase === 'ZONAS' || match.interzonal) && isOfficialMatch(match));
        if (!zoneStageMatches.length) {
            throw new Error('Primero debés generar y confirmar los partidos de la fase de zonas.');
        }
        if (zoneStageMatches.some(match => !isMatchFinished(match))) {
            throw new Error('Finalizá todos los partidos de la fase inicial antes de generar las sub-zonas de reclasificación.');
        }

        const zoneTables = StandingsEngine.calculateZoneTables(torneoId, categoriaId);
        const groups = buildSubZonesPlan(zoneTables, options);
        if (!groups.length) {
            throw new Error('No se pudieron conformar sub-zonas con la distribución actual.');
        }

        const payload = [];
        let globalOrder = 1;
        groups.forEach(group => {
            const rr = RoundRobinEngine.generateRoundRobin(group.teams, { vueltas: 1 });
            rr.matches.forEach(item => {
                payload.push({
                    torneoId,
                    categoriaId,
                    zonaId: null,
                    tipo: 'zona_final',
                    phase: 'ZONA_FINAL',
                    subZoneId: group.subZoneId,
                    subZoneCode: group.code,
                    subZoneName: group.name,
                    subZoneTier: group.tier,
                    rankStart: group.rankStart,
                    rankEnd: group.rankEnd,
                    nombreEtapa: `${group.name} · R${item.ronda}`,
                    ronda: item.ronda,
                    vuelta: 1,
                    carryOverMode: 'reset',
                    equipoLocalId: item.local.id,
                    equipoVisitanteId: item.visitante.id,
                    fecha: null,
                    hora: null,
                    cancha: null,
                    orden: globalOrder++,
                    estado: options.confirmImmediately !== false ? 'pendiente' : 'borrador',
                    confirmado: options.confirmImmediately !== false,
                    setsLocal: null,
                    setsVisitante: null
                });
            });
        });

        const created = payload.length ? DataManager.addMatches(payload) : [];
        return {
            created,
            matches: created,
            groups,
            alreadyExists: false
        };
    },

    // Calcula las tablas independientes de cada Sub-zona (Zona 1, Zona 2, Zona 3, etc.).
    getSubZoneStandings(torneoId, categoriaId, rules = {}) {
        const allTeams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const byTeamId = new Map(allTeams.map(team => [team.id, team]));
        const subMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => match.phase === 'ZONA_FINAL' && match.subZoneId);
        if (!subMatches.length) return [];

        const category = DataManager.getCategory(categoriaId);
        const effectiveRules = {
            mode: rules.mode || category?.formatConfig?.standingsMode || 'wins',
            tiebreakers: rules.tiebreakers || category?.formatConfig?.tiebreakers,
            pointsSystem: rules.pointsSystem || category?.formatConfig?.pointsSystem
        };

        const grouped = new Map();
        subMatches.forEach(match => {
            const entry = grouped.get(match.subZoneId) || {
                subZoneId: match.subZoneId,
                code: match.subZoneCode || match.subZoneId,
                name: match.subZoneName || match.subZoneId,
                tier: match.subZoneTier || 'campeonato',
                rankStart: match.rankStart || null,
                rankEnd: match.rankEnd || null,
                matches: [],
                teamIds: new Set()
            };
            entry.matches.push(match);
            if (match.equipoLocalId) entry.teamIds.add(match.equipoLocalId);
            if (match.equipoVisitanteId) entry.teamIds.add(match.equipoVisitanteId);
            grouped.set(match.subZoneId, entry);
        });

        return [...grouped.values()]
            .sort((a, b) => String(a.code).localeCompare(String(b.code), 'es', { numeric: true }))
            .map(entry => {
                const teams = [...entry.teamIds].map(id => byTeamId.get(id)).filter(Boolean);
                return {
                    subZoneId: entry.subZoneId,
                    code: entry.code,
                    name: entry.name,
                    tier: entry.tier,
                    rankStart: entry.rankStart,
                    rankEnd: entry.rankEnd,
                    completed: entry.matches.length > 0 && entry.matches.every(isMatchFinished),
                    standings: StandingsEngine.calculateTable(teams, entry.matches, effectiveRules)
                };
            });
    },

    // Genera los Cruces Finales de Campeonato:
    // Semi 1 (1° Z1 vs 2° Z2), Semi 2 (1° Z2 vs 2° Z1), Final, 3.º/4.º puesto y cruces opcionales 5.º/6.º y 7.º/8.º.
    generateChampionshipFinals(torneoId, categoriaId, options = {}) {
        const allMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const existingPlayoffs = allMatches.filter(match => ['SEMIFINAL', 'THIRD_PLACE', 'FINAL'].includes(match.phase));
        if (existingPlayoffs.length) {
            return { created: [], matches: existingPlayoffs, alreadyExists: true };
        }

        const subTables = this.getSubZoneStandings(torneoId, categoriaId);
        const champZones = subTables.filter(item => item.tier === 'campeonato');
        if (!champZones.length) {
            throw new Error('Primero debés generar las sub-zonas de Campeonato.');
        }
        if (champZones.some(zone => !zone.completed)) {
            throw new Error('Finalizá todos los partidos de las Zonas Campeonato antes de generar las semifinales y cruces finales.');
        }

        const includeThirdPlace = options.thirdPlace !== false;
        const includePlacementCrosses = options.placementCrosses !== false;
        const createdAll = [];

        if (champZones.length >= 2) {
            const [z1, z2] = champZones;
            const semiPayload = [
                {
                    torneoId,
                    categoriaId,
                    zonaId: null,
                    phase: 'SEMIFINAL',
                    tipo: 'semifinal',
                    nombreEtapa: 'Semifinal 1 (1.º Z1 vs 2.º Z2)',
                    equipoLocalId: z1.standings[0]?.id,
                    equipoVisitanteId: z2.standings[1]?.id,
                    seedLocal: 1,
                    seedVisitante: 4,
                    orden: 1,
                    estado: 'pendiente',
                    confirmado: true
                },
                {
                    torneoId,
                    categoriaId,
                    zonaId: null,
                    phase: 'SEMIFINAL',
                    tipo: 'semifinal',
                    nombreEtapa: 'Semifinal 2 (1.º Z2 vs 2.º Z1)',
                    equipoLocalId: z2.standings[0]?.id,
                    equipoVisitanteId: z1.standings[1]?.id,
                    seedLocal: 2,
                    seedVisitante: 3,
                    orden: 2,
                    estado: 'pendiente',
                    confirmado: true
                }
            ];

            const semis = DataManager.addMatches(semiPayload);
            createdAll.push(...semis);

            const finalsPayload = [];
            if (includePlacementCrosses && z1.standings[3] && z2.standings[3]) {
                finalsPayload.push({
                    torneoId,
                    categoriaId,
                    zonaId: null,
                    phase: 'THIRD_PLACE',
                    tipo: 'tercer_puesto',
                    placementRank: 7,
                    nombreEtapa: '7.º y 8.º Puesto (4.º Z1 vs 4.º Z2)',
                    equipoLocalId: z1.standings[3].id,
                    equipoVisitanteId: z2.standings[3].id,
                    orden: 3,
                    estado: 'pendiente',
                    confirmado: true
                });
            }
            if (includePlacementCrosses && z1.standings[2] && z2.standings[2]) {
                finalsPayload.push({
                    torneoId,
                    categoriaId,
                    zonaId: null,
                    phase: 'THIRD_PLACE',
                    tipo: 'tercer_puesto',
                    placementRank: 5,
                    nombreEtapa: '5.º y 6.º Puesto (3.º Z1 vs 3.º Z2)',
                    equipoLocalId: z1.standings[2].id,
                    equipoVisitanteId: z2.standings[2].id,
                    orden: 2,
                    estado: 'pendiente',
                    confirmado: true
                });
            }
            if (includeThirdPlace) {
                finalsPayload.push({
                    torneoId,
                    categoriaId,
                    zonaId: null,
                    phase: 'THIRD_PLACE',
                    tipo: 'tercer_puesto',
                    placementRank: 3,
                    nombreEtapa: '3.º y 4.º Puesto',
                    equipoLocalId: null,
                    equipoVisitanteId: null,
                    sourceMatchIds: [],
                    sourceLoserMatchIds: [semis[0].id, semis[1].id],
                    orden: 1,
                    estado: 'pendiente',
                    confirmado: true
                });
            }
            finalsPayload.push({
                torneoId,
                categoriaId,
                zonaId: null,
                phase: 'FINAL',
                tipo: 'final',
                placementRank: 1,
                nombreEtapa: 'Gran Final (1.º y 2.º Puesto)',
                equipoLocalId: null,
                equipoVisitanteId: null,
                sourceMatchIds: [semis[0].id, semis[1].id],
                sourceLoserMatchIds: [],
                orden: 1,
                estado: 'pendiente',
                confirmado: true
            });

            createdAll.push(...DataManager.addMatches(finalsPayload));
            return { created: createdAll, matches: createdAll, alreadyExists: false };
        }

        // Si existe una única Zona Campeonato de al menos 4 equipos: 1°v4° y 2°v3°
        const single = champZones[0];
        if (single.standings.length >= 4) {
            const semis = DataManager.addMatches([
                {
                    torneoId, categoriaId, zonaId: null, phase: 'SEMIFINAL', tipo: 'semifinal',
                    nombreEtapa: 'Semifinal 1 (1.º vs 4.º)',
                    equipoLocalId: single.standings[0].id, equipoVisitanteId: single.standings[3].id,
                    orden: 1, estado: 'pendiente', confirmado: true
                },
                {
                    torneoId, categoriaId, zonaId: null, phase: 'SEMIFINAL', tipo: 'semifinal',
                    nombreEtapa: 'Semifinal 2 (2.º vs 3.º)',
                    equipoLocalId: single.standings[1].id, equipoVisitanteId: single.standings[2].id,
                    orden: 2, estado: 'pendiente', confirmado: true
                }
            ]);
            createdAll.push(...semis);
            const closing = [];
            if (includeThirdPlace) {
                closing.push({
                    torneoId, categoriaId, zonaId: null, phase: 'THIRD_PLACE', tipo: 'tercer_puesto',
                    placementRank: 3, nombreEtapa: '3.º y 4.º Puesto',
                    equipoLocalId: null, equipoVisitanteId: null,
                    sourceMatchIds: [], sourceLoserMatchIds: [semis[0].id, semis[1].id],
                    orden: 1, estado: 'pendiente', confirmado: true
                });
            }
            closing.push({
                torneoId, categoriaId, zonaId: null, phase: 'FINAL', tipo: 'final',
                placementRank: 1, nombreEtapa: 'Gran Final',
                equipoLocalId: null, equipoVisitanteId: null,
                sourceMatchIds: [semis[0].id, semis[1].id], sourceLoserMatchIds: [],
                orden: 1, estado: 'pendiente', confirmado: true
            });
            createdAll.push(...DataManager.addMatches(closing));
        } else if (single.standings.length >= 2) {
            createdAll.push(...DataManager.addMatches([{
                torneoId, categoriaId, zonaId: null, phase: 'FINAL', tipo: 'final',
                placementRank: 1, nombreEtapa: 'Gran Final',
                equipoLocalId: single.standings[0].id, equipoVisitanteId: single.standings[1].id,
                orden: 1, estado: 'pendiente', confirmado: true
            }]));
        }

        return { created: createdAll, matches: createdAll, alreadyExists: false };
    },

    // Crea un cruce interzonal controlado (ej. Zona C de 3 equipos vs Zona D de 3 equipos)
    // para equilibrar la cantidad de partidos de fase inicial cuando el organizador lo solicita.
    createInterzonalMatch(torneoId, categoriaId, localTeamId, awayTeamId, options = {}) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const local = teams.find(t => t.id === localTeamId);
        const away = teams.find(t => t.id === awayTeamId);
        if (!local || !away) throw new Error('Seleccioná dos equipos válidos de esta categoría.');
        if (local.id === away.id) throw new Error('Un equipo no puede jugar contra sí mismo.');
        if (!local.zonaId || !away.zonaId || local.zonaId === away.zonaId) {
            throw new Error('El partido interzonal debe enfrentar a dos equipos de zonas distintas.');
        }

        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const alreadyPlayed = matches.some(m => (
            (m.phase === 'ZONAS' || m.interzonal)
            && pairKey(m.equipoLocalId, m.equipoVisitanteId) === pairKey(local.id, away.id)
        ));
        if (alreadyPlayed) {
            throw new Error('Estos equipos ya tienen un partido registrado entre sí en la fase inicial.');
        }

        const localZone = zones.find(z => z.id === local.zonaId);
        const awayZone = zones.find(z => z.id === away.zonaId);
        const label = `Interzonal · ${localZone?.nombre || 'Zona'} vs ${awayZone?.nombre || 'Zona'}`;

        const created = DataManager.addMatches([{
            torneoId,
            categoriaId,
            zonaId: null,
            phase: 'LIGA',
            tipo: 'liga',
            interzonal: true,
            interzonalZones: [local.zonaId, away.zonaId],
            nombreEtapa: label,
            equipoLocalId: local.id,
            equipoVisitanteId: away.id,
            fecha: options.fecha || null,
            hora: null,
            cancha: null,
            estado: options.confirmImmediately !== false ? 'pendiente' : 'borrador',
            confirmado: options.confirmImmediately !== false
        }]);
        return created[0];
    }
};
