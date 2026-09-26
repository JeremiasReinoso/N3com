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
const { PlayoffsService } = await import(moduleUrl('js/services/playoffs.js'));

const buildZone = (name, teamCount, guaranteed, zonesCount = 1) => {
    const tournament = DataManager.createTournament(name, guaranteed);
    const category = DataManager.createCategory('Categoría', tournament.id);
    const zones = Array.from({ length: zonesCount }, (_, index) => DataManager.createZone(`Zona ${index + 1}`, category.id, tournament.id));
    const teams = Array.from({ length: teamCount }, (_, index) => {
        const team = DataManager.createTeam(`${name} ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zones[index % zones.length].id);
        return team;
    });
    return { tournament, category, zones, teams };
};
const counts = (tournament, category, teams) => new Map(teams.map(team => [team.id, SchedulerService.getMatchesCountForTeam(tournament.id, category.id, team.id)]));

for (const [teamCount, guaranteed] of [[4, 3], [6, 3], [6, 5]]) {
    const setup = buildZone(`${teamCount}-${guaranteed}`, teamCount, guaranteed);
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const result = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(result.valid, true, `${teamCount}/${guaranteed} debe ser válido`);
    assert.deepEqual([...counts(setup.tournament, setup.category, setup.teams).values()], Array(teamCount).fill(guaranteed));
}

{
    // Con más asegurados que cruces posibles la zona se juega completa y
    // avisa: nunca se repiten enfrentamientos ni se bloquea el torneo.
    const setup = buildZone('imposible', 3, 3);
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const result = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(result.valid, true);
    assert.deepEqual([...counts(setup.tournament, setup.category, setup.teams).values()], [2, 2, 2]);
    assert(result.avisos.some(aviso => /Zona 1/.test(aviso) && /2 partidos por equipo/.test(aviso)), 'Debe avisar el tope de la zona.');
}

{
    // 3 equipos con 1 partido asegurado: 3×1 no es par, así que se juega lo
    // posible y el equipo sin rival queda informado como aviso.
    const setup = buildZone('paridad', 3, 1);
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const result = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(result.valid, true, 'Una zona corta no debe bloquear la validación.');
    assert.equal(DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id).length, 1);
    assert([...counts(setup.tournament, setup.category, setup.teams).values()].every(count => count <= 1), 'Nadie puede superar los partidos asegurados.');
    assert(result.avisos.some(aviso => /Zona 1/.test(aviso)), 'La zona sin más cruces debe quedar en los avisos.');
    assert.equal(SchedulerService.estadoFaseClasificatoria(setup.tournament.id, setup.category.id).ok, false, 'Los partidos siguen pendientes de finalizar.');
}

{
    const setup = buildZone('dos-zonas', 8, 2, 2);
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const teamsById = new Map(setup.teams.map(team => [team.id, team]));
    const matches = DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id);
    assert(matches.every(match => teamsById.get(match.equipoLocalId).zonaId === teamsById.get(match.equipoVisitanteId).zonaId));
}

{
    const setup = buildZone('duplicado', 2, 1);
    const [a, b] = setup.teams;
    DataManager.addMatches([{ torneoId: setup.tournament.id, categoriaId: setup.category.id, zonaId: setup.zones[0].id, tipo: 'fase_zonas', equipoLocalId: a.id, equipoVisitanteId: b.id }]);
    assert.throws(() => DataManager.addMatches([{ torneoId: setup.tournament.id, categoriaId: setup.category.id, zonaId: setup.zones[0].id, tipo: 'fase_zonas', equipoLocalId: b.id, equipoVisitanteId: a.id }]), /repetir/i);
}

{
    const setup = buildZone('eliminar', 4, 3);
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const removed = DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id)[0];
    DataManager.removeMatch(removed.id);
    const result = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(result.valid, false);
    assert.equal(result.incompleteTeams.length, 2);
    assert(result.incompleteTeams.every(team => team.matches === 2 && team.required === 3));
    assert.throws(() => PlayoffsService.generarSemifinales(setup.tournament.id, setup.category.id), /Faltan partidos asegurados/i);
}

{
    const setup = buildZone('edición', 4, 1);
    DataManager.setTournamentCalendar(setup.tournament.id, '2026-10-01', '2026-10-01', '09:00', '18:00', []);
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const original = DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id)[0];
    DataManager.updateMatches([{ ...original, fecha: '2026-10-01', hora: '10:00', cancha: 'Cancha 1', orden: 4 }]);
    const matches = DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id);
    const edited = matches.find(match => match.id === original.id);
    assert.equal(matches.length, 2);
    assert.deepEqual({ fecha: edited.fecha, hora: edited.hora, cancha: edited.cancha, orden: edited.orden }, { fecha: '2026-10-01', hora: '10:00', cancha: 'Cancha 1', orden: 4 });
    const other = matches.find(match => match.id !== original.id);
    assert.throws(() => DataManager.updateMatches([{ ...other, fecha: '2026-10-01', hora: '10:00', cancha: 'Cancha 1' }]), /cancha y horario/i);
}

console.log('Los partidos garantizados se validan por equipo, zona, cruce único, eliminación, eliminatorias y edición manual.');
