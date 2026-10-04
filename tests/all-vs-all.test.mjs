import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); }
};

const moduleUrl = path => pathToFileURL(resolve(root, path)).href;
const { DataManager } = await import(moduleUrl('js/data/dataManager.js'));
const { SchedulerService } = await import(moduleUrl('js/services/scheduler.js'));
const { PosicionesService } = await import(moduleUrl('js/services/standings.js'));
const { PlayoffsService } = await import(moduleUrl('js/services/playoffs.js'));
const result = [{ puntosLocal: 25, puntosVisitante: 16 }, { puntosLocal: 25, puntosVisitante: 18 }];

const tournament = DataManager.createTournament('Todos contra todos', 3, 'sets', 'all_vs_all');
DataManager.setTournamentSetFormats(tournament.id, { zones: 'two_sets_15' });
const category = DataManager.createCategory('+40 Mixto', tournament.id);
const zones = ['Zona A', 'Zona B'].map(name => DataManager.createZone(name, category.id, tournament.id));
const createdTeams = Array.from({ length: 8 }, (_, index) => {
    const team = DataManager.createTeam(`Equipo ${index + 1}`, category.id, tournament.id);
    DataManager.assignTeamToZone(team.id, zones[index < 4 ? 0 : 1].id);
    return team;
});
const teams = DataManager.getTeamsByTournamentAndCategory(tournament.id, category.id);

DataManager.setTournamentCalendar(tournament.id, '2026-11-01', '2026-11-10', '09:00', '21:00', []);
DataManager.setTournamentCourtCount(tournament.id, 2);
assert.equal(SchedulerService.generarEmparejamientos(tournament.id, category.id), 12);
const guaranteed = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
assert(guaranteed.every(match => match.phase === 'ZONAS'));
assert(guaranteed.every(match => {
    const local = teams.find(team => team.id === match.equipoLocalId);
    const visitor = teams.find(team => team.id === match.equipoVisitanteId);
    return local.zonaId === visitor.zonaId;
}));
SchedulerService.confirmarEmparejamientos(tournament.id, category.id);
DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).forEach(match => DataManager.updateMatchResult(match.id, result));
assert.equal(SchedulerService.getTournamentPhase(tournament.id, category.id), 'ALL_VS_ALL');
assert.equal(PosicionesService.calcularPosiciones(tournament.id, category.id).length, 8);

const manual = SchedulerService.crearCruceManualTodosContraTodos(tournament.id, category.id, teams[0].id, teams[7].id, {
    fecha: '2026-11-09', hora: '09:00', cancha: 'Cancha 1'
});
assert.notEqual(teams[0].zonaId, teams[7].zonaId, 'El cruce manual debe permitir zonas distintas.');
assert.throws(() => SchedulerService.crearCruceManualTodosContraTodos(tournament.id, category.id, teams[0].id, teams[7].id, {
    fecha: '2026-11-09', hora: '10:00', cancha: 'Cancha 1'
}), /ya se enfrentaron/i);
assert(SchedulerService.crearCruceManualTodosContraTodos(tournament.id, category.id, teams[0].id, teams[7].id, {
    fecha: '2026-11-09', hora: '10:00', cancha: 'Cancha 1'
}, true).duplicate, 'La revancha manual debe requerir y aceptar confirmación explícita.');

const proposal = SchedulerService.proponerCrucesTodosContraTodos(tournament.id, category.id);
assert(proposal.length > 0);
const historicalPairs = new Set(DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id)
    .map(match => [match.equipoLocalId, match.equipoVisitanteId].sort().join(':')));
assert(proposal.every(pair => !historicalPairs.has([pair.local.id, pair.visitante.id].sort().join(':'))));
SchedulerService.crearCrucesTodosContraTodos(tournament.id, category.id, proposal);

const allCrosses = SchedulerService.getAllVsAllCrosses(tournament.id, category.id);
assert(allCrosses.some(match => teams.find(team => team.id === match.equipoLocalId).zonaId !== teams.find(team => team.id === match.equipoVisitanteId).zonaId));
allCrosses.forEach(match => DataManager.updateMatchResult(match.id, result));
SchedulerService.cerrarCrucesTodosContraTodos(tournament.id, category.id);
PlayoffsService.generarSemifinales(tournament.id, category.id);
let matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
assert.equal(matches.filter(match => match.phase === 'SEMIFINAL').length, 2);
matches.filter(match => match.phase === 'SEMIFINAL').forEach(match => DataManager.updateMatchResult(match.id, result));
PlayoffsService.generarFinales(tournament.id, category.id);
matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
assert.equal(matches.filter(match => match.phase === 'FINAL').length, 1);
matches.filter(match => ['FINAL', 'THIRD_PLACE'].includes(match.phase)).forEach(match => DataManager.updateMatchResult(match.id, result));
assert.equal(SchedulerService.getTournamentPhase(tournament.id, category.id), 'FINISHED');
const finishedFinal = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(match => match.phase === 'FINAL');
assert.equal(PosicionesService.calcularClasificacionFinal(tournament.id, category.id)[0].id, finishedFinal.ganadorId);

console.log('Todos contra todos: garantizados por zona, cruces libres, tabla, semifinales y final validados.');
