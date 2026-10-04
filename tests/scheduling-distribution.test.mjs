import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, String(value)); }
};

const moduleUrl = path => pathToFileURL(resolve(root, path)).href;
const { DataManager } = await import(moduleUrl('js/data/dataManager.js'));
const { SchedulerService } = await import(moduleUrl('js/services/scheduler.js'));
const { LogisticsService } = await import(moduleUrl('js/services/logistics.js'));

const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

const build = ({ categories, teamCount = 4, guaranteed = 1, courts = null, duration = 60, interval = 30 }) => {
    localStorage.values.clear();
    const tournament = DataManager.createTournament('Programación repartida', guaranteed);
    DataManager.setTournamentCalendar(tournament.id, '2026-12-04', '2026-12-04', '09:00', '18:00', []);
    DataManager.setTournamentCourts(tournament.id, courts || [{ id: 'c1', name: 'Cancha 1' }, { id: 'c2', name: 'Cancha 2' }]);
    DataManager.setTournamentSchedulingSettings(tournament.id, duration, interval, duration);
    const created = categories.map(nombre => {
        const category = DataManager.createCategory(nombre, tournament.id);
        const zone = DataManager.createZone('Zona A', category.id, tournament.id);
        'ABCDEF'.slice(0, teamCount).split('').forEach(letter => {
            const team = DataManager.createTeam(`${nombre} ${letter}`, category.id, tournament.id);
            DataManager.assignTeamToZone(team.id, zone.id);
        });
        return category;
    });
    return { tournament, categories: created };
};

const pairAndProgram = setup => {
    setup.categories.forEach(category => {
        SchedulerService.generarEmparejamientos(setup.tournament.id, category.id);
        SchedulerService.confirmarEmparejamientos(setup.tournament.id, category.id);
    });
    const result = LogisticsService.programTournament(setup.tournament.id);
    assert.equal(result.failures.length, 0, JSON.stringify(result.failures, null, 1));
    return LogisticsService.getTournamentMatches(setup.tournament.id).filter(match => match.fecha && match.hora && match.cancha);
};

// Dos categorías que juegan el mismo día y comparten canchas se mezclan:
// en cada horario se juega un partido de una y un partido de la otra.
{
    const setup = build({ categories: ['+60 Femenino', '+68 Femenino'] });
    const scheduled = pairAndProgram(setup);
    assert.equal(scheduled.length, 4, 'Cada categoría genera dos partidos.');
    const byHora = Map.groupBy(scheduled, match => match.hora);
    [...byHora.entries()].forEach(([hora, list]) => {
        const cats = new Set(list.map(match => match.categoriaId));
        assert.equal(cats.size, 2, `A las ${hora} deben jugar las dos categorías juntas, no una tras otra.`);
    });
    assert(byHora.has('09:00'), 'El día debe arrancar a las 09:00.');
    assert.equal(LogisticsService.getConflicts(setup.tournament.id).length, 0, 'La distribución no debe generar conflictos.');
    [...byHora.values()].forEach(list => assert.equal(list.length, 2, 'En cada horario se usan las dos canchas.'));
}

// La cadencia en la misma cancha es el intervalo, sin bajar de la duración
// del bloque: 30/30 arranca cada 30 minutos; si el intervalo es mayor
// (30/60), manda el intervalo.
{
    const setup = build({ categories: ['+60 Femenino'], teamCount: 6, courts: [{ id: 'c1', name: 'Cancha 1' }], duration: 30, interval: 30 });
    const scheduled = pairAndProgram(setup);
    assert.equal(scheduled.length, 3, 'Seis equipos con un partido asegurado generan tres cruces.');
    const horas = scheduled.map(match => match.hora).sort();
    assert.deepEqual(horas, ['09:00', '09:30', '10:00'], `Con bloque 30 / intervalo 30 los partidos arrancan cada 30 minutos.`);
    for (let index = 1; index < horas.length; index += 1) {
        assert(minutes(horas[index]) - minutes(horas[index - 1]) >= 30, 'La distancia entre partidos de la misma cancha debe respetar la cadencia del intervalo.');
    }
    assert.equal(LogisticsService.getConflicts(setup.tournament.id).length, 0);
    const blocks = LogisticsService.generateTimeBlocks(setup.tournament.id, { fecha: '2026-12-04', inicio: '09:00', fin: '18:00' });
    assert.deepEqual(blocks.slice(0, 4), ['09:00', '09:30', '10:00', '10:30'], 'Los bloques disponibles también siguen la cadencia.');

    const wider = build({ categories: ['+60 Femenino'], teamCount: 6, courts: [{ id: 'c1', name: 'Cancha 1' }], duration: 30, interval: 60 });
    const widerScheduled = pairAndProgram(wider);
    const widerHoras = widerScheduled.map(match => match.hora).sort();
    assert.deepEqual(widerHoras, ['09:00', '10:00', '11:00'], 'Con intervalo de 60 minutos la cadencia es de 60, mayor que el bloque de 30.');
    assert.equal(LogisticsService.getConflicts(wider.tournament.id).length, 0);
}

