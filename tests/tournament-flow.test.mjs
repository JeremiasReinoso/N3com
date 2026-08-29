// Prueba de regresión del flujo obligatorio: categoría +50, una zona de
// cuatro equipos, cuatro partidos asegurados, fixture y posiciones.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); }
};

const load = path => readFileSync(resolve(root, path), 'utf8');
const dataManager = load('js/data/dataManager.js').replace('export const DataManager', 'const DataManager');
const scheduler = load('js/services/scheduler.js')
    .replace("import { DataManager } from '../data/dataManager.js';", '')
    .replace('export const SchedulerService', 'const SchedulerService');
const standings = load('js/services/standings.js')
    .replace("import { DataManager } from '../data/dataManager.js';", '')
    .replace('export const PosicionesService', 'const PosicionesService');
const playoffs = load('js/services/playoffs.js')
    .replace("import { DataManager } from '../data/dataManager.js';", '')
    .replace("import { PosicionesService } from './standings.js';", '')
    .replace('export const PlayoffsService', 'const PlayoffsService');

const scenario = `
    const tournament = DataManager.createTournament('Prueba +50', 3);
    const category = DataManager.createCategory('+50', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    for (const name of ['A', 'B', 'C', 'D']) {
        const team = DataManager.createTeam('Equipo ' + name, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
    }
    const registeredTeams = DataManager.getTeamsByTournamentAndCategory(tournament.id, category.id);
    let invalidPairBlocked = false;
    try { DataManager.addMatches([{ torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, tipo: 'fase_zonas', equipoLocalId: registeredTeams[0].id, equipoVisitanteId: registeredTeams[0].id, fecha: null }]); } catch { invalidPairBlocked = true; }
    if (!invalidPairBlocked) throw new Error('Se permitió un equipo contra sí mismo.');
    const created = SchedulerService.generarEmparejamientos(tournament.id, category.id);
    let matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    if (created !== 6 || matches.length !== 6) throw new Error('Se esperaban 6 partidos únicos.');
    const counts = {};
    const uniquePairs = new Set();
    for (const match of matches) {
        if (match.zonaId !== zone.id) throw new Error('Se generó un cruce entre zonas.');
        uniquePairs.add([match.equipoLocalId, match.equipoVisitanteId].sort().join(':'));
        counts[match.equipoLocalId] = (counts[match.equipoLocalId] || 0) + 1;
        counts[match.equipoVisitanteId] = (counts[match.equipoVisitanteId] || 0) + 1;
    }
    if (!Object.values(counts).every(count => count === 3)) throw new Error('No hay tres partidos por equipo.');
    if (uniquePairs.size !== 6) throw new Error('Se repitieron cruces antes de agotar los seis cruces únicos.');
    if (!matches.every(match => Number.isInteger(match.ronda) && match.ronda >= 1)) throw new Error('Los cruces no quedaron organizados por rondas.');
    const appearancesPerRound = new Map();
    for (const match of matches) {
        for (const teamId of [match.equipoLocalId, match.equipoVisitanteId]) {
            const key = match.ronda + ':' + teamId;
            appearancesPerRound.set(key, (appearancesPerRound.get(key) || 0) + 1);
        }
    }
    if ([...appearancesPerRound.values()].some(count => count !== 1)) throw new Error('Un equipo fue programado más de una vez en la misma ronda.');
    let duplicatePairBlocked = false;
    try { DataManager.addMatches([{ torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, tipo: 'fase_zonas', equipoLocalId: registeredTeams[0].id, equipoVisitanteId: registeredTeams[1].id, fecha: null }]); } catch { duplicatePairBlocked = true; }
    if (!duplicatePairBlocked) throw new Error('Se permitió guardar un enfrentamiento duplicado.');
    if (SchedulerService.generarEmparejamientos(tournament.id, category.id) !== 0 || DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).length !== 6) throw new Error('Regenerar el fixture acumuló enfrentamientos.');
    if (SchedulerService.recrearBorradores(tournament.id, category.id) !== 6) throw new Error('No se pudieron rehacer los borradores con el fixture por rondas.');
    matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    if (new Set(matches.map(match => [match.equipoLocalId, match.equipoVisitanteId].sort().join(':'))).size !== 6) throw new Error('Rehacer los borradores generó cruces duplicados.');
    if (!matches.every(match => match.estado === 'borrador' && !match.confirmado)) throw new Error('Los emparejamientos no quedaron como borradores.');
    let blocked = false;
    try { DataManager.updateMatchResult(matches[0].id, 2, 0); } catch { blocked = true; }
    if (!blocked) throw new Error('Se permitió un resultado sin confirmar el partido.');
    const confirmed = SchedulerService.confirmarEmparejamientos(tournament.id, category.id);
    matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    if (confirmed !== 6 || !matches.every(match => match.confirmado && match.estado === 'pendiente')) throw new Error('La confirmación no oficializó los mismos partidos.');
    DataManager.setTournamentCalendar(tournament.id, '2026-09-12', '2026-09-14', '09:00', '21:00', [
        { fecha: '2026-09-12', inicio: '08:00', fin: '10:00' },
        { fecha: '2026-09-13', inicio: '11:00', fin: '13:00' },
        { fecha: '2026-09-14', inicio: '14:00', fin: '17:00' }
    ]);
    const dates = DataManager.getCalendarDates(tournament.id);
    if (dates.join(',') !== '2026-09-12,2026-09-13,2026-09-14') throw new Error('El período del torneo no generó sus tres días.');
    const daySchedules = DataManager.getDaySchedules(tournament.id);
    if (daySchedules.map(day => day.fecha + ':' + day.inicio + '-' + day.fin).join(',') !== '2026-09-12:08:00-10:00,2026-09-13:11:00-13:00,2026-09-14:14:00-17:00') throw new Error('No se guardaron los horarios independientes por día.');
    let invalidDateBlocked = false;
    try { DataManager.addMatches([{ torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, tipo: 'fase_zonas', equipoLocalId: registeredTeams[0].id, equipoVisitanteId: registeredTeams[1].id, fecha: '2026-09-15' }]); } catch { invalidDateBlocked = true; }
    if (!invalidDateBlocked) throw new Error('Se permitió una fecha fuera del período del torneo.');
    DataManager.setTournamentCourtCount(tournament.id, 3);
    const scheduled = SchedulerService.programarEmparejamientos(tournament.id, category.id);
    matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    const scheduleByDate = new Map(daySchedules.map(day => [day.fecha, day]));
    if (scheduled !== 6 || matches.some(match => !match.fecha || !match.hora || !match.cancha || match.estado !== 'pendiente' || !scheduleByDate.has(match.fecha) || match.hora < scheduleByDate.get(match.fecha).inicio || match.hora >= scheduleByDate.get(match.fecha).fin)) throw new Error('La programación está incompleta o sale de los horarios configurados.');
    const matchesPerDay = daySchedules.map(day => matches.filter(match => match.fecha === day.fecha).length);
    if (Math.max(...matchesPerDay) - Math.min(...matchesPerDay) > 1) throw new Error('Los partidos no se distribuyeron equilibradamente entre los días.');
    const datesPerRound = new Map();
    matches.forEach(match => {
        const datesForRound = datesPerRound.get(match.ronda) || new Set();
        datesForRound.add(match.fecha);
        datesPerRound.set(match.ronda, datesForRound);
    });
    if ([...datesPerRound.values()].some(datesForRound => datesForRound.size !== 1)) throw new Error('Una ronda se dividió entre días aun cuando había capacidad disponible.');
    const matchesPerCourt = [...matches.reduce((countsByCourt, match) => countsByCourt.set(match.cancha, (countsByCourt.get(match.cancha) || 0) + 1), new Map()).values()];
    if (matchesPerCourt.length !== 3 || Math.max(...matchesPerCourt) - Math.min(...matchesPerCourt) > 1) throw new Error('Los partidos no se repartieron equilibradamente entre las canchas.');
    DataManager.setTournamentCalendar(tournament.id, '2026-09-15', '2026-09-17', '09:00', '21:00', [
        { fecha: '2026-09-15', inicio: '08:00', fin: '10:00' },
        { fecha: '2026-09-16', inicio: '11:00', fin: '13:00' },
        { fecha: '2026-09-17', inicio: '14:00', fin: '17:00' }
    ]);
    SchedulerService.redistribuirFechas(tournament.id, category.id);
    if (DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).some(match => match.fecha < '2026-09-15' || match.fecha > '2026-09-17')) throw new Error('El cambio de fechas no redistribuyó el fixture dentro del nuevo período.');
    DataManager.setTournamentCalendar(tournament.id, '2026-09-12', '2026-09-14', '09:00', '21:00', [
        { fecha: '2026-09-12', inicio: '08:00', fin: '10:00' },
        { fecha: '2026-09-13', inicio: '11:00', fin: '13:00' },
        { fecha: '2026-09-14', inicio: '14:00', fin: '17:00' }
    ]);
    SchedulerService.programarEmparejamientos(tournament.id, category.id);
    matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    blocked = false;
    try { DataManager.updateMatchResult(matches[0].id, 1, 0); } catch { blocked = true; }
    if (!blocked) throw new Error('Se permitió un resultado distinto de 2-0 o 2-1.');
    DataManager.updateMatchResult(matches[0].id, 2, 0);
    DataManager.updateMatchResult(matches[1].id, 2, 1);
    let scoredMatches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    const firstScored = scoredMatches.find(match => match.id === matches[0].id);
    const secondScored = scoredMatches.find(match => match.id === matches[1].id);
    if (firstScored.puntosLocal !== 3 || firstScored.puntosVisitante !== 1 || firstScored.ganadorId !== firstScored.equipoLocalId) throw new Error('El 2-0 no generó su puntuación interna.');
    if (secondScored.puntosLocal !== 2 || secondScored.puntosVisitante !== 1 || secondScored.ganadorId !== secondScored.equipoLocalId) throw new Error('El 2-1 no generó su puntuación interna.');
    const table = PosicionesService.calcularPosiciones(tournament.id, category.id);
    if (!table.some(row => row.puntos === 3) || !table.some(row => row.puntos === 2) || !table.some(row => row.puntos === 1)) throw new Error('No se aplicó el puntaje 2-0 / 2-1.');
    if (!table.every(row => Number.isInteger(row.setsFavor) && Number.isInteger(row.setsContra) && Number.isInteger(row.diferenciaSets))) throw new Error('No se calcularon los sets.');
    DataManager.updateMatchResult(matches[0].id, 2, 1);
    scoredMatches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    const editedMatch = scoredMatches.find(match => match.id === matches[0].id);
    if (editedMatch.puntosLocal !== 2 || editedMatch.puntosVisitante !== 1) throw new Error('La edición del marcador no recalculó la puntuación interna.');
    const updatedTable = PosicionesService.calcularPosiciones(tournament.id, category.id);
    if (updatedTable.reduce((total, row) => total + row.puntos, 0) !== 6) throw new Error('La edición duplicó puntos en la tabla.');
    const playoffsInfo = PlayoffsService.generarSemifinales(tournament.id, category.id);
    let playoffs = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).filter(match => match.tipo === 'semifinal');
    if (playoffs.length !== 2 || playoffs[0].equipoLocalId !== updatedTable[0].id || playoffs[0].equipoVisitanteId !== updatedTable[3].id || playoffs[1].equipoLocalId !== updatedTable[1].id || playoffs[1].equipoVisitanteId !== updatedTable[2].id) throw new Error('Las semifinales no usan los cuatro primeros de la tabla general.');
    const groupMatchesOnLastDay = matches.filter(match => match.fecha === '2026-09-14');
    if (playoffs.some(match => match.fecha !== '2026-09-14' || groupMatchesOnLastDay.some(groupMatch => groupMatch.hora === match.hora && (groupMatch.cancha === match.cancha || [groupMatch.equipoLocalId, groupMatch.equipoVisitanteId].includes(match.equipoLocalId) || [groupMatch.equipoLocalId, groupMatch.equipoVisitanteId].includes(match.equipoVisitanteId))))) throw new Error('Las semifinales no respetan una franja libre del último día.');
    DataManager.updateMatchResult(playoffs[0].id, 2, 0);
    DataManager.updateMatchResult(playoffs[1].id, 1, 2);
    if (PosicionesService.calcularPosiciones(tournament.id, category.id).reduce((total, row) => total + row.puntos, 0) !== 6) throw new Error('Las eliminatorias alteraron la clasificación general.');
    PlayoffsService.generarFinal(tournament.id, category.id);
    const final = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(match => match.tipo === 'final');
    if (!final || final.equipoLocalId !== playoffs[0].equipoLocalId || final.equipoVisitanteId !== playoffs[1].equipoVisitanteId) throw new Error('La final no usa los ganadores de las semifinales.');
    if (final.fecha !== '2026-09-14' || final.hora <= Math.max(...playoffs.map(match => match.hora))) throw new Error('La final no respeta el horario posterior a las semifinales.');
    DataManager.updateMatchResult(final.id, 2, 1);
    const finalTable = PosicionesService.calcularClasificacionFinal(tournament.id, category.id);
    if (!finalTable || finalTable.length !== 4 || finalTable[0].id !== final.equipoLocalId || finalTable[1].id !== final.equipoVisitanteId) throw new Error('La clasificación final no muestra campeón, subcampeón y el resto de los puestos.');

    const oddTournament = DataManager.createTournament('Zona impar', 2);
    const oddCategory = DataManager.createCategory('+60', oddTournament.id);
    const oddZone = DataManager.createZone('Zona Impar', oddCategory.id, oddTournament.id);
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
        const team = DataManager.createTeam('Impar ' + name, oddCategory.id, oddTournament.id);
        DataManager.assignTeamToZone(team.id, oddZone.id);
    }
    const oddCreated = SchedulerService.generarEmparejamientos(oddTournament.id, oddCategory.id);
    const oddMatches = DataManager.getMatchesByTournamentAndCategory(oddTournament.id, oddCategory.id);
    const oddCounts = new Map();
    const oddPairs = new Set();
    const oddRoundAppearances = new Map();
    for (const match of oddMatches) {
        const pair = [match.equipoLocalId, match.equipoVisitanteId].sort().join(':');
        oddPairs.add(pair);
        for (const teamId of [match.equipoLocalId, match.equipoVisitanteId]) {
            oddCounts.set(teamId, (oddCounts.get(teamId) || 0) + 1);
            const roundKey = match.ronda + ':' + teamId;
            oddRoundAppearances.set(roundKey, (oddRoundAppearances.get(roundKey) || 0) + 1);
        }
    }
    if (oddCreated !== 6 || oddPairs.size !== oddMatches.length || [...oddCounts.values()].some(count => count < 2) || [...oddRoundAppearances.values()].some(count => count > 1)) throw new Error('La zona impar no generó rondas equilibradas y sin repetir cruces.');
    console.log(JSON.stringify({ created, confirmed, scheduled, matchesPerTeam: Object.values(counts), dates, playoffsDate: playoffsInfo.date }));
`;

await import(`data:text/javascript;base64,${Buffer.from(`${dataManager}\n${scheduler}\n${standings}\n${playoffs}\n${scenario}`).toString('base64')}`);
