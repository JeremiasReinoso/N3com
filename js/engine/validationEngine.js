// Motor de validación central para configuraciones de formatos, equipos, fixtures y eliminatorias.
// Rechaza combinaciones imposibles antes de persistir torneos o generar partidos.

import { isMatchFinished } from './resultsEngine.js';

export const SUPPORTED_FORMATS = Object.freeze([
    'ZONAS_ELIMINATORIAS',
    'TODOS_CONTRA_TODOS',
    'ZONAS_ZONA_FINAL',
    'ELIMINACION_DIRECTA',
    'LIGA_RONDAS',
    'PERSONALIZADO'
]);

export const SUPPORTED_STANDINGS_MODES = Object.freeze(['wins', 'points_table', 'legacy_pf']);
export const SUPPORTED_CARRY_OVER_MODES = Object.freeze(['reset', 'carry_over']);
export const SUPPORTED_QUALIFICATION_MODES = Object.freeze(['general_top_n', 'per_zone']);
export const SUPPORTED_SEEDING_MODES = Object.freeze(['overall_rank', 'zone_cross', 'reseed']);
export const SUPPORTED_CUSTOM_STAGE_TYPES = Object.freeze(['ZONAS', 'TODOS_CONTRA_TODOS', 'ZONA_FINAL', 'ELIMINATORIAS', 'LIGA']);

const isPositiveInt = value => Number.isInteger(Number(value)) && Number(value) >= 1;

export const validateTeamsUnique = teams => {
    const errors = [];
    if (!Array.isArray(teams)) return { valid: false, errors: ['La lista de equipos no es válida.'] };
    const seenIds = new Set();
    const seenNames = new Set();
    teams.forEach(team => {
        if (!team?.id) errors.push('Existe un equipo sin identificador.');
        else if (seenIds.has(team.id)) errors.push(`Equipo duplicado por ID: ${team.id}.`);
        else seenIds.add(team.id);

        const normalizedName = String(team?.nombre || '').trim().toLocaleLowerCase('es');
        if (!normalizedName) errors.push('Existe un equipo sin nombre.');
        else if (seenNames.has(normalizedName)) errors.push(`Nombre de equipo duplicado: ${team.nombre}.`);
        else seenNames.add(normalizedName);
    });
    return { valid: errors.length === 0, errors };
};

