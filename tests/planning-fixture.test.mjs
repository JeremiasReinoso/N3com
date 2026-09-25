import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');
const { SchedulerService } = await import('../js/services/scheduler.js');
const { filterFixtureMatches } = await import('../js/views/scheduleView.js');

test('la planificación es independiente, compatible y nunca duplica ni elimina partidos', () => {
    const tournament = DataManager.createTournament('Planificación real', 1);
    const [mixed, women, men] = DataManager.createCategories(['+50 Mixto', '+60 Femenino', '+40 Masculino'], tournament.id);
    assert.equal(DataManager.getCategoryPlanning(tournament.id, mixed.id), null, 'Una categoría existente no debe recibir una planificación inventada.');

    DataManager.setTournamentCalendar(tournament.id, '2026-10-09', '2026-10-10', '09:00', '20:00', []);
    DataManager.setCategoryPlanning(tournament.id, mixed.id, [
        { date: '2026-10-09', stages: ['ZONAS', 'GARANTIZADOS'] },
        { date: '2026-10-10', stages: ['SEMIFINAL', 'FINAL'] }
    ]);
    DataManager.setCategoryPlanning(tournament.id, women.id, [
        { date: '2026-10-09', stages: ['ZONAS'] },
        { date: '2026-10-10', stages: ['ALL_VS_ALL', 'SEMIFINAL', 'FINAL'] }
    ]);
    DataManager.setCategoryPlanning(tournament.id, men.id, [
        { date: '2026-10-09', stages: ['ZONAS', 'ALL_VS_ALL'] },
        { date: '2026-10-10', stages: ['ALL_VS_ALL', 'SEMIFINAL', 'FINAL'] }
    ]);
    assert.notDeepEqual(DataManager.getCategoryPlanning(tournament.id, mixed.id).days, DataManager.getCategoryPlanning(tournament.id, women.id).days);

    const zone = DataManager.createZone('Zona A', mixed.id, tournament.id);
    const teams = ['Águilas', 'Torino', 'Los Andes', 'Patagonia'].map(name => {
        const team = DataManager.createTeam(name, mixed.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    assert.equal(SchedulerService.generarEmparejamientos(tournament.id, mixed.id, { date: '2026-10-09' }), 2);
    SchedulerService.confirmarEmparejamientos(tournament.id, mixed.id);
    SchedulerService.programarEmparejamientos(tournament.id, mixed.id);
    const before = DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id);
    assert(before.every(match => match.fecha === '2026-10-09'));
    const ids = before.map(match => match.id).sort();

    DataManager.setCategoryPlanning(tournament.id, mixed.id, [
        { date: '2026-10-09', stages: ['ZONAS', 'ALL_VS_ALL'] },
        { date: '2026-10-10', stages: ['SEMIFINAL', 'FINAL'] }
    ]);
    assert.deepEqual(DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id).map(match => match.id).sort(), ids, 'Cambiar la planificación no debe borrar ni recrear partidos.');

    const first = DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id)[0];
    DataManager.updateMatches([{ ...first, hora: '15:00', cancha: 'Cancha 1' }]);
    const sameMatch = DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id).find(match => match.id === first.id);
    assert.equal(sameMatch.hora, '15:00');
    assert.equal(sameMatch.cancha, 'Cancha 1');

    const [manual] = DataManager.createManualMatch({ torneoId: tournament.id, categoriaId: mixed.id, zonaId: null, phase: 'SEMIFINAL', nombreEtapa: 'Semifinal manual', equipoLocalId: teams[0].id, equipoVisitanteId: teams[1].id, fecha: '2026-10-10', hora: '17:00', cancha: 'Cancha 2' });
    assert(DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id).some(match => match.id === manual.id && match.confirmado), 'Un partido manual debe usar la misma colección visible para Fixture y Resultados.');
    const [final] = DataManager.addMatches([{ torneoId: tournament.id, categoriaId: mixed.id, zonaId: null, phase: 'FINAL', nombreEtapa: 'Final', equipoLocalId: teams[2].id, equipoVisitanteId: teams[3].id, fecha: null, hora: null, cancha: null, estado: 'pendiente', confirmado: true }]);
    SchedulerService.programarFase(tournament.id, mixed.id, 'FINAL');
    assert.equal(DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id).find(match => match.id === final.id).fecha, '2026-10-10', 'La final debe programarse en la jornada elegida, no necesariamente por ser el último día.');

    const filtered = filterFixtureMatches(DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id), {
        date: '2026-10-09', categoryId: mixed.id, phase: 'ZONAS', zoneId: zone.id, court: 'Cancha 1'
    });
    assert.deepEqual(filtered.map(match => match.id), [first.id], 'Los cinco filtros del fixture deben combinarse.');

    assert.throws(() => DataManager.setTournamentCalendar(tournament.id, '2026-10-10', '2026-10-10', '09:00', '20:00', [], { allowUsedDateRemoval: false }), error => error.code === 'CALENDAR_DATE_IN_USE' && error.usage[0].categoryNames.includes('+50 Mixto'));
    assert(ids.every(id => DataManager.getMatchesByTournamentAndCategory(tournament.id, mixed.id).some(match => match.id === id)), 'La advertencia de calendario no debe tocar partidos.');

    const otherZone = DataManager.createZone('Zona B', mixed.id, tournament.id);
    const outsider = DataManager.createTeam('Equipo Zona B', mixed.id, tournament.id);
    DataManager.assignTeamToZone(outsider.id, otherZone.id);
    assert.throws(() => DataManager.createManualMatch({ torneoId: tournament.id, categoriaId: mixed.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: outsider.id, fecha: '2026-10-09', hora: '18:00', cancha: 'Cancha 1' }), /zonas diferentes/);

    const foreign = DataManager.createTeam('Equipo de otra categoría', women.id, tournament.id);
    assert.throws(() => DataManager.createManualMatch({ torneoId: tournament.id, categoriaId: mixed.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: foreign.id, fecha: '2026-10-09', hora: '18:00', cancha: 'Cancha 1' }), /categoría del partido/);
});
