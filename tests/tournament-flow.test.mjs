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
const logistics = load('js/services/logistics.js')
    .replace("import { DataManager } from '../data/dataManager.js';", '')
    .replace('export const fixtureCompare', 'const fixtureCompare')
    .replace('export const LogisticsService', 'const LogisticsService');
const scheduler = load('js/services/scheduler.js')
    .replace("import { DataManager } from '../data/dataManager.js';", '')
    .replace("import { LogisticsService } from './logistics.js';", '')
    .replace('export const SchedulerService', 'const SchedulerService');
const standings = load('js/services/standings.js')
    .replace("import { DataManager } from '../data/dataManager.js';", '')
    .replace('export const PosicionesService', 'const PosicionesService');
const playoffs = load('js/services/playoffs.js')
    .replace("import { DataManager } from '../data/dataManager.js';", '')
    .replace("import { PosicionesService } from './standings.js';", '')
    .replace("import { SchedulerService } from './scheduler.js';", '')
    .replace('export const PlayoffsService', 'const PlayoffsService');

const scenario = `
    const tournament = DataManager.createTournament('Prueba +50', 3);
    DataManager.setTournamentSetFormats(tournament.id, { zones: 'two_sets_15' });
    const category = DataManager.createCategory('+50', tournament.id);
    let duplicateCategoryBlocked = false;
    try { DataManager.createCategory('+50', tournament.id); } catch { duplicateCategoryBlocked = true; }
    if (!duplicateCategoryBlocked) throw new Error('Se permitió duplicar una categoría dentro del mismo torneo.');
    const batchCategories = DataManager.createCategories(['+40 Femenino', '+60 Mixto'], tournament.id);
    if (batchCategories.length !== 2 || DataManager.getCategoriesByTournament(tournament.id).length !== 3) throw new Error('No se pudieron crear varias categorías en una sola acción.');
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
    if (matchesPerDay.at(-1) !== 0 || matchesPerDay.slice(0, -1).some(count => count < 1)) throw new Error('El último día no quedó reservado para las etapas finales cuando había capacidad previa.');
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
    try { DataManager.updateMatchResult(matches[0].id, [{ puntosLocal: 21, puntosVisitante: 21 }, { puntosLocal: 21, puntosVisitante: 18 }]); } catch { blocked = true; }
    if (!blocked) throw new Error('Se permitió un set empatado.');
    blocked = false;
    try { DataManager.updateMatchResult(matches[0].id, [{ puntosLocal: 21, puntosVisitante: 18 }, { puntosLocal: 21, puntosVisitante: 16 }, { puntosLocal: 17, puntosVisitante: 21 }]); } catch { blocked = true; }
    if (!blocked) throw new Error('Se permitió un tercer set después de cerrar 2-0.');
    DataManager.updateMatchResult(matches[0].id, [{ puntosLocal: 21, puntosVisitante: 18 }, { puntosLocal: 21, puntosVisitante: 16 }]);
    DataManager.updateMatchResult(matches[1].id, [{ puntosLocal: 21, puntosVisitante: 18 }, { puntosLocal: 18, puntosVisitante: 21 }, { puntosLocal: 21, puntosVisitante: 17 }]);
    let scoredMatches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    const firstScored = scoredMatches.find(match => match.id === matches[0].id);
    const secondScored = scoredMatches.find(match => match.id === matches[1].id);
    if (firstScored.setsLocal !== 2 || firstScored.setsVisitante !== 0 || firstScored.score !== '2-0' || firstScored.ganadorId !== firstScored.equipoLocalId || firstScored.sets[0].puntosLocal !== 21 || 'puntosLocal' in firstScored || 'puntosVisitante' in firstScored) throw new Error('El 2-0 no se calculó exclusivamente a partir de los sets.');
    if (secondScored.setsLocal !== 2 || secondScored.setsVisitante !== 1 || secondScored.score !== '2-1' || secondScored.ganadorId !== secondScored.equipoLocalId || secondScored.sets.length !== 3 || 'puntosLocal' in secondScored || 'puntosVisitante' in secondScored) throw new Error('El 2-1 no se calculó exclusivamente a partir de los sets.');
    const table = PosicionesService.calcularPosiciones(tournament.id, category.id);
    const firstLocal = table.find(row => row.id === firstScored.equipoLocalId);
    if (!firstLocal || 'puntos' in firstLocal || firstLocal.jugados !== 1 || firstLocal.ganados !== 1 || firstLocal.setsFavor !== 2 || firstLocal.setsContra !== 0 || firstLocal.puntosFavor !== 42 || firstLocal.puntosContra !== 34 || firstLocal.diferenciaPuntos !== 8) throw new Error('La tabla no se construyó con los sets y puntos reales.');
    if (!table.every(row => Number.isInteger(row.setsFavor) && Number.isInteger(row.setsContra) && Number.isInteger(row.diferenciaSets) && Number.isInteger(row.puntosFavor) && Number.isInteger(row.puntosContra) && Number.isInteger(row.diferenciaPuntos))) throw new Error('No se calcularon las estadísticas internas completas.');
    DataManager.updateMatchResult(matches[0].id, [{ puntosLocal: 21, puntosVisitante: 18 }, { puntosLocal: 18, puntosVisitante: 21 }, { puntosLocal: 21, puntosVisitante: 16 }]);
    scoredMatches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    const editedMatch = scoredMatches.find(match => match.id === matches[0].id);
    if (editedMatch.setsLocal !== 2 || editedMatch.setsVisitante !== 1 || editedMatch.sets.length !== 3) throw new Error('La edición del marcador no recalculó el resultado interno.');
    const updatedTable = PosicionesService.calcularPosiciones(tournament.id, category.id);
    const editedLocal = updatedTable.find(row => row.id === editedMatch.equipoLocalId);
    if (!editedLocal || editedLocal.jugados !== 1 || editedLocal.puntosFavor !== 60 || editedLocal.puntosContra !== 55 || updatedTable.reduce((total, row) => total + row.jugados, 0) !== 4) throw new Error('La edición duplicó o conservó estadísticas anteriores.');
    let top16Blocked = false;
    try { PlayoffsService.generarTop16(tournament.id, category.id); } catch { top16Blocked = true; }
    if (!top16Blocked) throw new Error('Se generó Top 16 con menos de 16 equipos.');

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
    if (oddCreated !== 5 || oddPairs.size !== oddMatches.length || [...oddCounts.values()].some(count => count !== 2) || [...oddRoundAppearances.values()].some(count => count > 1)) throw new Error('La zona impar no generó exactamente los partidos garantizados, equilibrados y sin repetir cruces.');

    const repairTournament = DataManager.createTournament('Reparación de borradores', 3);
    const repairCategory = DataManager.createCategory('+70', repairTournament.id);
    const repairZone = DataManager.createZone('Zona a reparar', repairCategory.id, repairTournament.id);
    for (const name of ['A', 'B', 'C', 'D']) {
        const team = DataManager.createTeam('Reparar ' + name, repairCategory.id, repairTournament.id);
        DataManager.assignTeamToZone(team.id, repairZone.id);
    }
    SchedulerService.generarEmparejamientos(repairTournament.id, repairCategory.id);
    const stored = JSON.parse(localStorage.getItem('newcom_data'));
    const legacyMatch = stored.matches.find(match => match.torneoId === repairTournament.id && match.categoriaId === repairCategory.id);
    const missingMatch = stored.matches.find(match => match.torneoId === repairTournament.id && match.categoriaId === repairCategory.id && match.id !== legacyMatch.id);
    stored.matches = stored.matches.filter(match => match.id !== missingMatch.id);
    stored.matches.push({ ...legacyMatch, id: 'partido_duplicado_antiguo' });
    localStorage.setItem('newcom_data', JSON.stringify(stored));
    const repaired = SchedulerService.generarEmparejamientos(repairTournament.id, repairCategory.id);
    const repairedMatches = DataManager.getMatchesByTournamentAndCategory(repairTournament.id, repairCategory.id);
    if (repaired !== 1 || repairedMatches.length !== 6 || new Set(repairedMatches.map(match => [match.equipoLocalId, match.equipoVisitanteId].sort().join(':'))).size !== 6) throw new Error('Los borradores duplicados heredados no se recuperaron automáticamente.');

    const cappedTournament = DataManager.createTournament('Máximo posible', 8);
    const cappedCategory = DataManager.createCategory('+75', cappedTournament.id);
    const cappedZone = DataManager.createZone('Zona limitada', cappedCategory.id, cappedTournament.id);
    for (const name of ['A', 'B', 'C', 'D']) {
        const team = DataManager.createTeam('Límite ' + name, cappedCategory.id, cappedTournament.id);
        DataManager.assignTeamToZone(team.id, cappedZone.id);
    }
    const cappedCreated = SchedulerService.generarEmparejamientos(cappedTournament.id, cappedCategory.id);
    const cappedFixture = SchedulerService.validateGuaranteedMatches(cappedTournament.id, cappedCategory.id);
    if (cappedCreated !== 6 || cappedFixture.valid !== true) throw new Error('La zona no generó el máximo posible de cruces sin repetir.');
    if (cappedFixture.teams.some(team => team.matches !== 3 || team.required !== 3)) throw new Error('Cada equipo debe jugar exactamente los 3 partidos posibles de su zona.');
    if (!cappedFixture.avisos.some(aviso => aviso.includes('Zona limitada'))) throw new Error('La zona limitada debe avisar que se respetó el máximo en lugar de bloquear.');

    const drawTournament = DataManager.createTournament('Sorteo con líderes', 2);
    const drawCategory = DataManager.createCategory('+40 Mixto', drawTournament.id);
    const drawZoneA = DataManager.createZone('Zona A', drawCategory.id, drawTournament.id);
    const drawZoneB = DataManager.createZone('Zona B', drawCategory.id, drawTournament.id);
    const drawTeams = [];
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) drawTeams.push(DataManager.createTeam('Sorteo ' + name, drawCategory.id, drawTournament.id));
    let duplicateLeaderBlocked = false;
    try { DataManager.drawZones(drawTournament.id, drawCategory.id, { [drawZoneA.id]: drawTeams[0].id, [drawZoneB.id]: drawTeams[0].id }); } catch { duplicateLeaderBlocked = true; }
    if (!duplicateLeaderBlocked) throw new Error('Un equipo pudo ser cabeza de serie de dos zonas.');
    DataManager.drawZones(drawTournament.id, drawCategory.id, { [drawZoneA.id]: drawTeams[0].id, [drawZoneB.id]: drawTeams[1].id });
    const seededZones = DataManager.getZonesByTournamentAndCategory(drawTournament.id, drawCategory.id);
    const seededTeams = DataManager.getTeamsByTournamentAndCategory(drawTournament.id, drawCategory.id);
    const seededSizes = seededZones.map(zone => seededTeams.filter(team => team.zonaId === zone.id).length);
    if (seededZones.find(zone => zone.id === drawZoneA.id).liderEquipoId !== drawTeams[0].id || seededZones.find(zone => zone.id === drawZoneB.id).liderEquipoId !== drawTeams[1].id || seededTeams.find(team => team.id === drawTeams[0].id).zonaId !== drawZoneA.id || seededTeams.find(team => team.id === drawTeams[1].id).zonaId !== drawZoneB.id || Math.max(...seededSizes) - Math.min(...seededSizes) > 1) throw new Error('El sorteo con cabezas de serie no respetó líderes o equilibrio.');
    const assignedZonesBeforeRedraw = new Map(seededTeams.map(team => [team.id, team.zonaId]));
    DataManager.drawZones(drawTournament.id, drawCategory.id);
    const redrawnZones = DataManager.getZonesByTournamentAndCategory(drawTournament.id, drawCategory.id);
    const redrawnTeams = DataManager.getTeamsByTournamentAndCategory(drawTournament.id, drawCategory.id);
    if (redrawnZones.find(zone => zone.id === drawZoneA.id).liderEquipoId !== drawTeams[0].id || redrawnZones.find(zone => zone.id === drawZoneB.id).liderEquipoId !== drawTeams[1].id || redrawnTeams.some(team => team.zonaId !== assignedZonesBeforeRedraw.get(team.id))) throw new Error('Un nuevo sorteo modificó líderes o equipos ya asignados.');
    const freeDrawTeam = DataManager.createTeam('Sorteo G', drawCategory.id, drawTournament.id);
    DataManager.drawZones(drawTournament.id, drawCategory.id);
    const afterFreeDraw = DataManager.getTeamsByTournamentAndCategory(drawTournament.id, drawCategory.id);
    if (!afterFreeDraw.find(team => team.id === freeDrawTeam.id).zonaId || afterFreeDraw.filter(team => team.id !== freeDrawTeam.id).some(team => team.zonaId !== assignedZonesBeforeRedraw.get(team.id))) throw new Error('El sorteo no se limitó a los equipos sin zona.');
    let leaderMoveBlocked = false;
    try { DataManager.assignTeamToZone(drawTeams[0].id, drawZoneB.id); } catch { leaderMoveBlocked = true; }
    if (!leaderMoveBlocked) throw new Error('Se permitió mover una cabeza de serie fija.');

    // Flujo completo: los ocho cruces de Top 16 son nuevos, conservan la
    // fase de zonas y desembocan en Top 8, semifinales, tercer puesto y final.
    const knockoutTournament = DataManager.createTournament('Llave completa', 1, 'points');
    DataManager.setTournamentSetFormats(knockoutTournament.id, { zones: 'two_sets_15' });
    const knockoutCategory = DataManager.createCategory('+68 Mixto', knockoutTournament.id);
    const knockoutZone = DataManager.createZone('Zona única', knockoutCategory.id, knockoutTournament.id);
    for (let index = 1; index <= 16; index += 1) {
        const team = DataManager.createTeam('Clasificado ' + index, knockoutCategory.id, knockoutTournament.id);
        DataManager.assignTeamToZone(team.id, knockoutZone.id);
    }
    DataManager.setTournamentCalendar(knockoutTournament.id, '2026-10-01', '2026-10-12', '09:00', '21:00', []);
    DataManager.setTournamentCourtCount(knockoutTournament.id, 2);
    SchedulerService.generarEmparejamientos(knockoutTournament.id, knockoutCategory.id);
    SchedulerService.confirmarEmparejamientos(knockoutTournament.id, knockoutCategory.id);
    SchedulerService.programarEmparejamientos(knockoutTournament.id, knockoutCategory.id);
    const finish = phase => DataManager.getMatchesByTournamentAndCategory(knockoutTournament.id, knockoutCategory.id)
        .filter(match => match.phase === phase)
        .forEach(match => DataManager.updateMatchResult(match.id, [{ puntosLocal: 15, puntosVisitante: 8 }, { puntosLocal: 15, puntosVisitante: 9 }]));
    const fixtureIdentity = matches => JSON.stringify(matches.filter(match => match.phase === 'ZONAS').map(match => ({ id: match.id, local: match.equipoLocalId, visitante: match.equipoVisitanteId, fecha: match.fecha, hora: match.hora, cancha: match.cancha })));
    const assuredSnapshot = fixtureIdentity(DataManager.getMatchesByTournamentAndCategory(knockoutTournament.id, knockoutCategory.id));
    finish('ZONAS');
    const knockoutTable = PosicionesService.calcularPosiciones(knockoutTournament.id, knockoutCategory.id);
    if (knockoutTable.some(row => row.puntosClasificacion === 0)) throw new Error('El modo por puntos no aplicó los puntos de clasificación 3/1 a cada equipo.');
    if (knockoutTable.reduce((total, row) => total + row.puntosClasificacion, 0) !== 32) throw new Error('Los ocho partidos 2-0 no aportaron 3 puntos al ganador y 1 al perdedor.');
    PlayoffsService.generarTop16(knockoutTournament.id, knockoutCategory.id);
    let knockoutMatches = DataManager.getMatchesByTournamentAndCategory(knockoutTournament.id, knockoutCategory.id);
    if (knockoutMatches.filter(match => match.phase === 'TOP_16').length !== 8 || fixtureIdentity(knockoutMatches) !== assuredSnapshot) throw new Error('El Top 16 no creó ocho partidos nuevos o alteró el fixture asegurado.');
    finish('TOP_16'); PlayoffsService.generarTop8(knockoutTournament.id, knockoutCategory.id);
    finish('TOP_8'); PlayoffsService.generarSemifinales(knockoutTournament.id, knockoutCategory.id);
    finish('SEMIFINAL'); PlayoffsService.generarFinales(knockoutTournament.id, knockoutCategory.id);
    knockoutMatches = DataManager.getMatchesByTournamentAndCategory(knockoutTournament.id, knockoutCategory.id);
    if (knockoutMatches.filter(match => match.phase === 'TOP_8').length !== 4 || knockoutMatches.filter(match => match.phase === 'SEMIFINAL').length !== 2 || knockoutMatches.filter(match => match.phase === 'THIRD_PLACE').length !== 1 || knockoutMatches.filter(match => match.phase === 'FINAL').length !== 1) throw new Error('La llave eliminatoria no completó Top 8, semifinales, final y tercer puesto.');
    finish('THIRD_PLACE'); finish('FINAL');
    const finalTable = PosicionesService.calcularClasificacionFinal(knockoutTournament.id, knockoutCategory.id);
    const finalMatch = DataManager.getMatchesByTournamentAndCategory(knockoutTournament.id, knockoutCategory.id).find(match => match.phase === 'FINAL');
    const thirdMatch = DataManager.getMatchesByTournamentAndCategory(knockoutTournament.id, knockoutCategory.id).find(match => match.phase === 'THIRD_PLACE');
    if (!finalTable || finalTable.length !== 16 || finalTable[0].id !== finalMatch.ganadorId || finalTable[2].id !== thirdMatch.ganadorId) throw new Error('La tabla final no actualizó campeón, subcampeón y tercer puesto desde las eliminatorias.');

    // Formato por sets: la clasificación 3/1 y 2/1 lleva a los cuatro mejores
    // directamente a semifinales, sin crear rondas Top 16 ni Top 8.
    const setsTournament = DataManager.createTournament('Sets directos', 4, 'sets');
    DataManager.setTournamentSetFormats(setsTournament.id, { zones: 'two_sets_15' });
    const setsCategory = DataManager.createCategory('+50 Femenino', setsTournament.id);
    const setsZone = DataManager.createZone('Zona Sets', setsCategory.id, setsTournament.id);
    for (let index = 1; index <= 5; index += 1) {
        const team = DataManager.createTeam('Sets ' + index, setsCategory.id, setsTournament.id);
        DataManager.assignTeamToZone(team.id, setsZone.id);
    }
    SchedulerService.generarEmparejamientos(setsTournament.id, setsCategory.id);
    SchedulerService.confirmarEmparejamientos(setsTournament.id, setsCategory.id);
    const setsMatches = DataManager.getMatchesByTournamentAndCategory(setsTournament.id, setsCategory.id);
    if (setsMatches.length !== 10) throw new Error('El torneo por sets no generó los partidos asegurados de la zona.');
    setsMatches.forEach((match, index) => DataManager.updateMatchResult(match.id, index % 2 === 0
        ? [{ puntosLocal: 25, puntosVisitante: 16 }, { puntosLocal: 25, puntosVisitante: 19 }]
        : [{ puntosLocal: 25, puntosVisitante: 16 }, { puntosLocal: 19, puntosVisitante: 25 }, { puntosLocal: 25, puntosVisitante: 20 }]
    ));
    const setsTable = PosicionesService.calcularPosiciones(setsTournament.id, setsCategory.id);
    const expectedSetPoints = setsMatches.reduce((total, _match, index) => total + (index % 2 === 0 ? 4 : 3), 0);
    if (setsTable.reduce((total, row) => total + row.puntosClasificacion, 0) !== expectedSetPoints) throw new Error('La tabla por sets no calculó los puntos 3/1 y 2/1 internamente.');
    let topStageBlocked = false;
    try { PlayoffsService.generarTop16(setsTournament.id, setsCategory.id); } catch { topStageBlocked = true; }
    if (!topStageBlocked) throw new Error('El formato por sets permitió una fase Top 16.');
    PlayoffsService.generarSemifinales(setsTournament.id, setsCategory.id);
    let setsPlayoffs = DataManager.getMatchesByTournamentAndCategory(setsTournament.id, setsCategory.id);
    if (setsPlayoffs.filter(match => match.phase === 'SEMIFINAL').length !== 2 || setsPlayoffs.some(match => ['TOP_16', 'TOP_8'].includes(match.phase))) throw new Error('El formato por sets no clasificó los cuatro mejores directamente a semifinales.');
    setsPlayoffs.filter(match => match.phase === 'SEMIFINAL').forEach(match => DataManager.updateMatchResult(match.id, [{ puntosLocal: 25, puntosVisitante: 17 }, { puntosLocal: 25, puntosVisitante: 18 }]));
    PlayoffsService.generarFinales(setsTournament.id, setsCategory.id);
    setsPlayoffs = DataManager.getMatchesByTournamentAndCategory(setsTournament.id, setsCategory.id);
    if (setsPlayoffs.filter(match => match.phase === 'FINAL').length !== 1 || setsPlayoffs.filter(match => match.phase === 'THIRD_PLACE').length !== 1) throw new Error('El formato por sets no generó final y tercer puesto luego de las semifinales.');
    console.log(JSON.stringify({ created, confirmed, scheduled, matchesPerTeam: Object.values(counts), dates }));
`;

await import(`data:text/javascript;base64,${Buffer.from(`${dataManager}\n${logistics}\n${scheduler}\n${standings}\n${playoffs}\n${scenario}`).toString('base64')}`);