export const validateFormatConfig = (config, context = {}) => {
    const errors = [];
    const warnings = [];
    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['Debe especificar una configuración de formato válida.'], warnings };
    }

    const formatId = String(config.formatId || config.format || 'ZONAS_ELIMINATORIAS').toUpperCase();
    if (!SUPPORTED_FORMATS.includes(formatId)) {
        errors.push(`Formato de competición no reconocido: "${formatId}".`);
        return { valid: false, errors, warnings };
    }

    const teamCount = context.teamCount !== undefined ? Number(context.teamCount) : null;
    const zoneCount = context.zoneCount !== undefined ? Number(context.zoneCount) : (config.zonesCount ? Number(config.zonesCount) : null);

    if (config.standingsMode && !SUPPORTED_STANDINGS_MODES.includes(config.standingsMode)) {
        errors.push(`Modo de clasificación no reconocido: "${config.standingsMode}".`);
    }
    if (config.qualificationMode && !SUPPORTED_QUALIFICATION_MODES.includes(config.qualificationMode)) {
        errors.push(`Modalidad de clasificación no reconocida: "${config.qualificationMode}".`);
    }
    if (config.seedingMode && !SUPPORTED_SEEDING_MODES.includes(config.seedingMode)) {
        errors.push(`Modo de ordenamiento de cruces no reconocido: "${config.seedingMode}".`);
    }
    if (config.guaranteedMatches !== undefined && config.guaranteedMatches !== null && !isPositiveInt(config.guaranteedMatches)) {
        errors.push('La cantidad de partidos garantizados debe ser un número entero mayor o igual a 1.');
    }
    if (config.vueltas !== undefined && config.vueltas !== null && (!Number.isInteger(Number(config.vueltas)) || Number(config.vueltas) < 1 || Number(config.vueltas) > 4)) {
        errors.push('La cantidad de vueltas debe estar entre 1 y 4.');
    }

    if (formatId === 'ZONAS_ELIMINATORIAS') {
        const qualificationMode = config.qualificationMode || 'general_top_n';
        const qualifiersTotal = config.qualifiersTotal !== undefined ? Number(config.qualifiersTotal) : null;
        const qualifiersPerZone = config.qualifiersPerZone !== undefined ? Number(config.qualifiersPerZone) : null;
        const bestOthers = Number(config.bestOthers || 0);

        if (!Number.isInteger(bestOthers) || bestOthers < 0) {
            errors.push('La cantidad de mejores terceros/adicionales debe ser un entero mayor o igual a 0.');
        }
        if (qualificationMode === 'per_zone') {
            if (!isPositiveInt(qualifiersPerZone)) {
                errors.push('Debe indicar cuántos equipos clasifican por zona (entero >= 1).');
            }
            if (zoneCount !== null && zoneCount < 1) {
                errors.push('El formato Zonas + Eliminatorias requiere al menos 1 zona.');
            }
            if (zoneCount !== null && isPositiveInt(qualifiersPerZone)) {
                const totalAdvancing = zoneCount * qualifiersPerZone + bestOthers;
                if (totalAdvancing < 2) errors.push('Deben clasificar al menos 2 equipos para generar eliminatorias.');
                if (teamCount !== null && totalAdvancing > teamCount) {
                    errors.push(`No pueden clasificar ${totalAdvancing} equipos si solo hay ${teamCount} registrados.`);
                }
            }
        } else if (qualifiersTotal !== null) {
            if (!Number.isInteger(qualifiersTotal) || qualifiersTotal < 2) {
                errors.push('La cantidad total de clasificados a eliminatorias debe ser al menos 2.');
            }
            if (teamCount !== null && qualifiersTotal > teamCount) {
                errors.push(`No pueden clasificar ${qualifiersTotal} equipos si la categoría tiene ${teamCount}.`);
            }
        }
    }

    if (formatId === 'TODOS_CONTRA_TODOS' || formatId === 'LIGA_RONDAS') {
        if (teamCount !== null && teamCount < 2) {
            errors.push('Se necesitan al menos 2 equipos para disputar este formato.');
        }
        if (config.includePlayoffs && config.qualifiersTotal !== undefined) {
            const q = Number(config.qualifiersTotal);
            if (!Number.isInteger(q) || q < 2) errors.push('Si habilita eliminatorias posteriores, deben clasificar al menos 2 equipos.');
            if (teamCount !== null && q > teamCount) errors.push('La cantidad de clasificados no puede superar los equipos inscriptos.');
        }
    }

    if (formatId === 'ZONAS_ZONA_FINAL') {
        if (!config.carryOverMode || !SUPPORTED_CARRY_OVER_MODES.includes(config.carryOverMode)) {
            errors.push('El formato Zonas + Zona Final exige definir explícitamente si los clasificados arrancan en cero ("reset") o conservan resultados entre sí ("carry_over").');
        }
        if (config.includePlayoffs === true) {
            errors.push('El formato Zonas + Zona Final define el título en la Zona Final y no genera eliminatorias automáticas (use Formato Personalizado si desea sumar llaves posteriores).');
        }
        const qualificationMode = config.qualificationMode || 'per_zone';
        const qualifiersPerZone = Number(config.qualifiersPerZone || 0);
        const bestOthers = Number(config.bestOthers || 0);
        const qualifiersTotal = config.qualifiersTotal !== undefined ? Number(config.qualifiersTotal) : null;
        if (qualificationMode === 'per_zone') {
            if (!isPositiveInt(qualifiersPerZone)) errors.push('Indique cuántos equipos clasifican por zona hacia la Zona Final.');
            if (zoneCount !== null && isPositiveInt(qualifiersPerZone)) {
                const total = zoneCount * qualifiersPerZone + bestOthers;
                if (total < 2) errors.push('La Zona Final requiere al menos 2 equipos clasificados.');
                if (teamCount !== null && total > teamCount) errors.push(`No pueden pasar ${total} equipos a la Zona Final con ${teamCount} inscriptos.`);
            }
        } else if (!Number.isInteger(qualifiersTotal) || qualifiersTotal < 2) {
            errors.push('La Zona Final requiere al menos 2 equipos clasificados.');
        } else if (teamCount !== null && qualifiersTotal > teamCount) {
            errors.push(`No pueden pasar ${qualifiersTotal} equipos a la Zona Final con ${teamCount} inscriptos.`);
        }
    }

    if (formatId === 'ELIMINACION_DIRECTA') {
        if (teamCount !== null && teamCount < 2) {
            errors.push('La Eliminación Directa requiere al menos 2 equipos.');
        }
        if (config.thirdPlace && teamCount !== null && teamCount < 4) {
            warnings.push('El partido por el tercer puesto sólo se disputará si participan al menos 4 equipos.');
        }
    }

    if (formatId === 'PERSONALIZADO') {
        if (!Array.isArray(config.stages) || config.stages.length < 1) {
            errors.push('El formato personalizado debe definir al menos una fase.');
        } else {
            const seenFinalKnockout = config.stages.findIndex(stage => stage?.type === 'ELIMINATORIAS');
            if (seenFinalKnockout >= 0 && seenFinalKnockout < config.stages.length - 1) {
                errors.push('Una fase de Eliminatorias sólo puede ubicarse como fase final del torneo personalizado.');
            }
            let expectedTeams = teamCount;
            config.stages.forEach((stage, index) => {
                const label = `Fase ${index + 1}`;
                if (!stage || !SUPPORTED_CUSTOM_STAGE_TYPES.includes(stage.type)) {
                    errors.push(`${label}: tipo de fase no válido.`);
                    return;
                }
                if (stage.type === 'ZONAS') {
                    if (stage.zonesCount !== undefined && !isPositiveInt(stage.zonesCount)) {
                        errors.push(`${label}: la cantidad de zonas debe ser un entero >= 1.`);
                    }
                    if (expectedTeams !== null && stage.zonesCount && expectedTeams < stage.zonesCount * 2) {
                        errors.push(`${label}: con ${expectedTeams} equipos no pueden formarse ${stage.zonesCount} zonas de al menos 2 equipos.`);
                    }
                }
                if (stage.type === 'ZONA_FINAL') {
                    if (index === 0) errors.push(`${label}: la Zona Final requiere una fase clasificatoria previa.`);
                    if (!stage.carryOverMode || !SUPPORTED_CARRY_OVER_MODES.includes(stage.carryOverMode)) {
                        errors.push(`${label}: debe indicar explícitamente la política de puntos ("reset" o "carry_over").`);
                    }
                }
                if (index < config.stages.length - 1) {
                    const nextStage = config.stages[index + 1];
                    const qualifiers = stage.qualifiersTotal ?? (stage.zonesCount && stage.qualifiersPerZone ? stage.zonesCount * stage.qualifiersPerZone + Number(stage.bestOthers || 0) : null);
                    if (qualifiers !== null) {
                        if (!Number.isInteger(Number(qualifiers)) || Number(qualifiers) < 2) {
                            errors.push(`${label}: deben clasificar al menos 2 equipos hacia ${nextStage.type}.`);
                        } else if (expectedTeams !== null && Number(qualifiers) > expectedTeams) {
                            errors.push(`${label}: no pueden clasificar ${qualifiers} equipos cuando participan ${expectedTeams}.`);
                        }
                        expectedTeams = Number(qualifiers);
                    }
                }
            });
        }
    }

    return { valid: errors.length === 0, errors, warnings };
};

