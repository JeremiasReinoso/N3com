// Motor unificado de generación, confirmación e inspección de fixtures para todos los formatos.
// Despacha hacia GroupStageEngine, RoundRobinEngine, KnockoutEngine y FinalStageEngine
// conservando integridad de equipos, unicidad de cruces, rondas y descansos (byes).

import { DataManager } from '../data/dataManager.js';
import { FormatRegistry } from './formatRegistry.js';
import { RoundRobinEngine } from './roundRobinEngine.js';
import { GroupStageEngine } from './groupStageEngine.js';
import { KnockoutEngine } from './knockoutEngine.js';
import { ValidationEngine } from './validationEngine.js';
import { isOfficialMatch } from './resultsEngine.js';

const getInitialStageDefinition = config => {
    if (config.formatId === 'PERSONALIZADO') {
        return Array.isArray(config.stages) && config.stages.length ? config.stages[0] : null;
    }
    return null;
};

const createLeagueFixtures = (torneoId, categoriaId, teams, options = {}) => {
    const existing = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
        .filter(match => match.phase === 'LIGA');
    const existingPairs = new Set(existing.map(match => RoundRobinEngine.normalizedPairKey(match.equipoLocalId, match.equipoVisitanteId)));
    const maxRound = existing.reduce((max, match) => Math.max(max, Number(match.ronda || 0)), 0);

    const vueltas = Number(options.vueltas || 1);
    const maxRounds = options.maxRounds ?? null;
    const plan = RoundRobinEngine.generateRoundRobin(teams, {
        vueltas,
        maxRounds,
        existingPairs,
        startRound: maxRound + 1
    });

    const payload = plan.matches.map((item, index) => ({
        torneoId,
        categoriaId,
        zonaId: null,
        tipo: 'liga',
        phase: 'LIGA',
        nombreEtapa: `Ronda ${item.ronda}`,
        ronda: item.ronda,
        vuelta: item.vuelta,
        revancha: Boolean(item.revancha),
        equipoLocalId: item.local.id,
        equipoVisitanteId: item.visitante.id,
        fecha: null,
        hora: null,
        cancha: null,
        orden: index + 1,
        estado: options.confirmImmediately ? 'pendiente' : 'borrador',
        confirmado: Boolean(options.confirmImmediately),
        setsLocal: null,
        setsVisitante: null
    }));

    const created = payload.length ? DataManager.addMatches(payload) : [];
    return {
        created,
        createdCount: created.length,
        rounds: plan.rounds,
        hasByes: plan.hasByes,
        warnings: []
    };
};

export const FixtureEngine = {
    generateInitialFixture(torneoId, categoriaId, options = {}) {
        const tournament = DataManager.getTournament(torneoId);
        const category = DataManager.getCategory(categoriaId);
        if (!tournament || !category || category.torneoId !== torneoId) {
            throw new Error('Seleccione un torneo y una categoría válidos.');
        }

        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const teamCheck = ValidationEngine.validateTeamsUnique(teams);
        if (!teamCheck.valid) throw new Error(teamCheck.errors.join(' '));

        const rawConfig = options.formatConfig || DataManager.getCategoryFormatConfig(torneoId, categoriaId);
        const { config } = FormatRegistry.resolve(rawConfig);
        const validation = FormatRegistry.validate(config, { teamCount: teams.length, zoneCount: zones.length });
        if (!validation.valid) throw new Error(validation.errors.join(' '));

        const customFirst = getInitialStageDefinition(config);
        const effectiveType = customFirst ? customFirst.type : config.formatId;

        if (effectiveType === 'ZONAS_ELIMINATORIAS' || effectiveType === 'ZONAS_ZONA_FINAL' || effectiveType === 'ZONAS') {
            const groupMode = options.groupMode
                || customFirst?.groupMode
                || config.groupMode
                || (effectiveType === 'ZONAS_ZONA_FINAL' ? 'round_robin' : 'guaranteed');
            const guaranteedMatches = options.guaranteedMatches
                ?? customFirst?.guaranteedMatches
                ?? config.guaranteedMatches
                ?? tournament.partidos_asegurados;
            const vueltas = options.vueltas ?? customFirst?.vueltas ?? config.vueltas ?? 1;
            return GroupStageEngine.generateZoneFixtures(torneoId, categoriaId, {
                mode: groupMode,
                guaranteedMatches,
                vueltas,
                confirmImmediately: Boolean(options.confirmImmediately),
                allowReplays: options.allowReplays !== false
            });
        }

        if (effectiveType === 'TODOS_CONTRA_TODOS' || effectiveType === 'LIGA_RONDAS' || effectiveType === 'LIGA') {
            const vueltas = options.vueltas ?? customFirst?.vueltas ?? config.vueltas ?? 1;
            const maxRounds = options.maxRounds ?? customFirst?.maxRounds ?? config.maxRounds ?? null;
            return createLeagueFixtures(torneoId, categoriaId, teams, {
                vueltas,
                maxRounds,
                confirmImmediately: Boolean(options.confirmImmediately)
            });
        }

        if (effectiveType === 'ELIMINACION_DIRECTA' || effectiveType === 'ELIMINATORIAS') {
            const orderedTeams = Array.isArray(options.seededTeams) && options.seededTeams.length
                ? options.seededTeams
                : teams.map((team, index) => ({ ...team, seed: team.seed || index + 1 }));
            const thirdPlace = Boolean(options.thirdPlace ?? customFirst?.thirdPlace ?? config.thirdPlace);
            const bracket = KnockoutEngine.generateBracket(torneoId, categoriaId, orderedTeams, { thirdPlace });
            return {
                created: bracket.created,
                createdCount: bracket.created.length,
                plan: bracket.plan,
                alreadyExists: bracket.alreadyExists,
                warnings: validation.warnings
            };
        }

        throw new Error(`No se encontró generador de fixture para el tipo de fase "${effectiveType}".`);
    },

    confirmDraftMatches(torneoId, categoriaId, phases = null) {
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const drafts = matches.filter(match => (
            (!phases || phases.includes(match.phase))
            && !isOfficialMatch(match)
            && (match.estado === 'borrador' || match.estado === 'emparejado')
        ));
        if (!drafts.length) return 0;

        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const integrity = ValidationEngine.validateFixtureIntegrity(matches, teams, { allowReplays: true });
        if (!integrity.valid) throw new Error(integrity.errors.join(' '));

        DataManager.updateMatches(drafts.map(match => ({ ...match, estado: 'pendiente', confirmado: true })));
        return drafts.length;
    },

    getRoundsOverview(torneoId, categoriaId, phase = null) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => !phase || match.phase === phase);

        const byRound = new Map();
        matches.forEach(match => {
            const round = Number.isInteger(match.ronda) ? match.ronda : 1;
            const list = byRound.get(round) || [];
            list.push(match);
            byRound.set(round, list);
        });

        return [...byRound.entries()]
            .sort((left, right) => left[0] - right[0])
            .map(([round, roundMatches]) => {
                const activeIds = new Set(roundMatches.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]).filter(Boolean));
                // Sólo computa byes significativos para fases de tabla (LIGA / ZONA_FINAL / ZONAS de una zona).
                const participantPool = phase === 'ZONA_FINAL'
                    ? teams.filter(team => matches.some(m => m.equipoLocalId === team.id || m.equipoVisitanteId === team.id))
                    : teams;
                return {
                    round,
                    matches: roundMatches,
                    byes: participantPool.filter(team => !activeIds.has(team.id))
                };
            });
    }
};
