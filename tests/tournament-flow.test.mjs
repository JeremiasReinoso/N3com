import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };

const { DataManager } = await import('../js/data/dataManager.js');
const { SchedulerService } = await import('../js/services/scheduler.js');
const { PlayoffsService } = await import('../js/services/playoffs.js');
const { PosicionesService } = await import('../js/services/standings.js');

const result = match => DataManager.updateMatchResult(match.id, [
    { puntosLocal: 15, puntosVisitante: 12 },
    { puntosLocal: 15, puntosVisitante: 5 }
]);

const setup = () => {
    const tournament = DataManager.createTournament('Flujo eliminatorio', 1);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    const zone = DataManager.createZone('Zona única', category.id, tournament.id);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-09', '2026-10-11', '08:00', '20:00', []);
    DataManager.setTournamentCourts(tournament.id, [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }]);
    const teams = Array.from({ length: 16 }, (_, index) => {
        const team = DataManager.createTeam(`Equipo ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    return { tournament, category, zone, teams };
};

const finishStage = (tournamentId, categoryId, phase) => DataManager
    .getMatchesByTournamentAndCategory(tournamentId, categoryId)
    .filter(match => match.phase === phase)
    .forEach(result);

memory.clear();
const { tournament, category, teams } = setup();
assert.equal(SchedulerService.generarEmparejamientos(tournament.id, category.id), 8);
SchedulerService.confirmarEmparejamientos(tournament.id, category.id);
SchedulerService.programarEmparejamientos(tournament.id, category.id);
finishStage(tournament.id, category.id, 'ZONAS');

const table = PosicionesService.calcularPosiciones(tournament.id, category.id);
assert.equal(table.length, 16);
const rankingIds = table.map(row => row.id);
const top16 = PlayoffsService.generarTop16(tournament.id, category.id);
assert.deepEqual(top16.map(match => [rankingIds.indexOf(match.equipoLocalId) + 1, rankingIds.indexOf(match.equipoVisitanteId) + 1]), [
    [1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]
]);
assert.deepEqual(top16.map(match => [match.seedLocal, match.seedVisitante]), [[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]]);
assert.strictEqual(PlayoffsService.generarTop16(tournament.id, category.id).length, 8);

finishStage(tournament.id, category.id, 'TOP_16');
const top8 = PlayoffsService.generarTop8(tournament.id, category.id);
assert.equal(top8.length, 4);
assert(top8.every(match => match.sourceMatchIds.length === 2));
finishStage(tournament.id, category.id, 'TOP_8');
const semifinals = PlayoffsService.generarTop4(tournament.id, category.id);
assert.equal(semifinals.length, 2);
assert(semifinals.every(match => match.phase === 'SEMIFINAL'));
finishStage(tournament.id, category.id, 'SEMIFINAL');
const [final] = PlayoffsService.generarFinal(tournament.id, category.id);
assert.equal(final.phase, 'FINAL');
result(final);
assert.equal(DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).filter(match => match.phase === 'FINAL').length, 1);

console.log('Flujo completo validado: asegurados → clasificación → Top 16 → Top 8 → Top 4 → semifinales → final.');
