import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');

const seedTournament = name => {
    const tournament = DataManager.createTournament(name, 3);
    DataManager.setTournamentCalendar(tournament.id, '2026-11-02', '2026-11-03', '08:00', '12:00', []);
    const categories = DataManager.createCategories([`${name} +40`, `${name} +50`], tournament.id);
    const teams = [];
    const zones = [];
    categories.forEach(category => {
        const zone = DataManager.createZone('Zona A', category.id, tournament.id);
        zones.push(zone);
        ['A', 'B', 'C'].forEach(letter => {
            const team = DataManager.createTeam(`${category.nombre} Equipo ${letter}`, category.id, tournament.id);
            DataManager.assignTeamToZone(team.id, zone.id);
            teams.push(team);
        });
    });
    DataManager.addMatches([{
        torneoId: tournament.id,
        categoriaId: categories[0].id,
        zonaId: zones[0].id,
        phase: 'ZONAS',
        equipoLocalId: teams[0].id,
        equipoVisitanteId: teams[1].id,
        fecha: '2026-11-02',
        hora: '08:00',
        courtId: 'court_1',
        cancha: 'Cancha 1',
        orden: 1,
        estado: 'programado',
        confirmado: true
    }]);
    return { tournament, categories, teams, zones };
};

const snapshot = () => JSON.parse(memory.get('newcom_data'));

const prueba = seedTournament('Prueba');
const real = seedTournament('Real');

const removed = DataManager.removeTournament(prueba.tournament.id);
const data = snapshot();

assert.equal(removed.nombre, 'Prueba', 'Debe devolver el torneo borrado.');
assert.deepEqual(DataManager.getTournaments().map(item => item.nombre), ['Real'], 'Sólo debe quedar el otro torneo.');
assert.equal(DataManager.getTournament(prueba.tournament.id), null, 'El torneo borrado ya no existe.');
assert.equal(data.categories.filter(category => category.torneoId === prueba.tournament.id).length, 0, 'No deben quedar categorías del torneo borrado.');
assert.equal(data.teams.filter(team => team.torneoId === prueba.tournament.id).length, 0, 'No deben quedar equipos del torneo borrado.');
assert.equal(data.zones.filter(zone => zone.torneoId === prueba.tournament.id).length, 0, 'No deben quedar zonas del torneo borrado.');
assert.equal(data.matches.filter(match => match.torneoId === prueba.tournament.id).length, 0, 'No deben quedar partidos del torneo borrado.');
assert.equal(data.calendar.filter(entry => entry.torneoId === prueba.tournament.id).length, 0, 'No debe quedar calendario del torneo borrado.');
assert.equal(data.teams.filter(team => prueba.categories.some(category => category.id === team.categoriaId)).length, 0, 'Los equipos huérfanos de sus categorías también se borran.');

assert.equal(DataManager.getCategoriesByTournament(real.tournament.id).length, 2, 'Las categorías del otro torneo se conservan.');
assert.equal(DataManager.getTeamsByTournamentAndCategory(real.tournament.id, real.categories[0].id).length, 3, 'Los equipos del otro torneo se conservan.');
assert.equal(DataManager.getCalendarDates(real.tournament.id).length, 2, 'El calendario del otro torneo se conserva.');
assert.equal(data.matches.filter(match => match.torneoId === real.tournament.id).length, 1, 'Los partidos del otro torneo se conservan.');

assert.throws(() => DataManager.removeTournament('torneo_inexistente'), /No se encontró el torneo seleccionado/, 'Un id inexistente debe explicarse.');

console.log('Borrar un torneo elimina todos sus datos sin tocar los demás.');
