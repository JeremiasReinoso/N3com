import assert from 'node:assert/strict';
import { findTeamMatches, getVisibleMatches, normalizeTeamSearch } from '../js/views/resultsView.js';

const teams = [
    { id: 'aguilas', nombre: 'Águilas Doradas', torneoId: 'actual', categoriaId: '40m' },
    { id: 'torino', nombre: 'Torino', torneoId: 'actual', categoriaId: '40m' },
    { id: 'pumas', nombre: 'Los Pumas', torneoId: 'actual', categoriaId: '40m' },
    { id: 'aguilas-50', nombre: 'Águilas Doradas', torneoId: 'actual', categoriaId: '50m' },
    { id: 'torino-viejo', nombre: 'Torino', torneoId: 'anterior', categoriaId: '40m' }
];
const matches = [
    { id: 'm3', torneoId: 'actual', categoriaId: '40m', equipoLocalId: 'torino', equipoVisitanteId: 'pumas', fecha: '2026-09-25', hora: '10:00', cancha: 'Cancha 1' },
    { id: 'm2', torneoId: 'actual', categoriaId: '40m', equipoLocalId: 'aguilas', equipoVisitanteId: 'pumas', fecha: '2026-09-24', hora: '17:00', cancha: 'Cancha 2' },
    { id: 'm1', torneoId: 'actual', categoriaId: '40m', equipoLocalId: 'aguilas', equipoVisitanteId: 'torino', fecha: '2026-09-24', hora: '15:30', cancha: 'Cancha 1' },
    { id: 'otra-categoria', torneoId: 'actual', categoriaId: '50m', equipoLocalId: 'aguilas-50', equipoVisitanteId: 'pumas' },
    { id: 'otro-torneo', torneoId: 'anterior', categoriaId: '40m', equipoLocalId: 'torino-viejo', equipoVisitanteId: 'pumas' }
];
const search = query => findTeamMatches({ matches, teams, tournamentId: 'actual', categoryId: '40m', query });
const visible = query => getVisibleMatches({ matches, teams, tournamentId: 'actual', categoryId: '40m', query });

assert.equal(normalizeTeamSearch('  ÁGUILAS '), 'aguilas');
assert.deepEqual(search('agu').map(match => match.id), ['m1', 'm2'], 'Debe buscar parcialmente, sin distinguir acentos ni mayúsculas, y ordenar por fecha y hora.');
assert.deepEqual(search('DORADAS').map(match => match.id), ['m1', 'm2'], 'Debe encontrar otra parte del nombre.');
assert.deepEqual(search('torino').map(match => match.id), ['m1', 'm3'], 'Debe encontrar al equipo como local o visitante.');
assert.deepEqual(search('inexistente'), [], 'Una búsqueda sin coincidencias no debe devolver partidos.');
assert.deepEqual(search(''), [], 'Sin búsqueda no debe listar partidos.');
assert.strictEqual(visible(''), matches, 'Sin búsqueda debe conservar el listado completo y su orden original.');
assert.deepEqual(visible('torino').map(match => match.id), ['m1', 'm3'], 'Con búsqueda debe filtrar el listado por cualquiera de los dos equipos.');
assert.strictEqual(visible('   '), matches, 'Al borrar la búsqueda debe volver inmediatamente al listado completo.');
assert.equal(search('torino').some(match => match.id === 'otro-torneo'), false, 'No debe mezclar torneos.');
assert.equal(search('aguilas').some(match => match.id === 'otra-categoria'), false, 'No debe mezclar categorías.');

console.log('El buscador de resultados respeta nombre, posición del equipo, orden y alcance del torneo/categoría.');