export const validateFixtureIntegrity = (matches, teams, options = {}) => {
    const errors = [];
    const teamIds = new Set((teams || []).map(team => team.id));
    const pairs = new Map();
    const roundsTeams = new Map();
    const allowReplays = Boolean(options.allowReplays);

    (matches || []).forEach(match => {
        const localId = match.equipoLocalId;
        const awayId = match.equipoVisitanteId;
        const isBracket = ['TOP_32', 'TOP_16', 'TOP_8', 'TOP_4', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'].includes(match.phase);

        if (!isBracket && (!localId || !awayId)) {
            errors.push(`El partido ${match.id || '(sin id)'} no tiene ambos equipos asignados.`);
            return;
        }
        if (localId && awayId && localId === awayId) {
            errors.push(`Un equipo no puede enfrentarse contra sí mismo (${localId}).`);
        }
        if (localId && teamIds.size && !teamIds.has(localId)) {
            errors.push(`El equipo local ${localId} no pertenece a esta categoría.`);
        }
        if (awayId && teamIds.size && !teamIds.has(awayId)) {
            errors.push(`El equipo visitante ${awayId} no pertenece a esta categoría.`);
        }
        if (!isBracket && localId && awayId) {
            const key = `${match.phase || 'ZONAS'}:${match.zonaId || ''}:${[localId, awayId].sort().join(':')}`;
            if (pairs.has(key) && !match.revancha && !allowReplays) {
                errors.push(`Enfrentamiento duplicado detectado (${localId} vs ${awayId}).`);
            }
            pairs.set(key, match);
        }
        if (Number.isInteger(match.ronda) && localId && awayId) {
            const roundKey = `${match.phase || 'ZONAS'}:${match.zonaId || ''}:${match.ronda}`;
            const used = roundsTeams.get(roundKey) || new Set();
            if (used.has(localId) || used.has(awayId)) {
                errors.push(`Un equipo aparece dos veces en la ronda ${match.ronda}.`);
            }
            used.add(localId);
            used.add(awayId);
            roundsTeams.set(roundKey, used);
        }
    });

    return { valid: errors.length === 0, errors };
};

export const validateBracketIntegrity = (matches, options = {}) => {
    const errors = [];
    const byPhase = new Map();
    (matches || []).forEach(match => {
        const list = byPhase.get(match.phase) || [];
        list.push(match);
        byPhase.set(match.phase, list);
    });

    byPhase.forEach((phaseMatches, phase) => {
        const seenTeams = new Set();
        phaseMatches.forEach(match => {
            if (match.equipoLocalId && match.equipoVisitanteId && match.equipoLocalId === match.equipoVisitanteId) {
                errors.push(`${phase}: cruce inválido de un equipo contra sí mismo.`);
            }
            [match.equipoLocalId, match.equipoVisitanteId].filter(Boolean).forEach(teamId => {
                if (seenTeams.has(teamId)) errors.push(`${phase}: el equipo ${teamId} aparece repetido en la misma ronda.`);
                seenTeams.add(teamId);
            });
            if (isMatchFinished(match) && ![match.equipoLocalId, match.equipoVisitanteId].includes(match.ganadorId)) {
                errors.push(`${phase}: el ganador registrado no corresponde a ninguno de los participantes del partido.`);
            }
        });
    });

    if (options.validTeamIds) {
        const validSet = new Set(options.validTeamIds);
        (matches || []).forEach(match => {
            [match.equipoLocalId, match.equipoVisitanteId].filter(Boolean).forEach(id => {
                if (!validSet.has(id)) errors.push(`El cuadro incluye un equipo no clasificado (${id}).`);
            });
        });
    }

    return { valid: errors.length === 0, errors };
};

export const ValidationEngine = {
    SUPPORTED_FORMATS,
    SUPPORTED_STANDINGS_MODES,
    SUPPORTED_CARRY_OVER_MODES,
    SUPPORTED_QUALIFICATION_MODES,
    SUPPORTED_SEEDING_MODES,
    SUPPORTED_CUSTOM_STAGE_TYPES,
    validateTeamsUnique,
    validateFormatConfig,
    validateFixtureIntegrity,
    validateBracketIntegrity
};
