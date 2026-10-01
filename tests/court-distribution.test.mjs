import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');
const { LogisticsService } = await import('../js/services/logistics.js');
const { buildFixtureSpreadsheet } = await import('../js/services/fixturePdf.js');

const createScenario = (count, courtCount) => {
    memory.clear();
    const tournament = DataManager.createTournament('Prueba de distribución', 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '23:00', []);
    DataManager.setTournamentCourts(tournament.id, Array.from({ length: courtCount }, (_, index) => ({ id: `court_${index + 1}`, name: `Cancha ${index + 1}` })));
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 0, 30);
    const category = DataManager.createCategories(['+40 Mixto'], tournament.id)[0];
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teams = Array.from({ length: count * 2 }, (_, index) => DataManager.createTeam(`Equipo ${index + 1}`, category.id, tournament.id));
    teams.forEach(team => DataManager.assignTeamToZone(team.id, zone.id));
    DataManager.addMatches(Array.from({ length: count }, (_, index) => ({
        torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS',
        equipoLocalId: teams[index * 2].id, equipoVisitanteId: teams[index * 2 + 1].id,
        fecha: null, hora: null, cancha: null, estado: 'pendiente', confirmado: true, orden: index + 1
    })));
    return tournament;
};

const distribution = (count, courts) => {
    const tournament = createScenario(count, courts);
    const result = LogisticsService.generateSchedule(tournament.id);
    assert.equal(result.failures.length, 0, JSON.stringify(result.failures));
    return Object.values(result.validation.distribution.byCourt);
};

test('la asignación global alcanza los repartos matemáticos esperados', { timeout: 15000 }, () => {
    assert.deepEqual(distribution(20, 2).sort((a, b) => a - b), [10, 10]);
    assert.deepEqual(distribution(21, 2).sort((a, b) => a - b), [10, 11]);
    assert.deepEqual(distribution(20, 3).sort((a, b) => a - b), [6, 7, 7]);
    assert.deepEqual(distribution(31, 4).sort((a, b) => a - b), [7, 8, 8, 8]);
});

test('la hoja de cálculo tiene una fuente general y una vista por cancha', () => {
    const tournament = createScenario(4, 3);
    LogisticsService.generateSchedule(tournament.id);
    const matches = LogisticsService.getGeneralFixture(tournament.id);
    const rows = matches.map(match => ({ fecha: match.fecha, hora: match.hora, cancha: match.cancha, categoryName: '+40 Mixto', phaseLabel: 'Partidos asegurados', teamA: match.equipoLocalId, teamB: match.equipoVisitanteId, status: 'Confirmado', score: '' }));
    const workbook = buildFixtureSpreadsheet({ tournament, rows, courts: DataManager.getTournamentCourts(tournament.id) });
    assert.equal((workbook.match(/<Worksheet /g) || []).length, 4);
    assert.equal((workbook.match(/ss:Name="Fixture General"/g) || []).length, 1);
    assert.equal((workbook.match(/ss:Name="Cancha [123]"/g) || []).length, 3);
    assert((workbook.match(/<Row>/g) || []).length >= rows.length + 4, 'El libro contiene encabezado y filas del fixture general y sus vistas.');
});
