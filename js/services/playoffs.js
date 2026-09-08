import { DataManager } from '../data/dataManager.js';
import { PosicionesService } from './standings.js';
import { SchedulerService } from './scheduler.js';

const TOP_16_PAIRS = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];
const STAGE_LIMITS = { TOP_16: 8, TOP_8: 4, SEMIFINAL: 2, THIRD_PLACE: 1, FINAL: 1 };
const PREVIOUS_PHASE = { TOP_16: 'ZONAS', TOP_8: 'TOP_16', SEMIFINAL: 'TOP_8', THIRD_PLACE: 'SEMIFINAL', FINAL: 'SEMIFINAL' };
const winner = match => match.ganadorId;
const phaseMatches = (torneoId, categoriaId, phase) => DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(match => match.phase === phase);
const loser = match => winner(match) === match.equipoLocalId ? match.equipoVisitanteId : match.equipoLocalId;

const assertCompleted = (matches, expected, message) => {
    if (matches.length !== expected || matches.some(match => match.estado !== 'finalizado' || !winner(match))) throw new Error(message);
};
const assertManualStage = (existing, eligibleIds, phase) => {
    if (existing.length > STAGE_LIMITS[phase]) throw new Error(`La etapa ${phase} no puede tener más de ${STAGE_LIMITS[phase]} partidos.`);
    const eligible = new Set(eligibleIds);
    const used = existing.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]);
    if (used.some(id => !eligible.has(id))) throw new Error(`Un partido manual de ${phase} contiene un equipo que no está clasificado para esa etapa.`);
    if (new Set(used).size !== used.length) throw new Error(`Un equipo no puede figurar dos veces en ${phase}.`);
};
const remainingPairs = (eligibleIds, existing) => {
    const used = new Set(existing.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]));
    const remaining = eligibleIds.filter(id => !used.has(id));
    const pairs = [];
    while (remaining.length) pairs.push([remaining.shift(), remaining.pop()]);
    return pairs;
};
const addStageMatches = (torneoId, categoriaId, phase, pairs, title, offset = 0) => {
    if (pairs.length) DataManager.addMatches(pairs.map(([local, visitante], index) => ({
        torneoId, categoriaId, zonaId: null, phase, nombreEtapa: `${title} ${offset + index + 1}`,
        equipoLocalId: local, equipoVisitanteId: visitante, fecha: null, hora: null,
        cancha: null, orden: null, estado: 'pendiente', confirmado: true
    })));
    SchedulerService.programarFase(torneoId, categoriaId, phase, PREVIOUS_PHASE[phase]);
};
const fillStage = (torneoId, categoriaId, phase, eligibleIds, title, pairs = null) => {
    const existing = phaseMatches(torneoId, categoriaId, phase);
    assertManualStage(existing, eligibleIds, phase);
    const generatedPairs = pairs || remainingPairs(eligibleIds, existing);
    const required = STAGE_LIMITS[phase] - existing.length;
    if (generatedPairs.length !== required) throw new Error(`No se pudieron completar los cruces de ${title} sin repetir equipos.`);
    addStageMatches(torneoId, categoriaId, phase, generatedPairs, title, existing.length);
};

const eligibleTeams = (torneoId, categoriaId, phase) => {
    if (phase === 'TOP_16') {
        const completion = SchedulerService.estadoFaseClasificatoria(torneoId, categoriaId);
        if (!completion.ok) throw new Error(completion.mensaje);
        const table = PosicionesService.calcularPosiciones(torneoId, categoriaId);
        if (table.length < 16) throw new Error('Se necesitan al menos 16 equipos para generar el Top 16.');
        return table.slice(0, 16).map(row => row.id);
    }
    const prior = phaseMatches(torneoId, categoriaId, PREVIOUS_PHASE[phase]);
    if (phase === 'TOP_8') {
        assertCompleted(prior, 8, 'Registre los resultados de los 8 partidos Top 16 antes de continuar.');
        return prior.map(winner);
    }
    if (phase === 'SEMIFINAL') {
        assertCompleted(prior, 4, 'Registre los resultados de los 4 partidos Top 8 antes de generar semifinales.');
        return prior.map(winner);
    }
    assertCompleted(prior, 2, 'Registre los resultados de las dos semifinales antes de generar final y tercer puesto.');
    return phase === 'FINAL' ? prior.map(winner) : prior.map(loser);
};

export const PlayoffsService = {
    generarTop16(torneoId, categoriaId) {
        const eligible = eligibleTeams(torneoId, categoriaId, 'TOP_16');
        const existing = phaseMatches(torneoId, categoriaId, 'TOP_16');
        const pairs = existing.length ? null : TOP_16_PAIRS.map(([a, b]) => [eligible[a - 1], eligible[b - 1]]);
        fillStage(torneoId, categoriaId, 'TOP_16', eligible, 'Top 16', pairs);
    },
    generarTop8(torneoId, categoriaId) {
        fillStage(torneoId, categoriaId, 'TOP_8', eligibleTeams(torneoId, categoriaId, 'TOP_8'), 'Top 8');
    },
    generarSemifinales(torneoId, categoriaId) {
        fillStage(torneoId, categoriaId, 'SEMIFINAL', eligibleTeams(torneoId, categoriaId, 'SEMIFINAL'), 'Semifinal');
    },
    generarFinales(torneoId, categoriaId) {
        fillStage(torneoId, categoriaId, 'THIRD_PLACE', eligibleTeams(torneoId, categoriaId, 'THIRD_PLACE'), 'Tercer puesto');
        fillStage(torneoId, categoriaId, 'FINAL', eligibleTeams(torneoId, categoriaId, 'FINAL'), 'Final');
    },
    crearPartidoManual(torneoId, categoriaId, phase, equipoLocalId, equipoVisitanteId, schedule = {}) {
        if (!STAGE_LIMITS[phase]) throw new Error('Seleccione una etapa eliminatoria válida.');
        if (!equipoLocalId || !equipoVisitanteId || equipoLocalId === equipoVisitanteId) throw new Error('Seleccione dos equipos distintos.');
        const eligible = eligibleTeams(torneoId, categoriaId, phase);
        const existing = phaseMatches(torneoId, categoriaId, phase);
        assertManualStage(existing, eligible, phase);
        if (existing.length >= STAGE_LIMITS[phase]) throw new Error(`La etapa ${phase} ya está completa; edite un partido existente.`);
        if (![equipoLocalId, equipoVisitanteId].every(id => eligible.includes(id))) throw new Error('Los equipos elegidos no están clasificados para esta etapa.');
        if (existing.some(match => [match.equipoLocalId, match.equipoVisitanteId].includes(equipoLocalId) || [match.equipoLocalId, match.equipoVisitanteId].includes(equipoVisitanteId))) throw new Error('Uno de los equipos ya está asignado en esta etapa.');
        DataManager.createManualMatch({ torneoId, categoriaId, zonaId: null, phase, nombreEtapa: `Partido manual · ${phase}`, equipoLocalId, equipoVisitanteId, fecha: schedule.fecha || null, hora: schedule.hora || null, cancha: schedule.cancha || null, orden: schedule.orden ? Number(schedule.orden) : null });
        SchedulerService.programarFase(torneoId, categoriaId, phase, PREVIOUS_PHASE[phase]);
    },
    generarFinal(torneoId, categoriaId) { return this.generarFinales(torneoId, categoriaId); }
};
