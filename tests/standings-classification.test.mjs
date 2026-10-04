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

const set = (puntosLocal, puntosVisitante) => ({ puntosLocal, puntosVisitante });

// Escenario fijo: cinco partidos de zona con resultados 2-0 y 2-1.
const buildTable = classificationMode => {
    localStorage.values.clear();
    const tournament = DataManager.createTournament('Clasificación', 3, classificationMode);
    DataManager.setTournamentSetFormats(tournament.id, { zones: 'two_sets_15' });
    const category = DataManager.createCategory('+50', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teams = {};
    ['A', 'B', 'C', 'D'].forEach(letter => {
        const team = DataManager.createTeam(`Equipo ${letter}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        teams[letter] = team;
    });
    const play = (local, visitante, sets) => {
        const match = DataManager.addMatches([{
            torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id,
            tipo: 'fase_zonas', equipoLocalId: teams[local].id, equipoVisitanteId: teams[visitante].id, fecha: null
        }])[0];
        DataManager.updateMatchResult(match.id, sets);
    };
    play('A', 'B', [set(15, 12), set(14, 15), set(15, 13)]); // A gana 2-1
    play('A', 'C', [set(15, 14), set(13, 15), set(15, 14)]); // A gana 2-1
    play('C', 'B', [set(15, 9), set(15, 11)]);                // C gana 2-0
    play('B', 'D', [set(15, 10), set(15, 12)]);                // B gana 2-0
    play('D', 'C', [set(15, 9), set(15, 11)]);                 // D gana 2-0
    const rows = PosicionesService.calcularPosiciones(tournament.id, category.id);
    return { rows, teams };
};

// Los puntos 3/2/1 se calculan en los dos modos y ordenan la tabla.
for (const mode of ['sets', 'points']) {
    const { rows, teams } = buildTable(mode);
    const pointsByTeam = Object.fromEntries(rows.map(row => [row.id, row.puntosClasificacion]));
    assert.equal(pointsByTeam[teams.A.id], 4, `${mode}: A ganó 2-1 y 2-1 = 2 + 2.`);
    assert.equal(pointsByTeam[teams.B.id], 5, `${mode}: B perdió 2-1, perdió 2-0 y ganó 2-0 = 1 + 1 + 3.`);
    assert.equal(pointsByTeam[teams.C.id], 5, `${mode}: C perdió 2-1, ganó 2-0 y perdió 2-0 = 1 + 3 + 1.`);
    assert.equal(pointsByTeam[teams.D.id], 4, `${mode}: D perdió 2-0 y ganó 2-0 = 1 + 3.`);
    assert.equal(rows.reduce((total, row) => total + row.puntosClasificacion, 0), 18, `${mode}: 2+1 por los dos 2-1 y 3+1 por los tres 2-0.`);
    for (let index = 0; index < rows.length - 1; index += 1) {
        const current = rows[index];
        const next = rows[index + 1];
        assert(current.puntosClasificacion >= next.puntosClasificacion, `${mode}: los puntos de clasificación deben ordenar de mayor a menor.`);
        if (current.puntosClasificacion === next.puntosClasificacion) {
            const criterion = mode === 'points' ? 'diferenciaPuntos' : 'diferenciaSets';
            assert(current[criterion] >= next[criterion], `${mode}: con puntos iguales desempata la ${criterion}.`);
        }
    }
    // A ganó más partidos que B y C, pero quedó atrás por los puntos 3/2/1.
    const position = id => rows.findIndex(row => row.id === id);
    assert(position(teams.A.id) > position(teams.B.id), `${mode}: B (5 puntos) debe quedar sobre A (4 puntos).`);
    assert(position(teams.A.id) > position(teams.C.id), `${mode}: C (5 puntos) debe quedar sobre A (4 puntos).`);
    assert.equal(rows[0].puntosClasificacion, 5, `${mode}: la primera fila tiene los 5 puntos máximos.`);
}

console.log('Clasificación: puntos 3/2/1 en ambos modos, criterio sólo como desempate.');
