import { DataManager } from '../data/dataManager.js';
import { PosicionesService } from './standings.js';
import { SchedulerService } from './scheduler.js';

const TOP_16_PAIRS = [[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]];
const LIMITS = { TOP_16: 8, TOP_8: 4, SEMIFINAL: 2, FINAL: 1 };
const previous = { TOP_8: 'TOP_16', SEMIFINAL: 'TOP_8' };
const phaseMatches = (t, c, phase) => DataManager.getMatchesByTournamentAndCategory(t, c).filter(match => match.phase === phase);
const winner = match => match.ganadorId;
const assertCompleted = (matches, count, message) => {
    if (matches.length !== count || matches.some(match => match.estado !== 'finalizado' || !winner(match))) throw new Error(message);
};
const assertStage = (matches, eligible, phase) => {
    if (matches.length > LIMITS[phase]) throw new Error(`La etapa ${phase} no puede tener más partidos.`);
    const ids = matches.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]).filter(Boolean);
    if (ids.some(id => !eligible.includes(id)) || new Set(ids).size !== ids.length) throw new Error(`La etapa ${phase} contiene equipos inválidos o repetidos.`);
};
const addMatches = (t, c, phase, pairs, label) => {
    if (!pairs.length) return [];
    const planning = DataManager.getCategoryPlanning(t, c);
    if (planning && !DataManager.getPlanningDatesForStage(t, c, phase).length) throw new Error(`Asigná ${label} a una jornada en Planificación antes de crear sus partidos.`);
    const created = DataManager.addMatches(pairs.map(([local, visitante], index) => ({
        torneoId: t, categoriaId: c, zonaId: null, phase, tipo: phase.toLowerCase(), nombreEtapa: `${label} ${index + 1}`,
        equipoLocalId: local, equipoVisitanteId: visitante, fecha: null, hora: null, cancha: null, orden: null, estado: 'pendiente', confirmado: true
    })));
    SchedulerService.programarFase(t, c, phase, phase === 'TOP_16' ? 'ZONAS' : previous[phase]);
    return created;
};
const eligible = (t, c, phase) => {
    const table = PosicionesService.calcularPosiciones(t, c);
    if (phase === 'TOP_16') {
        const completion = SchedulerService.estadoFaseClasificatoria(t, c);
        if (!completion.ok) throw new Error(completion.mensaje);
        if (table.length < 16) throw new Error('Se necesitan al menos 16 equipos para generar el Top 16.');
        return table.slice(0, 16).map(row => row.id);
    }
    const prior = phaseMatches(t, c, previous[phase]);
    const count = phase === 'TOP_8' ? 8 : 4;
    assertCompleted(prior, count, `Registre los resultados de ${count} partidos antes de continuar.`);
    return prior.map(winner);
};

export const PlayoffsService = {
    generarCruces(t, c) { return this.generarTop16(t, c); },
    generarTop16(t, c) {
        const ids = eligible(t, c, 'TOP_16'); const existing = phaseMatches(t, c, 'TOP_16');
        assertStage(existing, ids, 'TOP_16');
        return existing.length ? existing : addMatches(t, c, 'TOP_16', TOP_16_PAIRS.map(([a, b]) => [ids[a - 1], ids[b - 1]]), 'Top 16');
    },
    generarTop8(t, c) {
        const ids = eligible(t, c, 'TOP_8'); const existing = phaseMatches(t, c, 'TOP_8');
        assertStage(existing, ids, 'TOP_8');
        return existing.length ? existing : addMatches(t, c, 'TOP_8', [[ids[0], ids[1]], [ids[2], ids[3]], [ids[4], ids[5]], [ids[6], ids[7]]], 'Top 8');
    },
    generarTop4(t, c) {
        const prior = phaseMatches(t, c, 'TOP_8'); assertCompleted(prior, 4, 'Registre los resultados del Top 8 antes de continuar.');
        return prior.map(winner);
    },
    generarSemifinales(t, c) {
        const ids = this.generarTop4(t, c); const existing = phaseMatches(t, c, 'SEMIFINAL');
        assertStage(existing, ids, 'SEMIFINAL');
        return existing.length ? existing : addMatches(t, c, 'SEMIFINAL', [[ids[0], ids[1]], [ids[2], ids[3]]], 'Semifinal');
    },
    generarFinal(t, c) {
        const prior = phaseMatches(t, c, 'SEMIFINAL'); assertCompleted(prior, 2, 'Registre las dos semifinales antes de generar la final.');
        const existing = phaseMatches(t, c, 'FINAL');
        return existing.length ? existing : addMatches(t, c, 'FINAL', [[winner(prior[0]), winner(prior[1])]], 'Final');
    },
    generarFinales(t, c) { return this.generarFinal(t, c); },
    crearPartidoManual() { throw new Error('El fixture eliminatorio se genera automáticamente según la llave única.'); }
};
