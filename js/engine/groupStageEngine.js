// Motor de Fase de Zonas.
// Construye enfrentamientos intra-zona utilizando RoundRobinEngine (todos contra todos
// o partidos garantizados con rondas equilibradas y byes explícitos) y conserva
// compatibilidad con la excepción aislada de cruces especiales (+50 Mixto).

import { DataManager } from '../data/dataManager.js';
import { RoundRobinEngine } from './roundRobinEngine.js';
import { SPECIAL_CROSS_TYPE } from '../services/specialCrosses.js';

const isGroupMatch = match => (
    match.phase === 'ZONAS'
    || !match.tipo
    || match.tipo === 'fase_zonas'
    || match.tipo === SPECIAL_CROSS_TYPE
);

export const GroupStageEngine = {
    generateZoneFixtures(torneoId, categoriaId, options = {}) {
        const tournament = DataManager.getTournament(torneoId);
        if (!tournament) throw new Error('Seleccione un torneo válido.');

        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        if (!teams.length) throw new Error('La categoría seleccionada no tiene equipos.');
        if (!zones.length) throw new Error('Cree al menos una zona antes de generar el fixture.');
        if (teams.some(team => !team.zonaId)) {
            throw new Error('Asigne una zona a todos los equipos antes de generar enfrentamientos.');
        }

        const mode = options.mode || 'guaranteed'; // 'round_robin' | 'guaranteed'
        const vueltas = Number(options.vueltas || (options.doubleRoundRobin ? 2 : 1));
        const guaranteedMatches = Number(options.guaranteedMatches ?? tournament.partidos_asegurados ?? 0);
        const allowReplays = options.allowReplays !== false;

        DataManager.deduplicateGroupMatches(torneoId, categoriaId);
        const existingGroupMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(isGroupMatch);

        const pendingMatches = [];
        const zoneSummaries = [];
        const warnings = [];

        for (const zone of zones) {
            const zoneTeams = teams.filter(team => team.zonaId === zone.id);
            if (!zoneTeams.length) continue;
            if (zoneTeams.length < 2) {
                throw new Error(`${zone.nombre} necesita al menos dos equipos.`);
            }

            const zoneTeamIds = new Set(zoneTeams.map(team => team.id));
            const zoneExisting = existingGroupMatches.filter(match => (
                zoneTeamIds.has(match.equipoLocalId) || zoneTeamIds.has(match.equipoVisitanteId)
            ));

            let plan;
            if (mode === 'round_robin') {
                const existingPairs = new Set(
                    zoneExisting
                        .filter(match => zoneTeamIds.has(match.equipoLocalId) && zoneTeamIds.has(match.equipoVisitanteId))
                        .map(match => RoundRobinEngine.normalizedPairKey(match.equipoLocalId, match.equipoVisitanteId))
                );
                const maxExistingRound = zoneExisting.reduce((max, match) => Math.max(max, Number(match.ronda || 0)), 0);
                plan = RoundRobinEngine.generateRoundRobin(zoneTeams, {
                    vueltas,
                    existingPairs,
                    startRound: maxExistingRound + 1
                });
            } else {
                const required = guaranteedMatches > 0 ? guaranteedMatches : zoneTeams.length - 1;
                plan = RoundRobinEngine.generateGuaranteedRoundRobin(zoneTeams, required, {
                    existingMatches: zoneExisting,
                    allowReplays
                });
                if (plan.warnings?.length) {
                    warnings.push(...plan.warnings.map(message => `${zone.nombre}: ${message}`));
                }
            }

            plan.matches.forEach(item => {
                pendingMatches.push({
                    torneoId,
                    categoriaId,
                    zonaId: zone.id,
                    tipo: 'fase_zonas',
                    phase: 'ZONAS',
                    ronda: item.ronda,
                    vuelta: item.vuelta || 1,
                    revancha: Boolean(item.revancha),
                    equipoLocalId: item.local.id,
                    equipoVisitanteId: item.visitante.id,
                    fecha: null,
                    hora: null,
                    cancha: null,
                    estado: options.confirmImmediately ? 'pendiente' : 'borrador',
                    confirmado: Boolean(options.confirmImmediately),
                    setsLocal: null,
                    setsVisitante: null
                });
            });

            zoneSummaries.push({
                zoneId: zone.id,
                zoneName: zone.nombre,
                teamCount: zoneTeams.length,
                newMatches: plan.matches.length,
                rounds: plan.rounds,
                hasByes: Boolean(plan.hasByes)
            });
        }

        const created = pendingMatches.length ? DataManager.addMatches(pendingMatches) : [];
        return {
            created,
            createdCount: created.length,
            zones: zoneSummaries,
            warnings
        };
    }
};