// Guardar a mano: la cadencia de 30 minutos define la grilla de horarios y
// las reglas de cancha siguen bloqueando los arranques solapados.
{
    const setup = build({ categories: ['+60 Femenino'], courts: [{ id: 'c1', name: 'Cancha 1' }], duration: 30, interval: 30 });
    const [category] = setup.categories;
    const zone = DataManager.getZonesByTournamentAndCategory(setup.tournament.id, category.id)[0];
    const teams = DataManager.getTeamsByTournamentAndCategory(setup.tournament.id, category.id);
    const match = (local, visitante, hora) => ({
        torneoId: setup.tournament.id, categoriaId: category.id, zonaId: zone.id,
        phase: 'ZONAS', equipoLocalId: local.id, equipoVisitanteId: visitante.id,
        fecha: '2026-12-04', hora, courtId: 'c1', cancha: 'Cancha 1', orden: 1,
        estado: 'programado', confirmado: true
    });
    DataManager.addMatches([match(teams[0], teams[1], '09:00')]);
    assert.throws(() => DataManager.addMatches([match(teams[2], teams[3], '09:15')]), /bloque válido/, 'Con cadencia de 30 minutos las 09:15 no es un inicio válido.');
    assert.throws(() => DataManager.addMatches([match(teams[2], teams[3], '09:00')]), /ocupada/, 'La misma cancha a la misma hora sigue bloqueada.');
    DataManager.addMatches([match(teams[2], teams[3], '09:30')]);
    assert.equal(LogisticsService.getConflicts(setup.tournament.id).length, 0, 'Los partidos de 09:00 y 09:30 conviven en la misma cancha.');
    const far = DataManager.addMatches([match(teams[0], teams[2], '10:00')])[0];
    assert.equal(far.hora, '10:00');
    assert.equal(LogisticsService.getConflicts(setup.tournament.id).length, 0, 'El partido de las 10:00 entra sin conflictos.');

    // Un intervalo mayor que el bloque agranda la grilla: 09:30 deja de ser válido.
    const wider = build({ categories: ['+60 Femenino'], courts: [{ id: 'c1', name: 'Cancha 1' }], duration: 30, interval: 60 });
    const [widerCategory] = wider.categories;
    const widerZone = DataManager.getZonesByTournamentAndCategory(wider.tournament.id, widerCategory.id)[0];
    const widerTeams = DataManager.getTeamsByTournamentAndCategory(wider.tournament.id, widerCategory.id);
    const widerMatch = (local, visitante, hora) => ({
        torneoId: wider.tournament.id, categoriaId: widerCategory.id, zonaId: widerZone.id,
        phase: 'ZONAS', equipoLocalId: local.id, equipoVisitanteId: visitante.id,
        fecha: '2026-12-04', hora, courtId: 'c1', cancha: 'Cancha 1', orden: 1,
        estado: 'programado', confirmado: true
    });
    DataManager.addMatches([widerMatch(widerTeams[0], widerTeams[1], '09:00')]);
    assert.throws(() => DataManager.addMatches([widerMatch(widerTeams[2], widerTeams[3], '09:30')]), /bloque válido/, 'Con intervalo de 60 minutos las 09:30 no es un inicio válido.');
    DataManager.addMatches([widerMatch(widerTeams[2], widerTeams[3], '10:00')]);
    assert.equal(LogisticsService.getConflicts(wider.tournament.id).length, 0, 'Los arranques de 09:00 y 10:00 respetan la cadencia de 60.');
}

