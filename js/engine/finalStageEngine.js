// Motor de Zona Final (Formato C: Zonas + Zona Final y Formatos Personalizados).
// Exige una decisión explícita y validada respecto a los resultados previos:
//   - 'reset': todos los clasificados comienzan con 0 puntos y disputan todos contra todos completo.
//   - 'carry_over': se conservan los resultados de fase de zonas entre equipos clasificados y
//     únicamente se generan los cruces pendientes entre clasificados que aún no se enfrentaron.

import { DataManager } from '../data/dataManager.js';
import { RoundRobinEngine } from './roundRobinEngine.js';
import { StandingsEngine } from './standingsEngine.js';
import { isMatchFinished } from './resultsEngine.js';

const VALID_CARRY_OVER_MODES = new Set(['reset', 'carry_over']);

export const FinalStageEngine = {
    VALID_CARRY_OVER_MODES,

    generateFinalGroup(torneoId, categoriaId, qualifiedTeams, options = {}) {
        const { carryOverMode, vueltas = 1, confirmImmediately = true } = options;
        if (!VALID_CARRY_OVER_MODES.has(carryOverMode)) {
            throw new Error('Debe configurar explícitamente si la Zona Final inicia en cero ("reset") o conserva resultados previos entre clasificados ("carry_over").');
        }
        if (!Array.isArray(qualifiedTeams) || qualifiedTeams.length < 2) {
            throw new Error('La Zona Final necesita al menos 2 equipos clasificados.');
        }

        const existingFinalGroup = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => match.phase === 'ZONA_FINAL');
        if (existingFinalGroup.length) {
            return {
                created: [],
                matches: existingFinalGroup,
                carriedMatches: [],
                carryOverMode,
                alreadyExists: true
            };
        }

        const qualifiedIds = new Set(qualifiedTeams.map(team => team.id));
        if (qualifiedIds.size !== qualifiedTeams.length) {
            throw new Error('La Zona Final contiene equipos clasificados repetidos.');
        }

        let carriedMatches = [];
        const existingPairs = new Set();

        if (carryOverMode === 'carry_over') {
            carriedMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
                .filter(match => (
                    match.phase === 'ZONAS'
                    && isMatchFinished(match)
                    && qualifiedIds.has(match.equipoLocalId)
                    && qualifiedIds.has(match.equipoVisitanteId)
                ));
            carriedMatches.forEach(match => {
                existingPairs.add(RoundRobinEngine.normalizedPairKey(match.equipoLocalId, match.equipoVisitanteId));
            });
        }

        const plan = RoundRobinEngine.generateRoundRobin(qualifiedTeams, {
            vueltas,
            existingPairs: carryOverMode === 'carry_over' ? existingPairs : new Set()
        });

        const payload = plan.matches.map((item, index) => ({
            torneoId,
            categoriaId,
            zonaId: null,
            tipo: 'zona_final',
            phase: 'ZONA_FINAL',
            nombreEtapa: `Zona Final · Ronda ${item.ronda}`,
            ronda: item.ronda,
            vuelta: item.vuelta,
            revancha: Boolean(item.revancha),
            carryOverMode,
            equipoLocalId: item.local.id,
            equipoVisitanteId: item.visitante.id,
            fecha: null,
            hora: null,
            cancha: null,
            orden: index + 1,
            estado: confirmImmediately ? 'pendiente' : 'borrador',
            confirmado: Boolean(confirmImmediately),
            setsLocal: null,
            setsVisitante: null
        }));

        const created = payload.length ? DataManager.addMatches(payload) : [];
        return {
            created,
            matches: created,
            rounds: plan.rounds,
            carriedMatches,
            carryOverMode,
            qualifiedTeamIds: [...qualifiedIds],
            alreadyExists: false
        };
    },

    getFinalGroupStandings(torneoId, categoriaId, options = {}) {
        const category = DataManager.getCategory(categoriaId);
        const carryOverMode = options.carryOverMode
            || category?.formatConfig?.carryOverMode
            || category?.formatConfig?.stages?.find(stage => stage.type === 'ZONA_FINAL')?.carryOverMode;
        if (!VALID_CARRY_OVER_MODES.has(carryOverMode)) {
            throw new Error('No está definida la regla de arrastre de puntos ("reset" o "carry_over") para la Zona Final.');
        }
        return StandingsEngine.calculateFinalGroupTable(torneoId, categoriaId, {
            qualifiedTeamIds: options.qualifiedTeamIds,
            carryOverMode,
            rules: options.rules
        });
    }
};
