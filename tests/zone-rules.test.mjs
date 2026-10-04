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

const build = (name, teamCount, guaranteed, zoneOptions = null) => {
    localStorage.values.clear();
    const tournament = DataManager.createTournament(name, guaranteed);
    const category = DataManager.createCategory('Categoría', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id, zoneOptions || {});
    const teams = Array.from({ length: teamCount }, (_, index) => {
        const team = DataManager.createTeam(`${name} ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    return { tournament, category, zone, teams };
};
const perTeam = (setup, teams) => teams.map(team => SchedulerService.getMatchesCountForTeam(setup.tournament.id, setup.category.id, team.id));

// Una zona normal juega exactamente los partidos asegurados y nunca más.
{
    const setup = build('exacta', 6, 3);
    assert.equal(setup.zone.todosContraTodos, false, 'Por defecto la zona no es todos contra todos.');
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const validation = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(validation.valid, true);
    assert.deepEqual(perTeam(setup, setup.teams), [3, 3, 3, 3, 3, 3]);
    assert.equal(validation.avisos.length, 0);
    assert.equal(DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id).length, 9);
}

// Si los asegurados no entran completos, se juega menos y se avisa sin bloquear.
{
    const setup = build('sin-abasto', 3, 1);
    const created = SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    assert.equal(created, 1, 'Sólo entra un cruce sin repetir.');
    const validation = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(validation.valid, true, 'La zona corta no bloquea la validación.');
    assert(validation.avisos.some(aviso => /Zona A/.test(aviso) && /no ofrece más cruces/.test(aviso)), `Faltó el aviso de zona corta: ${validation.avisos.join(' | ')}`);
    assert(perTeam(setup, setup.teams).every(count => count <= 1), 'Nadie supera los partidos asegurados.');
    const beforeFinish = SchedulerService.estadoFaseClasificatoria(setup.tournament.id, setup.category.id);
    assert.equal(beforeFinish.ok, false, 'Los partidos todavía no están finalizados.');
    assert.equal(beforeFinish.avisos.length, 1);
    SchedulerService.confirmarEmparejamientos(setup.tournament.id, setup.category.id);
    DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id)
        .forEach(match => DataManager.updateMatchResult(match.id, [{ puntosLocal: 21, puntosVisitante: 15 }]));
    const afterFinish = SchedulerService.estadoFaseClasificatoria(setup.tournament.id, setup.category.id);
    assert.equal(afterFinish.ok, true, 'La fase se completa aunque la zona no alcance para todos.');
    assert(afterFinish.pendientes.length === 0, 'El equipo sin rival no queda pendiente para siempre.');
}

// Más asegurados que cruces posibles: la zona se juega completa y avisa.
{
    const setup = build('tope', 4, 8);
    SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    const validation = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(validation.valid, true);
    assert.deepEqual(perTeam(setup, setup.teams), [3, 3, 3, 3]);
    assert(validation.avisos.some(aviso => /Zona A/.test(aviso) && /sólo se pueden jugar 3 partidos/.test(aviso)));
}

// Una zona de todos contra todos ignora los asegurados y se juega completa.
{
    const setup = build('todos-contra-todos', 6, 2, { todosContraTodos: true });
    assert.equal(setup.zone.todosContraTodos, true);
    const created = SchedulerService.generarEmparejamientos(setup.tournament.id, setup.category.id);
    assert.equal(created, 15, 'Seis equipos generan los 15 cruces posibles.');
    assert.deepEqual(perTeam(setup, setup.teams), [5, 5, 5, 5, 5, 5]);
    const validation = SchedulerService.validateGuaranteedMatches(setup.tournament.id, setup.category.id);
    assert.equal(validation.valid, true);
    assert(validation.avisos.some(aviso => /todos contra todos/.test(aviso) && /5 partidos/.test(aviso)));

    // Terminada la zona, la fase queda completa y la tabla refleja los 5 partidos.
    SchedulerService.confirmarEmparejamientos(setup.tournament.id, setup.category.id);
    DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id)
        .forEach(match => DataManager.updateMatchResult(match.id, [{ puntosLocal: 21, puntosVisitante: 15 }]));
    const estado = SchedulerService.estadoFaseClasificatoria(setup.tournament.id, setup.category.id);
    assert.equal(estado.ok, true, 'La zona todos contra todos se completa sin quedar pendientes.');
    const table = PosicionesService.calcularPosiciones(setup.tournament.id, setup.category.id);
    assert.equal(table.length, 6, 'La tabla incluye a los seis equipos.');
    assert(table.every(row => row.jugados === 5), `Cada equipo debe haber jugado 5 partidos: ${table.map(row => row.jugados).join(', ')}`);
    assert.equal(table.reduce((total, row) => total + row.puntosClasificacion, 0), 60, 'Los 15 partidos reparten 4 puntos cada uno (3 y 1).');
    assert.equal(table.reduce((total, row) => total + row.ganados, 0), 15, 'Cada partido tiene un ganador.');
}

// El modo de la zona se puede cambiar después y se conserva al releer.
{
    const setup = build('cambiar-modo', 4, 2);
    DataManager.setZoneRoundRobin(setup.zone.id, true);
    const stored = DataManager.getZonesByTournamentAndCategory(setup.tournament.id, setup.category.id).find(zone => zone.id === setup.zone.id);
    assert.equal(stored.todosContraTodos, true);
    DataManager.setZoneRoundRobin(setup.zone.id, false);
    assert.equal(DataManager.getZonesByTournamentAndCategory(setup.tournament.id, setup.category.id).find(zone => zone.id === setup.zone.id).todosContraTodos, false);
    assert.throws(() => DataManager.setZoneRoundRobin('inexistente', true), /No se encontró la zona/);
    const raw = JSON.parse(localStorage.getItem('newcom_data'));
    delete raw.zones[0].todosContraTodos;
    localStorage.setItem('newcom_data', JSON.stringify(raw));
    assert.equal(DataManager.getZonesByTournamentAndCategory(setup.tournament.id, setup.category.id)[0].todosContraTodos, false, 'Las zonas heredadas se leen como zona normal.');
}

console.log('Reglas de zona: asegurados exactos, zona sin abasto avisada y todos contra todos completa.');
