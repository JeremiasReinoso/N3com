import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };

const { DataManager } = await import('../js/data/dataManager.js');
const { SchedulerService } = await import('../js/services/scheduler.js');
const { SpecialCrossService } = await import('../js/services/specialCrosses.js');
const { PosicionesService } = await import('../js/services/standings.js');
const { LogisticsService } = await import('../js/services/logistics.js');

const setup = (categoryName = '+50 Mixto') => {
    memory.clear();
    const tournament = DataManager.createTournament('Cruces especiales', 4);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '18:00', []);
    const category = DataManager.createCategory(categoryName, tournament.id);
    const zones = ['C', 'D'].map(name => DataManager.createZone(name, category.id, tournament.id));
    const teams = zones.flatMap(zone => ['1', '2'].map(suffix => {
        const team = DataManager.createTeam(`${zone.nombre}${suffix}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    }));
    return { tournament, category, zones, teams };
};

const addRegularMatches = ({ tournament, category, zones, teams }) => {
    teams = DataManager.getTeamsByTournamentAndCategory(tournament.id, category.id);
    const matches = [];
    zones.forEach(zone => {
        const zoneTeams = teams.filter(team => team.zonaId === zone.id);
        // Tres partidos por equipo: el cuarto garantizado queda disponible.
        [[0, 1], [0, 1], [0, 1]].forEach(([local, visitante], index) => matches.push({
            torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, tipo: 'fase_zonas', phase: 'ZONAS',
            equipoLocalId: zoneTeams[local].id, equipoVisitanteId: zoneTeams[visitante].id,
            revancha: index > 0, estado: 'pendiente', confirmado: true
        }));
    });
    // Para este test de candidatos alcanzan conteos controlados y pares de
    // revancha explícitos, iguales a los que ya admite el modelo legado.
    DataManager.addMatches(matches);
};

test('la excepción queda aislada por nombre exacto de categoría', () => {
    const normal = setup('+50 Femenino');
    assert.equal(SpecialCrossService.getCandidates(normal.tournament.id, normal.category.id), null);
});

test('detecta faltantes C/D, crea manualmente y evita repetir el cruce', () => {
    const state = setup();
    addRegularMatches(state);
    const candidates = SpecialCrossService.getCandidates(state.tournament.id, state.category.id);
    assert.equal(candidates.available, true);
    assert.equal(candidates.zones[0].candidates.length, 2);
    assert.equal(candidates.zones[1].candidates.length, 2);

    const created = SpecialCrossService.create(state.tournament.id, state.category.id, state.teams[0].id, state.teams[2].id);
    assert.equal(created.tipo, 'cruce_especial');
    assert.equal(SchedulerService.getMatchesCountForTeam(state.tournament.id, state.category.id, state.teams[0].id), 4);
    assert.equal(SchedulerService.getMatchesCountForTeam(state.tournament.id, state.category.id, state.teams[2].id), 4);
    assert.throws(() => SpecialCrossService.create(state.tournament.id, state.category.id, state.teams[0].id, state.teams[2].id), /ya tienen un enfrentamiento/i);
    assert.throws(() => SpecialCrossService.create(state.tournament.id, state.category.id, state.teams[0].id, state.teams[1].id), /Zona C y Zona D/i);
    assert.throws(() => SpecialCrossService.create(state.tournament.id, state.category.id, state.teams[0].id, state.teams[3].id), /alcanzó la cantidad/i);

    DataManager.updateMatches([{ ...created, estado: 'pendiente', confirmado: true }]);
    const schedule = LogisticsService.generateSchedule(state.tournament.id);
    assert.equal(schedule.failures.length, 0);
    assert(LogisticsService.getTournamentMatches(state.tournament.id).find(match => match.id === created.id)?.cancha);
    const standings = PosicionesService.calcularPosiciones(state.tournament.id, state.category.id);
    assert.equal(standings.length, 4);
});
