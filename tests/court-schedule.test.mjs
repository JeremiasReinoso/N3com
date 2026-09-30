import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };

const { DataManager } = await import('../js/data/dataManager.js');
const { buildFixturePdf, fixtureRows } = await import('../js/services/fixturePdf.js');

test('la programación por cancha es una relación única y migrable', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Fixture por cancha', 1);
    DataManager.setTournamentCourts(tournament.id, [{ id: 'c1', name: 'Cancha 1' }, { id: 'c2', name: 'Cancha 2' }]);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-03', '2026-10-03', '08:00', '12:00', []);
    const category = DataManager.createCategory('+50 Femenino', tournament.id);
    const zone = DataManager.createZone('Zona 1', category.id, tournament.id);
    const teams = ['A', 'B', 'C', 'D'].map(name => DataManager.createTeam(name, category.id, tournament.id));
    teams.forEach(team => DataManager.assignTeamToZone(team.id, zone.id));
    const [first, second] = DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[1].id, fecha: '2026-10-03', hora: '08:00', courtId: 'c1', cancha: 'Cancha 1', estado: 'programado', confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[2].id, equipoVisitanteId: teams[3].id, fecha: '2026-10-03', hora: '08:00', courtId: 'c2', cancha: 'Cancha 2', estado: 'programado', confirmado: true }
    ]);
    assert.equal(DataManager.getScheduleByCourt(tournament.id, 'c1').length, 1);
    assert.equal(DataManager.getScheduleByCourt(tournament.id, 'c2')[0].match.id, second.id);
    assert.equal(DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).length, 2);
    DataManager.updateMatches([{ ...first, courtId: 'c2', cancha: 'Cancha 2', hora: '09:00' }]);
    assert.equal(DataManager.getScheduleByCourt(tournament.id, 'c1').length, 0);
    assert.equal(DataManager.getScheduleByCourt(tournament.id, 'c2').length, 2);
    assert.equal(DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).length, 2);
    assert.equal(DataManager.validateTournamentSchedule(tournament.id).valid, true);
    DataManager.updateMatches([{ ...first, courtId: 'c1', cancha: 'Cancha 1', hora: '09:00' }]);
    const rows = fixtureRows({ matches: DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id), categories: [category], teams, zones: [zone], phaseLabels: { ZONAS: 'Zonas' } });
    const pdf = new TextDecoder('latin1').decode(buildFixturePdf(tournament, rows));
    assert.equal((pdf.match(/\/Type \/Page /g) || []).length, 2, 'el PDF separa las canchas en páginas independientes');
});

test('los torneos legacy se migran a schedules sin perder el partido', () => {
    memory.clear();
    localStorage.setItem('newcom_data', JSON.stringify({
        tournaments: [{ id: 'legacy', nombre: 'Legacy', partidos_asegurados: 1, cantidadCanchas: 2 }],
        categories: [{ id: 'cat', nombre: '+50', torneoId: 'legacy' }], teams: [], zones: [], calendar: [], schedules: [],
        matches: [{ id: 'match', torneoId: 'legacy', categoriaId: 'cat', equipoLocalId: null, equipoVisitanteId: null, fecha: '2026-10-03', hora: '08:00', cancha: 'Cancha 1', estado: 'pendiente', confirmado: true }]
    }));
    const schedule = DataManager.getScheduleByCourt('legacy', 'court_1');
    assert.equal(schedule.length, 1);
    assert.equal(schedule[0].matchId, 'match');
    assert.equal(DataManager.getMatchesByTournamentAndCategory('legacy', 'cat').length, 1);
});
