import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };

const { DataManager } = await import('../js/data/dataManager.js');
const { LogisticsService } = await import('../js/services/logistics.js');

const buildTournament = (count, end = '20:00') => {
    const tournament = DataManager.createTournament(`Logística ${count}`, 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-09', '2026-10-10', '08:00', end, [
        { fecha: '2026-10-09', inicio: '08:00', fin: end },
        { fecha: '2026-10-10', inicio: '08:00', fin: end }
    ]);
    DataManager.setTournamentCourts(tournament.id, [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }]);
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 35, 30);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    const zone = DataManager.createZone('Zona única', category.id, tournament.id);
    const teams = Array.from({ length: count * 2 }, (_, index) => {
        const team = DataManager.createTeam(`Equipo ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    DataManager.addMatches(Array.from({ length: count }, (_, index) => ({
        torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', tipo: 'fase_zonas',
        equipoLocalId: teams[index * 2].id, equipoVisitanteId: teams[index * 2 + 1].id,
        estado: 'pendiente', confirmado: true
    })));
    return tournament;
};

const assertGlobalFixture = (tournament, expectedCounts) => {
    const result = LogisticsService.generateSchedule(tournament.id);
    assert.equal(result.validation.valid, true);
    const matches = LogisticsService.getTournamentMatches(tournament.id);
    assert(matches.every(match => match.fecha && match.hora && match.courtId));
    assert.deepEqual(result.validation.distribution.byCourt, expectedCounts);
    const slots = new Set(LogisticsService.generateTimeSlots(tournament.id).map(slot => `${slot.fecha}|${slot.hora}`));
    matches.forEach(match => assert(slots.has(`${match.fecha}|${match.hora}`)));
    matches.forEach((match, index) => matches.slice(index + 1).forEach(other => {
        if (match.fecha !== other.fecha || match.hora !== other.hora) return;
        assert.notEqual(match.courtId, other.courtId);
    }));
};

test('dos canchas y 20 partidos se distribuyen 10/10 en paralelo', () => {
    memory.clear();
    const tournament = buildTournament(20);
    assertGlobalFixture(tournament, { court_1: 10, court_2: 10 });
});

test('dos canchas y 21 partidos se distribuyen 10/11', () => {
    memory.clear();
    const tournament = buildTournament(21);
    assertGlobalFixture(tournament, { court_1: 11, court_2: 10 });
});

test('la agenda usa exclusivamente fechas y horarios configurados', () => {
    memory.clear();
    const tournament = buildTournament(8, '09:10');
    const result = LogisticsService.generateSchedule(tournament.id);
    assert(result.validation.valid);
    const allowedDates = new Set(DataManager.getCalendarDates(tournament.id));
    const allowedSlots = new Set(LogisticsService.generateTimeSlots(tournament.id).map(slot => `${slot.fecha}|${slot.hora}`));
    LogisticsService.getTournamentMatches(tournament.id).forEach(match => {
        assert(allowedDates.has(match.fecha));
        assert(allowedSlots.has(`${match.fecha}|${match.hora}`));
        assert(Number(match.hora.slice(0, 2)) * 60 + Number(match.hora.slice(3)) + 35 <= 550);
    });
});

test('un único calendario global programa varias categorías sin mezclar sus equipos', () => {
    memory.clear();
    const tournament = buildTournament(4);
    const secondCategory = DataManager.createCategory('+60 Femenino', tournament.id);
    const secondZone = DataManager.createZone('Zona segunda categoría', secondCategory.id, tournament.id);
    const teams = Array.from({ length: 8 }, (_, index) => {
        const team = DataManager.createTeam(`Segunda ${index + 1}`, secondCategory.id, tournament.id);
        DataManager.assignTeamToZone(team.id, secondZone.id);
        return team;
    });
    DataManager.addMatches(Array.from({ length: 4 }, (_, index) => ({
        torneoId: tournament.id, categoriaId: secondCategory.id, zonaId: secondZone.id, phase: 'ZONAS', tipo: 'fase_zonas',
        equipoLocalId: teams[index * 2].id, equipoVisitanteId: teams[index * 2 + 1].id, estado: 'pendiente', confirmado: true
    })));
    const result = LogisticsService.generateSchedule(tournament.id);
    assert(result.validation.valid);
    const matches = LogisticsService.getTournamentMatches(tournament.id);
    assert.equal(matches.length, 8);
    assert.equal(new Set(matches.map(match => match.categoriaId)).size, 2);
    assert(matches.every(match => match.fecha && match.hora && match.courtId));
});
