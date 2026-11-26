// Motor central orquestador de competición N3com.
// Punto único de entrada para Escritorio (Electron) y Web, manteniendo compatibilidad total
// con los torneos persistidos y servicios previos mientras habilita los Formatos A–F.

import { DataManager } from '../data/dataManager.js';
import { FormatRegistry } from './formatRegistry.js';
import { ValidationEngine } from './validationEngine.js';
import { FixtureEngine } from './fixtureEngine.js';
import { SchedulingEngine } from './schedulingEngine.js';
import { StandingsEngine } from './standingsEngine.js';
import { ResultsEngine, isMatchFinished, isOfficialMatch } from './resultsEngine.js';
import { QualificationEngine } from './qualificationEngine.js';
import { KnockoutEngine } from './knockoutEngine.js';
import { FinalStageEngine } from './finalStageEngine.js';
import { ReclassificationEngine } from './reclassificationEngine.js';

const resolveStagesForConfig = config => {
    if (config.formatId === 'PERSONALIZADO' && Array.isArray(config.stages)) {
        return config.stages;
    }
    if (config.formatId === 'ZONAS_ELIMINATORIAS') {
        return [
            {
                type: 'ZONAS',
                groupMode: config.groupMode || 'guaranteed',
                qualificationMode: config.qualificationMode || 'general_top_n',
                qualifiersTotal: config.qualifiersTotal,
                qualifiersPerZone: config.qualifiersPerZone,
                bestOthers: config.bestOthers || 0,
                seedingMode: config.seedingMode || 'overall_rank'
            },
            {
                type: 'ELIMINATORIAS',
                thirdPlace: Boolean(config.thirdPlace),
                bracketStyle: config.bracketStyle || 'standard'
            }
        ];
    }
    if (config.formatId === 'TODOS_CONTRA_TODOS' || config.formatId === 'LIGA_RONDAS') {
        const stages = [{ type: 'LIGA', vueltas: config.vueltas || 1, maxRounds: config.maxRounds || null }];
        if (config.includePlayoffs && config.qualifiersTotal >= 2) {
            stages[0].qualificationMode = 'general_top_n';
            stages[0].qualifiersTotal = config.qualifiersTotal;
            stages.push({ type: 'ELIMINATORIAS', thirdPlace: Boolean(config.thirdPlace), bracketStyle: config.bracketStyle || 'standard' });
        }
        return stages;
    }
    if (config.formatId === 'ZONAS_ZONA_FINAL') {
        return [
            {
                type: 'ZONAS',
                groupMode: config.groupMode || 'round_robin',
                qualificationMode: config.qualificationMode || 'per_zone',
                qualifiersTotal: config.qualifiersTotal,
                qualifiersPerZone: config.qualifiersPerZone || 2,
                bestOthers: config.bestOthers || 0,
                seedingMode: 'overall_rank'
            },
            {
                type: 'ZONA_FINAL',
                carryOverMode: config.carryOverMode || 'reset',
                vueltas: config.finalVueltas || 1
            }
        ];
    }
    if (config.formatId === 'ELIMINACION_DIRECTA') {
        return [{ type: 'ELIMINATORIAS', thirdPlace: Boolean(config.thirdPlace), bracketStyle: 'standard' }];
    }
    if (config.formatId === 'ZONAS_SUBZONAS') {
        return [
            { type: 'ZONAS', groupMode: config.groupMode || 'round_robin', qualifiersPerZone: config.qualifiersPerZone || 2 },
            { type: 'SUBZONAS', subZoneScheme: config.subZoneScheme || 'auto' },
            { type: 'ELIMINATORIAS', thirdPlace: config.thirdPlace !== false, placementCrosses: config.placementCrosses !== false }
        ];
    }
    return [];
};

