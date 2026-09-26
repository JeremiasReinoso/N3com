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
const { PosicionesService } = await import(moduleUrl('js/services/standings.js'));

const setup = (formats = null) => {
    localStorage.values.clear();
    const tournament = DataManager.createTournament('Formato de sets', 3);
    if (formats) DataManager.setTournamentSetFormats(tournament.id, formats);
    const category = DataManager.createCategory('+50 Mixto', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teams = Array.from({ length: 4 }, (_, index) => {
        const team = DataManager.createTeam(`Equipo ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    const match = (local = 0, visitante = 1, phase = 'ZONAS') => DataManager.addMatches([{
        torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id,
        tipo: phase === 'ZONAS' ? 'fase_zonas' : 'semifinal',
        equipoLocalId: teams[local].id, equipoVisitanteId: teams[visitante].id,
        fecha: null, phase
    }])[0];
    return { tournament, category, zone, teams, match };
};

const set = (puntosLocal, puntosVisitante) => ({ puntosLocal, puntosVisitante });

// Formatos: sólo existen 1 set × 21 y 2 sets × 15 (no hay 3 × 25).
{
    const options = DataManager.getSetFormatOptions();
    assert.deepEqual(options.map(item => item.key).sort(), ['one_set_21', 'two_sets_15']);
    const { tournament } = setup();
    const formats = DataManager.getTournamentSetFormats(tournament.id);
    assert.equal(formats.zones.key, 'one_set_21');
    assert.equal(formats.zones.sets, 1);
    assert.equal(formats.zones.points, 21);
    assert.equal(formats.playoffs.key, 'two_sets_15');
    assert.equal(formats.playoffs.sets, 2);
    assert.equal(formats.playoffs.points, 15);
}

// Zonas por defecto: un solo set, sin empate, y la tabla lo cuenta.
{
    const { tournament, category, match } = setup();
    const zoneMatch = match();
    assert.equal(DataManager.getSetFormatForMatch(zoneMatch).key, 'one_set_21');
    assert.equal(DataManager.isPlayoffPhase(zoneMatch), false);
    DataManager.updateMatchResult(zoneMatch.id, [set(21, 15)]);
    const scored = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(item => item.id === zoneMatch.id);
    assert.equal(scored.estado, 'finalizado');
    assert.equal(scored.score, '1-0');
    assert.equal(scored.setsLocal, 1);
    assert.equal(scored.ganadorId, scored.equipoLocalId);
    assert.throws(() => DataManager.updateMatchResult(zoneMatch.id, [set(21, 21)]), /empatado/);
    const other = match(0, 2);
    assert.throws(() => DataManager.updateMatchResult(other.id, [set(21, 15), set(21, 17)]), /juega a 1 set/);
    const table = PosicionesService.calcularPosiciones(tournament.id, category.id);
    assert.equal(table.find(row => row.id === scored.equipoLocalId).jugados, 1, 'El partido de un set debe sumar en la tabla.');
    assert.equal(table.reduce((total, row) => total + row.jugados, 0), 2, 'Los dos equipos del partido de un set deben contarlo como jugado.');
}

// Eliminatorias por defecto: dos sets de 15 y tercero de desempate.
{
    const { match } = setup();
    const playoff = match(0, 1, 'SEMIFINAL');
    assert.equal(DataManager.getSetFormatForMatch(playoff).key, 'two_sets_15');
    assert.equal(DataManager.isPlayoffPhase(playoff), true);
    assert.throws(() => DataManager.updateMatchResult(playoff.id, [set(21, 15)]), /juega a 2 sets/);
    assert.throws(() => DataManager.updateMatchResult(playoff.id, [set(15, 10), set(10, 15)]), /tercer set/);
    DataManager.updateMatchResult(playoff.id, [set(15, 10), set(15, 12)]);
    const other = match(2, 3, 'FINAL');
    DataManager.updateMatchResult(other.id, [set(15, 10), set(10, 15), set(15, 11)]);
    const third = match(0, 3, 'THIRD_PLACE');
    assert.throws(() => DataManager.updateMatchResult(third.id, [set(10, 15), set(15, 10), set(10, 15), set(15, 11)]), /juega a 2 sets/);
    assert.throws(() => DataManager.updateMatchResult(third.id, [set(15, 10), set(15, 12), set(15, 11)]), /2-0/);
}

// Un resultado finalizado se puede recargar: corrige el marcador y la tabla.
{
    const { tournament, category, match, teams } = setup();
    const zoneMatch = match();
    DataManager.updateMatchResult(zoneMatch.id, [set(21, 15)]);
    const tableBefore = PosicionesService.calcularPosiciones(tournament.id, category.id);
    assert.equal(tableBefore.find(row => row.id === teams[0].id).ganados, 1, 'El ganador inicial suma la victoria.');
    DataManager.updateMatchResult(zoneMatch.id, [set(15, 21)]);
    const reloaded = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(item => item.id === zoneMatch.id);
    assert.equal(reloaded.estado, 'finalizado');
    assert.equal(reloaded.score, '0-1');
    assert.equal(reloaded.ganadorId, teams[1].id);
    const tableAfter = PosicionesService.calcularPosiciones(tournament.id, category.id);
    assert.equal(tableAfter.find(row => row.id === teams[0].id).ganados, 0, 'La corrección quita la victoria anterior.');
    assert.equal(tableAfter.find(row => row.id === teams[1].id).ganados, 1, 'La corrección da la victoria al nuevo ganador.');
    assert.throws(() => DataManager.updateMatchResult(zoneMatch.id, [set(15, 21), set(15, 12)]), /juega a 1 set/, 'Al corregir sigue aplicando el formato de la fase.');
}

// Cambiar el formato por torneo: zonas pueden jugar dos sets y eliminatorias una.
{
    const { tournament, match } = setup({ zones: 'two_sets_15', playoffs: 'one_set_21' });
    const zoneMatch = match();
    assert.throws(() => DataManager.updateMatchResult(zoneMatch.id, [set(21, 15)]), /juega a 2 sets/);
    DataManager.updateMatchResult(zoneMatch.id, [set(15, 10), set(15, 12)]);
    const playoff = match(2, 3, 'SEMIFINAL');
    assert.throws(() => DataManager.updateMatchResult(playoff.id, [set(15, 10), set(15, 12)]), /juega a 1 set/);
    DataManager.updateMatchResult(playoff.id, [set(21, 17)]);
    assert.throws(() => DataManager.setTournamentSetFormats(tournament.id, { zones: 'three_sets_25' }), /no válido para la fase de zonas/);
    const partial = DataManager.setTournamentSetFormats(tournament.id, { playoffs: 'two_sets_15' });
    assert.equal(partial.zones.key, 'two_sets_15');
    assert.equal(partial.playoffs.key, 'two_sets_15');
    assert.throws(() => DataManager.setTournamentSetFormats('inexistente', { zones: 'one_set_21' }), /no se encontró/i);
}

// Datos heredados: torneo sin formato y partidos de tres sets siguen cargando.
{
    localStorage.values.clear();
    localStorage.setItem('newcom_data', JSON.stringify({
        tournaments: [{ id: 'legacy', nombre: 'Torneo antiguo', classificationMode: 'sets', method: 'round_robin' }],
        categories: [{ id: 'cat-legacy', torneoId: 'legacy', nombre: '+50' }],
        teams: [], zones: [], calendar: [],
        matches: [{
            id: 'm-legacy', torneoId: 'legacy', categoriaId: 'cat-legacy',
            equipoLocalId: 'local', equipoVisitanteId: 'visitante',
            phase: 'ZONAS', tipo: 'fase_zonas', estado: 'finalizado', confirmado: true,
            sets: [set(25, 20), set(20, 25), set(15, 11)],
            setsLocal: 2, setsVisitante: 1, score: '2-1', ganadorId: 'local'
        }]
    }));
    const formats = DataManager.getTournamentSetFormats('legacy');
    assert.equal(formats.zones.key, 'one_set_21', 'El torneo antiguo hereda el formato por defecto.');
    const matches = DataManager.getMatchesByTournamentAndCategory('legacy', 'cat-legacy');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].sets.length, 3, 'Los tres sets heredados deben conservarse.');
    assert.equal(matches[0].ganadorId, 'local');
    assert.equal(matches[0].estado, 'finalizado');
}

console.log('Formatos de sets: 1×21 en zonas, 2×15 en eliminatorias, cambio por torneo y datos heredados validados.');
