import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');
const { LogisticsService, fixtureCompare } = await import('../js/services/logistics.js');
const { filterFixtureMatches, PHASE_LABELS } = await import('../js/views/scheduleView.js');
const { fixtureRows, buildFixturePdf } = await import('../js/services/fixturePdf.js');
const { PosicionesService } = await import('../js/services/standings.js');

test('fixture general: cuatro categorías comparten dos canchas, bloques y descanso', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Regional de Newcom', 1);
    DataManager.setTournamentSetFormats(tournament.id, { zones: 'two_sets_15' });
    DataManager.setTournamentCalendar(tournament.id, '2026-10-09', '2026-10-10', '08:00', '11:00', []);
    DataManager.setTournamentCourts(tournament.id, [{ id: 'principal', name: 'Cancha 1' }, { id: 'auxiliar', name: 'Cancha 2' }]);
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 0, 30);
    const categories = DataManager.createCategories(['+40 Femenino', '+50 Masculino', '+60 Mixto', '+68 Femenino'], tournament.id);
    categories.forEach(category => DataManager.setCategoryPlanning(tournament.id, category.id, [
        { date: '2026-10-09', stages: ['ZONAS'] },
        { date: '2026-10-10', stages: ['SEMIFINAL', 'FINAL'] }
    ]));
    const oldest = categories.at(-1);
    DataManager.setCategoryRestBlocks(tournament.id, oldest.id, 1);

    const fixtures = [];
    const categoryTeams = new Map();
    categories.forEach((category, categoryIndex) => {
        const zone = DataManager.createZone('Zona A', category.id, tournament.id);
        const teams = ['A', 'B', 'C'].map(letter => {
            const team = DataManager.createTeam(`${category.nombre} ${letter}`, category.id, tournament.id);
            DataManager.assignTeamToZone(team.id, zone.id);
            return team;
        });
        categoryTeams.set(category.id, teams);
        fixtures.push({ torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[1].id, fecha: null, hora: null, cancha: null, estado: 'pendiente', confirmado: true, orden: categoryIndex + 1 });
        if (category.id === oldest.id) fixtures.push({ torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[2].id, fecha: null, hora: null, cancha: null, estado: 'pendiente', confirmado: true, orden: 9 });
    });
    const created = DataManager.addMatches(fixtures);
    const result = LogisticsService.programTournament(tournament.id);
    assert.equal(result.scheduled, 5);
    assert.deepEqual(result.failures, []);
    const scheduled = LogisticsService.getTournamentMatches(tournament.id).sort(fixtureCompare);

    assert.equal(DataManager.getTournamentCourts(tournament.id).length, 2);
    assert.deepEqual(LogisticsService.generateTimeBlocks(tournament.id, DataManager.getDaySchedules(tournament.id)[0]).slice(0, 4), ['08:00', '08:30', '09:00', '09:30']);
    assert(scheduled.some((match, index) => scheduled.slice(index + 1).some(other => match.fecha === other.fecha && match.hora === other.hora && match.cancha !== other.cancha)), 'Deben coexistir partidos en canchas distintas.');
    assert(categories.every(category => scheduled.some(match => match.categoriaId === category.id)), 'Todas las categorías deben reutilizar las mismas canchas globales.');
    const oldestMatches = scheduled.filter(match => match.categoriaId === oldest.id);
    const time = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    assert(Math.abs(time(oldestMatches[1].hora) - time(oldestMatches[0].hora)) >= 60, 'El equipo +68 debe descansar un bloque completo.');
    assert.equal(LogisticsService.getConflicts(tournament.id).length, 0);

    const first = scheduled[0];
    const simultaneous = scheduled.find(match => match.id !== first.id && match.fecha === first.fecha && match.hora === first.hora);
    assert(simultaneous);
    assert.throws(() => DataManager.updateMatches([{ ...simultaneous, courtId: first.courtId, cancha: first.cancha }]), /ocupada.*cancha y horario/i);

    const oldestFirst = oldestMatches[0];
    const oldestSecond = oldestMatches[1];
    assert.throws(() => DataManager.updateMatches([{ ...oldestSecond, hora: `${String(Math.floor((time(oldestFirst.hora) + 30) / 60)).padStart(2, '0')}:${String((time(oldestFirst.hora) + 30) % 60).padStart(2, '0')}` }]), /descanso mínimo/i);
    const originalId = oldestSecond.id;
    const safeHour = '10:30';
    DataManager.updateMatches([{ ...oldestSecond, fecha: '2026-10-09', hora: safeHour, courtId: 'auxiliar', cancha: 'Cancha 2' }]);
    assert.equal(DataManager.getMatchesByTournamentAndCategory(tournament.id, oldest.id).find(match => match.id === originalId).hora, safeHour, 'Reprogramar debe conservar el ID del partido.');

    const byCategory = filterFixtureMatches(scheduled, { categoryId: oldest.id });
    const byCourt = filterFixtureMatches(scheduled, { court: 'principal' });
    const byDay = filterFixtureMatches(scheduled, { date: '2026-10-09' });
    assert.equal(byCategory.length, 2);
    assert(byCourt.every(match => match.courtId === 'principal'));
    assert(byDay.every(match => match.fecha === '2026-10-09'));

    const teams = categories.flatMap(category => DataManager.getTeamsByTournamentAndCategory(tournament.id, category.id));
    const zones = categories.flatMap(category => DataManager.getZonesByTournamentAndCategory(tournament.id, category.id));
    const rows = fixtureRows({ matches: LogisticsService.getTournamentMatches(tournament.id), categories: categories.map(category => ({ ...category, edad: category.nombre.split(' ')[0], modalidad: category.nombre.split(' ')[1] })), teams, zones, phaseLabels: PHASE_LABELS });
    const dayRows = fixtureRows({ matches: LogisticsService.getTournamentMatches(tournament.id), categories, teams, zones, phaseLabels: PHASE_LABELS, filters: { date: '2026-10-09' } });
    assert.equal(rows.length, scheduled.length);
    assert(dayRows.every(row => row.fecha === '2026-10-09'));
    const pdf = buildFixturePdf(tournament, rows);
    assert.equal(new TextDecoder('latin1').decode(pdf.slice(0, 8)), '%PDF-1.4');
    assert(new TextDecoder('latin1').decode(pdf).includes('FIXTURE GENERAL DEL TORNEO'));

    const scored = DataManager.getMatchesByTournamentAndCategory(tournament.id, categories[0].id)[0];
    DataManager.updateMatchResult(scored.id, [{ puntosLocal: 21, puntosVisitante: 15 }, { puntosLocal: 21, puntosVisitante: 17 }]);
    assert.equal(DataManager.getMatchesByTournamentAndCategory(tournament.id, categories[0].id).find(match => match.id === scored.id).score, '2-0');
    assert.equal(PosicionesService.calcularPosiciones(tournament.id, categories[0].id).reduce((sum, row) => sum + row.jugados, 0), 2);
    assert.throws(() => DataManager.setTournamentCourts(tournament.id, [{ id: 'principal', name: 'Central' }]), /siendo utilizada/);
    assert.equal(created.length, LogisticsService.getTournamentMatches(tournament.id).length, 'La programación y el PDF no deben duplicar partidos.');
});

test('un torneo antiguo se abre sin alterar partidos ni duración histórica', () => {
    memory.clear();
    localStorage.setItem('newcom_data', JSON.stringify({
        tournaments: [{ id: 'legacy', nombre: 'Existente', partidos_asegurados: 1, cantidadCanchas: 2, duracionPartido: 60, intervaloPartidos: 0 }],
        categories: [{ id: 'legacy-category', nombre: '+50 Mixto', torneoId: 'legacy' }],
        teams: [], zones: [], calendar: [],
        matches: [{ id: 'legacy-match', torneoId: 'legacy', categoriaId: 'legacy-category', equipoLocalId: 'a', equipoVisitanteId: 'b', fecha: null, hora: null, cancha: null, estado: 'pendiente' }]
    }));
    assert.deepEqual(DataManager.getTournamentCourts('legacy').map(court => court.name), ['Cancha 1', 'Cancha 2']);
    assert.equal(DataManager.getTournamentSchedulingSettings('legacy').blockDuration, 60);
    assert.equal(DataManager.getMatchesByTournamentAndCategory('legacy', 'legacy-category')[0].id, 'legacy-match');
});