export const CompetitionEngine = {
    FormatRegistry,
    ValidationEngine,
    FixtureEngine,
    SchedulingEngine,
    StandingsEngine,
    ResultsEngine,
    QualificationEngine,
    KnockoutEngine,
    FinalStageEngine,
    ReclassificationEngine,

    listFormats() {
        return FormatRegistry.list();
    },

    getCategoryFormat(torneoId, categoriaId) {
        const raw = DataManager.getCategoryFormatConfig(torneoId, categoriaId);
        return FormatRegistry.resolve(raw);
    },

    setCategoryFormat(torneoId, categoriaId, formatConfig) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const { config } = FormatRegistry.resolve(formatConfig);
        const context = {};
        if (teams.length) context.teamCount = teams.length;
        if (zones.length) context.zoneCount = zones.length;
        const validation = FormatRegistry.validate(config, context);
        if (!validation.valid) {
            throw new Error(validation.errors.join(' '));
        }
        DataManager.setCategoryFormatConfig(torneoId, categoriaId, config);
        return { config, warnings: validation.warnings };
    },

    validateCategorySetup(torneoId, categoriaId) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const { definition, config } = this.getCategoryFormat(torneoId, categoriaId);
        const errors = [];
        const warnings = [];

        const teamCheck = ValidationEngine.validateTeamsUnique(teams);
        errors.push(...teamCheck.errors);

        const formatCheck = FormatRegistry.validate(config, { teamCount: teams.length, zoneCount: zones.length });
        errors.push(...formatCheck.errors);
        warnings.push(...formatCheck.warnings);

        const stages = resolveStagesForConfig(config);
        const needsZones = definition.requiresZones || stages[0]?.type === 'ZONAS';
        if (needsZones) {
            if (!zones.length) errors.push('Este formato requiere crear al menos una zona.');
            if (teams.some(team => !team.zonaId)) errors.push('Todos los equipos deben tener una zona asignada.');
            zones.forEach(zone => {
                const count = teams.filter(team => team.zonaId === zone.id).length;
                if (count > 0 && count < 2) errors.push(`${zone.nombre} debe tener al menos 2 equipos.`);
            });
        }

        return { valid: errors.length === 0, errors, warnings, definition, config };
    },

    generateInitialFixture(torneoId, categoriaId, options = {}) {
        return FixtureEngine.generateInitialFixture(torneoId, categoriaId, options);
    },

    confirmFixture(torneoId, categoriaId, phases = null) {
        return FixtureEngine.confirmDraftMatches(torneoId, categoriaId, phases);
    },

    scheduleTournament(torneoId) {
        return SchedulingEngine.scheduleTournament(torneoId);
    },

    recordResult(matchId, sets) {
        DataManager.updateMatchResult(matchId, sets);
    },

    getStandings(torneoId, categoriaId, options = {}) {
        const { config } = this.getCategoryFormat(torneoId, categoriaId);
        const general = StandingsEngine.calculateGeneralTable(torneoId, categoriaId, options);
        const byZone = StandingsEngine.calculateZoneTables(torneoId, categoriaId, options);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const hasSubZones = matches.some(match => match.phase === 'ZONA_FINAL' && match.subZoneId);
        const hasFinalGroup = matches.some(match => match.phase === 'ZONA_FINAL' && !match.subZoneId);
        let finalGroup = null;
        if (hasFinalGroup) {
            const stages = resolveStagesForConfig(config);
            const finalStage = stages.find(stage => stage.type === 'ZONA_FINAL');
            const carryOverMode = finalStage?.carryOverMode || config.carryOverMode || 'reset';
            finalGroup = FinalStageEngine.getFinalGroupStandings(torneoId, categoriaId, { carryOverMode });
        }
        const subZones = hasSubZones ? ReclassificationEngine.getSubZoneStandings(torneoId, categoriaId) : [];
        const finalClassification = StandingsEngine.calculateFinalClassification(torneoId, categoriaId);
        return { general, byZone, finalGroup, subZones, finalClassification, formatId: config.formatId };
    },

    getQualifiedTeams(torneoId, categoriaId, options = {}) {
        const { config } = this.getCategoryFormat(torneoId, categoriaId);
        const stages = resolveStagesForConfig(config);
        const sourceStage = stages[0] || {};
        const sourcePhases = sourceStage.type === 'LIGA' || sourceStage.type === 'TODOS_CONTRA_TODOS'
            ? ['LIGA']
            : (options.sourcePhases || ['ZONAS']);
        return QualificationEngine.qualifyTeams(torneoId, categoriaId, {
            qualificationMode: options.qualificationMode ?? sourceStage.qualificationMode ?? config.qualificationMode ?? 'general_top_n',
            qualifiersTotal: options.qualifiersTotal ?? sourceStage.qualifiersTotal ?? config.qualifiersTotal,
            qualifiersPerZone: options.qualifiersPerZone ?? sourceStage.qualifiersPerZone ?? config.qualifiersPerZone ?? 2,
            bestOthers: options.bestOthers ?? sourceStage.bestOthers ?? config.bestOthers ?? 0,
            seedingMode: options.seedingMode ?? sourceStage.seedingMode ?? config.seedingMode ?? 'overall_rank',
            requireCompleted: options.requireCompleted !== false,
            sourcePhases,
            standingsRules: {
                mode: config.standingsMode || 'wins',
                tiebreakers: config.tiebreakers,
                pointsSystem: config.pointsSystem
            }
        });
    },

    // Avanza automáticamente a la siguiente etapa prevista por el formato (Zona Final o Eliminatorias).
    // Respeta estrictamente la regla de no crear eliminatorias en formatos que no las contemplan.
    advanceStage(torneoId, categoriaId, options = {}) {
        const { config } = this.getCategoryFormat(torneoId, categoriaId);
        const stages = resolveStagesForConfig(config);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);

        const hasSubZones = matches.some(match => match.phase === 'ZONA_FINAL' && match.subZoneId);
        const hasFinalGroup = matches.some(match => match.phase === 'ZONA_FINAL' && !match.subZoneId);
        const hasKnockout = matches.some(match => KnockoutEngine.ALL_KNOCKOUT_PHASES.includes(match.phase));

        if (config.formatId === 'ZONAS_SUBZONAS') {
            if (!hasSubZones) {
                const result = ReclassificationEngine.generateSubZoneMatches(torneoId, categoriaId, {
                    subZoneScheme: config.subZoneScheme || 'auto',
                    qualifiersPerZone: config.qualifiersPerZone || 2,
                    confirmImmediately: options.confirmImmediately !== false
                });
                if (options.schedule && result.created.length) {
                    try {
                        SchedulingEngine.scheduleTournament(torneoId);
                    } catch (error) {
                        result.created.forEach(m => { try { DataManager.removeMatch(m.id); } catch { /* noop */ } });
                        throw error;
                    }
                }
                return { stage: 'SUBZONAS', ...result };
            }
            if (!hasKnockout) {
                const result = ReclassificationEngine.generateChampionshipFinals(torneoId, categoriaId, {
                    thirdPlace: options.thirdPlace ?? config.thirdPlace !== false,
                    placementCrosses: options.placementCrosses ?? config.placementCrosses !== false
                });
                if (options.schedule && result.created.length) {
                    try {
                        SchedulingEngine.scheduleTournament(torneoId);
                    } catch (error) {
                        result.created.forEach(m => { try { DataManager.removeMatch(m.id); } catch { /* noop */ } });
                        throw error;
                    }
                }
                return { stage: 'ELIMINATORIAS', ...result };
            }
            return { stage: 'FINAL', created: [], alreadyExists: true };
        }

        const finalGroupStageIndex = stages.findIndex(stage => stage.type === 'ZONA_FINAL');
        const knockoutStageIndex = stages.findIndex(stage => stage.type === 'ELIMINATORIAS');

        // 1. Si el formato incluye Zona Final y aún no fue generada, la crea desde los clasificados.
        if (finalGroupStageIndex > 0 && !hasFinalGroup) {
            const finalStage = stages[finalGroupStageIndex];
            const prevStage = stages[finalGroupStageIndex - 1];
            const qualified = this.getQualifiedTeams(torneoId, categoriaId, {
                qualificationMode: prevStage.qualificationMode ?? config.qualificationMode ?? 'per_zone',
                qualifiersTotal: prevStage.qualifiersTotal ?? config.qualifiersTotal,
                qualifiersPerZone: prevStage.qualifiersPerZone ?? config.qualifiersPerZone ?? 2,
                bestOthers: prevStage.bestOthers ?? config.bestOthers ?? 0,
                sourcePhases: prevStage.type === 'LIGA' ? ['LIGA'] : ['ZONAS']
            });
            const result = FinalStageEngine.generateFinalGroup(torneoId, categoriaId, qualified, {
                carryOverMode: finalStage.carryOverMode || config.carryOverMode,
                vueltas: finalStage.vueltas || config.finalVueltas || 1,
                confirmImmediately: options.confirmImmediately !== false
            });
            if (options.schedule && result.created.length) {
                try {
                    SchedulingEngine.scheduleTournament(torneoId);
                } catch (error) {
                    result.created.forEach(m => { try { DataManager.removeMatch(m.id); } catch { /* noop */ } });
                    throw error;
                }
            }
            return { stage: 'ZONA_FINAL', ...result };
        }

        // 2. Si el formato contempla Eliminatorias posteriores y aún no existen.
        if (knockoutStageIndex >= 0 && !hasKnockout) {
            const knockoutStage = stages[knockoutStageIndex];
            let qualified;
            if (knockoutStageIndex === 0) {
                const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
                qualified = teams.map((team, index) => ({ ...team, seed: index + 1 }));
            } else {
                const prevStage = stages[knockoutStageIndex - 1];
                if (prevStage.type === 'ZONA_FINAL') {
                    const fgMatches = matches.filter(match => match.phase === 'ZONA_FINAL');
                    if (!fgMatches.length || fgMatches.some(match => !isMatchFinished(match))) {
                        throw new Error('Finalice todos los partidos de la Zona Final antes de generar eliminatorias.');
                    }
                    const fgTable = FinalStageEngine.getFinalGroupStandings(torneoId, categoriaId, {
                        carryOverMode: prevStage.carryOverMode || config.carryOverMode || 'reset'
                    });
                    const count = Number(prevStage.qualifiersTotal || fgTable.length);
                    qualified = fgTable.slice(0, count).map((team, index) => ({ ...team, seed: index + 1 }));
                } else {
                    qualified = this.getQualifiedTeams(torneoId, categoriaId, {
                        qualificationMode: prevStage.qualificationMode ?? config.qualificationMode ?? 'general_top_n',
                        qualifiersTotal: prevStage.qualifiersTotal ?? config.qualifiersTotal,
                        qualifiersPerZone: prevStage.qualifiersPerZone ?? config.qualifiersPerZone ?? 2,
                        bestOthers: prevStage.bestOthers ?? config.bestOthers ?? 0,
                        seedingMode: prevStage.seedingMode ?? config.seedingMode ?? 'overall_rank',
                        sourcePhases: prevStage.type === 'LIGA' ? ['LIGA'] : ['ZONAS']
                    });
                }
            }

            const result = KnockoutEngine.generateBracket(torneoId, categoriaId, qualified, {
                thirdPlace: Boolean(options.thirdPlace ?? knockoutStage.thirdPlace ?? config.thirdPlace)
            });
            if (options.schedule && result.created.length) {
                try {
                    SchedulingEngine.scheduleTournament(torneoId);
                } catch (error) {
                    result.created.forEach(m => { try { DataManager.removeMatch(m.id); } catch { /* noop */ } });
                    throw error;
                }
            }
            return { stage: 'ELIMINATORIAS', ...result };
        }

        // 3. Si el cuadro eliminatorio ya existe en modo progresivo, avanza a la siguiente ronda.
        if (hasKnockout) {
            const knockoutStage = stages[knockoutStageIndex] || {};
            const result = KnockoutEngine.advanceProgressiveRound(torneoId, categoriaId, {
                reseed: knockoutStage.bracketStyle === 'reseed' || config.seedingMode === 'reseed',
                thirdPlace: Boolean(options.thirdPlace ?? knockoutStage.thirdPlace ?? config.thirdPlace)
            });
            if (options.schedule && result.created?.length) {
                try {
                    SchedulingEngine.scheduleTournament(torneoId);
                } catch (error) {
                    result.created.forEach(m => { try { DataManager.removeMatch(m.id); } catch { /* noop */ } });
                    throw error;
                }
            }
            return { stage: result.phase, ...result };
        }

        throw new Error('Este formato no contempla una etapa eliminatoria o siguiente fase adicional.');
    },

    getCategoryStatus(torneoId, categoriaId) {
        const { definition, config } = this.getCategoryFormat(torneoId, categoriaId);
        const stages = resolveStagesForConfig(config);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const official = matches.filter(isOfficialMatch);
        const finished = official.filter(isMatchFinished);
        const finalClassification = StandingsEngine.calculateFinalClassification(torneoId, categoriaId);

        return {
            formatId: config.formatId,
            formatName: definition.name,
            stages: stages.map(stage => stage.type),
            totalMatches: matches.length,
            officialMatches: official.length,
            draftMatches: matches.length - official.length,
            finishedMatches: finished.length,
            completed: Boolean(finalClassification),
            champion: finalClassification?.[0] || null
        };
    }
};
