import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };

const { DataManager } = await import('../js/data/dataManager.js');
const { SchedulerService } = await import('../js/services/scheduler.js');
const { PlayoffsService } = await import('../js/services/playoffs.js');
const { PosicionesService } = await import('../js/services/standings.js');
const { LogisticsService } = await import('../js/services/logistics.js');
const { fixtureRows, buildFixturePdf } = await import('../js/services/fixturePdf.js');

const finish = match => DataManager.updateMatchResult(match.id, [
    { puntosLocal: 15, puntosVisitante: 12 },
    { puntosLocal: 15, puntosVisitante: 5 }
]);

test('flujo integral N3com: zonas, programación, Top 16, llave y exportaciones', () => {
    memory.clear();
    const tournament = DataManager.createTournament('N3com integral', 1);
    DataManager.setTournamentSetFormats(tournament.id, { zones: 'two_sets_15', playoffs: 'two_sets_15' });
    DataManager.setTournamentCalendar(tournament.id, '2026-10-09', '2026-10-11', '08:00', '12:00', [
        { fecha: '2026-10-09', inicio: '08:00', fin: '12:00' },
        { fecha: '2026-10-10', inicio: '08:00', fin: '12:00' },
        { fecha: '2026-10-11', inicio: '08:00', fin: '12:00' }
    ]);
    DataManager.setTournamentCourts(tournament.id, [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }]);
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 5, 35);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    DataManager.setCategoryPlanning(tournament.id, category.id, [
        { date: '2026-10-09', stages: ['ZONAS', 'GARANTIZADOS'] },
        { date: '2026-10-10', stages: ['TOP_16', 'TOP_8'] },
        { date: '2026-10-11', stages: ['SEMIFINAL', 'FINAL'] }
    ]);
    const zone = DataManager.createZone('Zona 1', category.id, tournament.id);
    const teams = Array.from({ length: 16 }, (_, index) => {
        const team = DataManager.createTeam(`Equipo ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });

    assert.equal(SchedulerService.generarEmparejamientos(tournament.id, category.id, { date: '2026-10-09' }), 8);
    SchedulerService.confirmarEmparejamientos(tournament.id, category.id);
    SchedulerService.programarEmparejamientos(tournament.id, category.id);
    let matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    assert.equal(matches.length, 8);
    assert(matches.every(match => match.fecha === '2026-10-09' && match.hora && match.courtId));
    matches.forEach(finish);

    const table = PosicionesService.calcularPosiciones(tournament.id, category.id);
    assert.equal(table.length, 16);
    const top16 = PlayoffsService.generarTop16(tournament.id, category.id);
    assert.equal(top16.length, 8);
    assert(top16.every(match => match.phase === 'TOP_16' && match.fecha === '2026-10-10' && match.courtId));
    top16.forEach(finish);

    const top8 = PlayoffsService.generarTop8(tournament.id, category.id);
    assert.equal(top8.length, 4);
    assert(top8.every(match => match.phase === 'TOP_8' && match.fecha === '2026-10-10' && match.sourceMatchIds.length === 2));
    top8.forEach(finish);
    const semis = PlayoffsService.generarTop4(tournament.id, category.id);
    assert.equal(semis.length, 2);
    assert(semis.every(match => match.phase === 'SEMIFINAL' && match.fecha === '2026-10-11'));
    semis.forEach(finish);
    const [final] = PlayoffsService.generarFinal(tournament.id, category.id);
    assert.equal(final.phase, 'FINAL');
    assert.equal(final.fecha, '2026-10-11');
    finish(final);

    matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    assert.equal(matches.filter(match => match.phase === 'TOP_16').length, 8);
    assert.equal(matches.filter(match => match.phase === 'TOP_8').length, 4);
    const scheduled = matches.filter(match => match.fecha && match.hora && match.courtId);
    assert.equal(scheduled.length, matches.length);
    assert.equal(LogisticsService.getConflicts(tournament.id).length, 0);
    scheduled.forEach((match, index) => scheduled.slice(index + 1).forEach(other => {
        if (match.fecha !== other.fecha || match.hora !== other.hora) return;
        assert.notEqual(match.courtId, other.courtId);
        assert(![match.equipoLocalId, match.equipoVisitanteId].some(id => [other.equipoLocalId, other.equipoVisitanteId].includes(id)));
    }));

    const rows = fixtureRows({
        matches,
        categories: [{ ...category, edad: '+40', modalidad: 'Mixto' }],
        teams,
        zones: [zone],
        phaseLabels: { ZONAS: 'Partidos asegurados', TOP_16: 'Top 16', TOP_8: 'Top 8', SEMIFINAL: 'Semifinales', FINAL: 'Final' }
    });
    assert(rows.every(row => row.fecha && row.hora && row.cancha));
    const pdf = new TextDecoder('latin1').decode(buildFixturePdf(tournament, rows));
    assert(!pdf.includes('--:--'));
    assert(!pdf.includes('Sin cancha'));
});