// Limpiar la programación deja los partidos pendientes sin día, hora ni
// cancha, conserva los finalizados y permite programar de nuevo.
{
    const setup = build({ categories: ['+60 Femenino', '+68 Femenino'] });
    const scheduled = pairAndProgram(setup);
    assert.equal(scheduled.length, 4);
    const played = scheduled[0];
    DataManager.updateMatchResult(played.id, [{ puntosLocal: 21, puntosVisitante: 15 }]);
    const cleared = DataManager.clearTournamentSchedule(setup.tournament.id);
    assert.equal(cleared, 3, 'Sólo los tres partidos sin jugar se desprograman.');
    const matches = LogisticsService.getTournamentMatches(setup.tournament.id);
    const done = matches.find(match => match.id === played.id);
    assert(done.fecha && done.hora && done.cancha, 'El partido finalizado conserva día, hora y cancha.');
    assert.equal(done.estado, 'finalizado');
    assert.equal(done.score, '1-0', 'El resultado se conserva.');
    matches.filter(match => match.id !== played.id).forEach(match => {
        assert.equal(match.fecha, null, 'Sin día tras limpiar.');
        assert.equal(match.hora, null, 'Sin hora tras limpiar.');
        assert.equal(match.cancha, null, 'Sin cancha tras limpiar.');
    });
    const pendingIssues = LogisticsService.getConflicts(setup.tournament.id);
    assert.equal(pendingIssues.length, 3, 'El panel avisa que los tres partidos quedaron sin día.');
    assert(pendingIssues.every(issue => issue.type === 'no-date'), 'Los avisos son sólo de partidos sin programar.');
    const again = LogisticsService.programTournament(setup.tournament.id);
    assert.equal(again.failures.length, 0, JSON.stringify(again.failures));
    assert.equal(again.scheduled, 3, 'Los tres partidos pendientes se programan de nuevo.');
    assert.equal(LogisticsService.getConflicts(setup.tournament.id).length, 0, 'Reprogramados, no quedan conflictos.');
}

// Partidos guardados con cadencia de 30 minutos se detectan como conflicto
// al subir el intervalo a 60 minutos.
{
    const setup = build({ categories: ['+60 Femenino'], courts: [{ id: 'c1', name: 'Cancha 1' }], duration: 30, interval: 0 });
    const [category] = setup.categories;
    const zone = DataManager.getZonesByTournamentAndCategory(setup.tournament.id, category.id)[0];
    const teams = DataManager.getTeamsByTournamentAndCategory(setup.tournament.id, category.id);
    const match = (local, visitante, hora) => ({
        torneoId: setup.tournament.id, categoriaId: category.id, zonaId: zone.id,
        phase: 'ZONAS', equipoLocalId: local.id, equipoVisitanteId: visitante.id,
        fecha: '2026-12-04', hora, courtId: 'c1', cancha: 'Cancha 1', orden: 1,
        estado: 'programado', confirmado: true
    });
    DataManager.addMatches([match(teams[0], teams[1], '09:00'), match(teams[2], teams[3], '09:30')]);
    assert.equal(LogisticsService.getConflicts(setup.tournament.id).length, 0, 'Sin intervalo, la cadencia es la duración del bloque: 09:00 y 09:30 son válidos.');
    DataManager.setTournamentSchedulingSettings(setup.tournament.id, 30, 60, 30);
    const conflicts = LogisticsService.getConflicts(setup.tournament.id);
    assert.equal(conflicts.length, 1, 'Al pasar a 60 minutos de intervalo, los partidos de 09:00 y 09:30 quedan en conflicto.');
    assert.equal(conflicts[0].type, 'court');
}

console.log('Programación: categorías mezcladas en el mismo día y cadencia (intervalo) respetada entre partidos.');
