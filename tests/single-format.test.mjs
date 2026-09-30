import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); }
};

const { DataManager } = await import('../js/data/dataManager.js');
const { PosicionesService } = await import('../js/services/standings.js');
const { PlayoffsService } = await import('../js/services/playoffs.js');
const { LogisticsService } = await import('../js/services/logistics.js');
const { fixtureRows, buildFixturePdf } = await import('../js/services/fixturePdf.js');

test('formato único: sets reales, tabla global y Top 16', () => {
    const tournament = DataManager.createTournament('Prueba por sets reales', 1);
    const category = DataManager.createCategory('+50 Femenino', tournament.id);
    const zones = [
        DataManager.createZone('Zona A', category.id, tournament.id),
        DataManager.createZone('Zona B', category.id, tournament.id)
    ];
    const teams = Array.from({ length: 16 }, (_, index) => {
        const team = DataManager.createTeam(`Equipo ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zones[index < 8 ? 0 : 1].id);
        return team;
    });
    DataManager.setTournamentCalendar(tournament.id, '2026-10-09', '2026-10-11', '08:00', '20:00', []);
    DataManager.setTournamentCourtCount(tournament.id, 2);
    const matches = [];
    for (let zone = 0; zone < 2; zone += 1) {
        for (let offset = 0; offset < 8; offset += 2) {
            matches.push({
                torneoId: tournament.id, categoriaId: category.id, zonaId: zones[zone].id, phase: 'ZONAS',
                equipoLocalId: teams[zone * 8 + offset].id, equipoVisitanteId: teams[zone * 8 + offset + 1].id,
                confirmado: true, estado: 'pendiente'
            });
        }
    }
    const created = DataManager.addMatches(matches);
    LogisticsService.generateSchedule(tournament.id);
    DataManager.updateMatchResult(created[0].id, [
        { puntosLocal: 15, puntosVisitante: 12 }, { puntosLocal: 15, puntosVisitante: 5 }
    ]);
    DataManager.updateMatchResult(created[1].id, [
        { puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 12, puntosVisitante: 15 }, { puntosLocal: 15, puntosVisitante: 13 }
    ]);
    for (const match of created.slice(2)) DataManager.updateMatchResult(match.id, [
        { puntosLocal: 15, puntosVisitante: 8 }, { puntosLocal: 15, puntosVisitante: 9 }
    ]);

    const stored = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    assert.equal(stored[0].score, '2-0');
    assert.deepEqual(stored[0].sets, [{ puntosLocal: 15, puntosVisitante: 12 }, { puntosLocal: 15, puntosVisitante: 5 }]);
    assert.equal(stored[1].score, '2-1');
    const first = stored.find(match => match.id === created[0].id);
    assert.deepEqual([first.puntosFavor, first.puntosContra, first.diferenciaPuntos], [30, 17, 13]);

    const table = PosicionesService.calcularPosiciones(tournament.id, category.id);
    assert.equal(table.length, 16);
    assert.equal(table.find(team => team.id === teams[0].id).puntosFavor, 30);
    assert.equal(table.find(team => team.id === teams[0].id).puntosContra, 17);
    assert.equal(table.find(team => team.id === teams[0].id).diferenciaPuntos, 13);

    const top16 = PlayoffsService.generarTop16(tournament.id, category.id);
    assert.equal(top16.length, 8);
    assert.deepEqual(top16.map(match => [
        table.findIndex(row => row.id === match.equipoLocalId) + 1,
        table.findIndex(row => row.id === match.equipoVisitanteId) + 1
    ]), [[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]]);

    const rows = fixtureRows({ matches: stored, categories: [category], teams, zones, phaseLabels: { ZONAS: 'Fase de zonas', TOP_16: 'Top 16' } });
    assert.equal(rows.find(row => row.id === created[0].id).sets[0].puntosLocal, 15);
    const pdf = new TextDecoder().decode(buildFixturePdf(tournament, rows));
    assert.match(pdf, /15-12/);
    assert.match(pdf, /15-5/);
});
