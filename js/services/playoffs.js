import { DataManager } from '../data/dataManager.js';
import { PosicionesService } from './standings.js';
import { SchedulerService } from './scheduler.js';

// El ranking se congela al crear el cuadro. Las rondas posteriores sólo
// utilizan el seed original y los ganadores persistidos en los partidos.
const TOP16_PAIRS = [[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]];
const stageMatches = (tournamentId, categoryId, phase) => DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => match.phase === phase);
const winnerOf = match => match.ganadorId;
const completed = (matches, expected, label) => {
    if (matches.length !== expected || matches.some(match => match.estado !== 'finalizado' || !winnerOf(match))) throw new Error(`Registre resultados válidos de ${expected} partidos de ${label} antes de continuar.`);
};
const assertUniqueTeams = (matches, label) => {
    const ids = matches.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error(`${label} contiene equipos repetidos o posiciones sin resolver.`);
};

const addStage = (tournamentId, categoryId, phase, pairs, label, sourceMatchIds = [], seeds = []) => {
    if (!DataManager.getDaySchedules(tournamentId).length) throw new Error('Configurá al menos una jornada horaria antes de generar la etapa.');
    if (!DataManager.getTournamentCourts(tournamentId).length) throw new Error('Configurá al menos una cancha antes de generar la etapa.');
    const planning = DataManager.getCategoryPlanning(tournamentId, categoryId);
    if (planning && !DataManager.getPlanningDatesForStage(tournamentId, categoryId, phase).length) throw new Error(`Asigná ${label} a una jornada en Planificación antes de crear sus partidos.`);
    const created = DataManager.addMatches(pairs.map(([local, visitante], index) => ({
        torneoId: tournamentId, categoriaId: categoryId, zonaId: null, phase, tipo: phase.toLowerCase(), nombreEtapa: `${label} ${index + 1}`,
        equipoLocalId: local || null, equipoVisitanteId: visitante || null, seedLocal: seeds[index]?.[0] || null, seedVisitante: seeds[index]?.[1] || null,
        sourceMatchIds: sourceMatchIds[index] || [], fecha: null, hora: null, cancha: null, orden: index + 1, estado: 'pendiente', confirmado: true
    })));
    SchedulerService.programarFase(tournamentId, categoryId, phase);
    const ids = new Set(created.map(match => match.id));
    return DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId).filter(match => ids.has(match.id));
};

const top16Ranking = (tournamentId, categoryId) => {
    const completion = SchedulerService.estadoFaseClasificatoria(tournamentId, categoryId);
    if (!completion.ok) throw new Error(completion.mensaje);
    const table = PosicionesService.calcularPosiciones(tournamentId, categoryId);
    if (table.length < 16) throw new Error('No se puede generar el Top 16: se necesitan al menos 16 equipos clasificados.');
    return table.slice(0, 16);
};

const survivorsByOriginalSeed = matches => matches
    .filter(match => match.ganadorId)
    .map(match => ({ id: match.ganadorId, seed: match.ganadorId === match.equipoLocalId ? match.seedLocal : match.seedVisitante, source: match }))
    .sort((left, right) => left.seed - right.seed);
const eliminationPairs = survivors => {
    if (survivors.length % 2) throw new Error('La etapa eliminatoria no tiene una cantidad par de clasificados.');
    return Array.from({ length: survivors.length / 2 }, (_, index) => [survivors[index].id, survivors[survivors.length - 1 - index].id]);
};

export const PlayoffsService = {
    generarTop16(tournamentId, categoryId) {
        const existing = stageMatches(tournamentId, categoryId, 'TOP_16');
        if (existing.length) return existing;
        const ranking = top16Ranking(tournamentId, categoryId);
        const pairs = TOP16_PAIRS.map(([left, right]) => [ranking[left - 1].id, ranking[right - 1].id]);
        return addStage(tournamentId, categoryId, 'TOP_16', pairs, 'Top 16', [], TOP16_PAIRS);
    },

    generarTop8(tournamentId, categoryId) {
        const existing = stageMatches(tournamentId, categoryId, 'TOP_8');
        if (existing.length) return existing;
        const top16 = stageMatches(tournamentId, categoryId, 'TOP_16');
        completed(top16, 8, 'Top 16');
        const survivors = survivorsByOriginalSeed(top16);
        assertUniqueTeams(top16, 'Top 16');
        const pairs = eliminationPairs(survivors);
        const sources = pairs.map(pair => pair.map(id => survivors.find(item => item.id === id).source.id));
        const seeds = pairs.map(pair => pair.map(id => survivors.find(item => item.id === id).seed));
        return addStage(tournamentId, categoryId, 'TOP_8', pairs, 'Top 8', sources, seeds);
    },

    // Top 4 es el estado de los cuatro supervivientes. Sus dos partidos son
    // las semifinales; no se crea una ronda artificial adicional.
    generarTop4(tournamentId, categoryId) {
        const existing = stageMatches(tournamentId, categoryId, 'SEMIFINAL');
        if (existing.length) return existing;
        const top8 = stageMatches(tournamentId, categoryId, 'TOP_8');
        completed(top8, 4, 'Top 8');
        const survivors = survivorsByOriginalSeed(top8);
        assertUniqueTeams(top8, 'Top 8');
        const pairs = eliminationPairs(survivors);
        const sources = pairs.map(pair => pair.map(id => survivors.find(item => item.id === id).source.id));
        const seeds = pairs.map(pair => pair.map(id => survivors.find(item => item.id === id).seed));
        return addStage(tournamentId, categoryId, 'SEMIFINAL', pairs, 'Semifinales · Top 4', sources, seeds);
    },

    generarSemifinales(tournamentId, categoryId) { return this.generarTop4(tournamentId, categoryId); },

    generarFinal(tournamentId, categoryId) {
        const existing = stageMatches(tournamentId, categoryId, 'FINAL');
        if (existing.length) return existing;
        const semifinales = stageMatches(tournamentId, categoryId, 'SEMIFINAL');
        completed(semifinales, 2, 'Semifinales');
        const finalists = semifinales.map(match => ({ id: match.ganadorId, seed: match.ganadorId === match.equipoLocalId ? match.seedLocal : match.seedVisitante, source: match })).sort((a, b) => a.seed - b.seed);
        return addStage(tournamentId, categoryId, 'FINAL', [[finalists[0].id, finalists[1].id]], 'Final', [[finalists[0].source.id, finalists[1].source.id]], [[finalists[0].seed, finalists[1].seed]]);
    },

    generarCuadroCompleto(tournamentId, categoryId) { return this.generarTop16(tournamentId, categoryId); },
    crearPartidoManual() { throw new Error('El cuadro eliminatorio se genera automáticamente a partir de la clasificación congelada.'); }
};
