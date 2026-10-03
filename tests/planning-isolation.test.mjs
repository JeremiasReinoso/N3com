import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');
const { LogisticsService } = await import('../js/services/logistics.js');
const { fixtureRows, buildFixtureSpreadsheet } = await import('../js/services/fixturePdf.js');

const categoryIds = matches => [...new Set(matches.map(match => match.categoriaId))];
const rowsFor = (tournament, matches, categories) => fixtureRows({
    matches,
    categories,
    teams: [],
    zones: [],
    phaseLabels: { TOP_16: 'Top 16' }
});

test('cada planificación aísla categorías, horarios, canchas y exportaciones', () => {
    const tournament = DataManager.createTournament('Aislamiento de planificaciones', 1);
    const [plus40, plus50, plus60] = DataManager.createCategories(['+40', '+50', '+60'], tournament.id);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-10', '2026-10-11', '08:00', '12:00', []);
    const teamsByCategory = new Map([plus40, plus50, plus60].map(category => [category.id, [
        DataManager.createTeam(`${category.nombre} A`, category.id, tournament.id),
        DataManager.createTeam(`${category.nombre} B`, category.id, tournament.id)
    ]]));
    const addMatch = categoriaId => DataManager.addMatches([{
        torneoId: tournament.id, categoriaId, phase: 'TOP_16', tipo: 'top_16',
        equipoLocalId: teamsByCategory.get(categoriaId)[0].id, equipoVisitanteId: teamsByCategory.get(categoriaId)[1].id, fecha: null, hora: null,
        cancha: null, courtId: null, estado: 'pendiente', confirmado: true
    }])[0];
    const match40 = addMatch(plus40.id);
    const match50 = addMatch(plus50.id);
    const match60 = addMatch(plus60.id);
    const categories = DataManager.getCategoriesByTournament(tournament.id);

    const planningA = DataManager.setTournamentPlanning(tournament.id, {
        selectedCategories: [plus60.id],
        categoryDates: { [plus60.id]: ['2026-10-10'] }
    });
    assert.deepEqual(categoryIds(planningA.matches), [plus60.id]);
    LogisticsService.generateSchedule(tournament.id, planningA.id);
    assert.equal(DataManager.getPlanningMatches(tournament.id, planningA.id).length, 1);

    const planningB = DataManager.setTournamentPlanning(tournament.id, {
        selectedCategories: [plus50.id, plus40.id],
        categoryDates: {
            [plus50.id]: ['2026-10-10'],
            [plus40.id]: ['2026-10-11']
        }
    });
    assert.deepEqual(categoryIds(planningB.matches).sort(), [plus40.id, plus50.id].sort());
    assert(!planningB.matches.some(match => match.id === match60.id));
    LogisticsService.generateSchedule(tournament.id, planningB.id);
    assert.deepEqual(categoryIds(LogisticsService.getGeneralFixture(tournament.id, { planningId: planningB.id })).sort(), [plus40.id, plus50.id].sort());
    assert.equal(DataManager.getMatchesByTournamentAndCategory(tournament.id, plus60.id).find(match => match.id === match60.id).fecha, '2026-10-10');

    const rowsB = rowsFor(tournament, LogisticsService.getGeneralFixture(tournament.id, { planningId: planningB.id }), categories);
    assert.deepEqual([...new Set(rowsB.map(row => row.categoryName))].sort(), ['+40', '+50']);
    assert.equal(rowsB.some(row => row.categoryName === '+60'), false);
    const spreadsheetB = buildFixtureSpreadsheet({ tournament, rows: rowsB, courts: DataManager.getTournamentCourts(tournament.id) });
    assert.match(spreadsheetB, /\+40/);
    assert.match(spreadsheetB, /\+50/);
    assert.doesNotMatch(spreadsheetB, /\+60/);

    const planningC = DataManager.setTournamentPlanning(tournament.id, {
        selectedCategories: [plus60.id],
        categoryDates: { [plus60.id]: ['2026-10-10'] }
    });
    assert.deepEqual(categoryIds(planningC.matches), [plus60.id]);
    assert.deepEqual(categoryIds(LogisticsService.getGeneralFixture(tournament.id, { planningId: planningC.id })), [plus60.id]);

    const planningD = DataManager.setTournamentPlanning(tournament.id, {
        selectedCategories: [plus40.id, plus50.id, plus60.id],
        categoryDates: {
            [plus40.id]: ['2026-10-10'],
            [plus50.id]: ['2026-10-10'],
            [plus60.id]: ['2026-10-10']
        }
    });
    assert.deepEqual(categoryIds(planningD.matches).sort(), [plus40.id, plus50.id, plus60.id].sort());
    assert.deepEqual(DataManager.getActivePlanning(tournament.id).selectedCategories.sort(), [plus40.id, plus50.id, plus60.id].sort());
});

test('categorías seleccionadas que comparten día conviven en el fixture de la misma planificación', () => {
    const tournament = DataManager.createTournament('Categorías por día', 1);
    const [plus50, plus60] = DataManager.createCategories(['+50', '+60'], tournament.id);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-10', '2026-10-11', '08:00', '10:00', []);
    const addMatch = categoriaId => DataManager.addMatches([{
        torneoId: tournament.id, categoriaId, phase: 'TOP_16', equipoLocalId: null, equipoVisitanteId: null,
        fecha: null, hora: null, cancha: null, estado: 'pendiente', confirmado: true
    }])[0];
    addMatch(plus50.id); addMatch(plus60.id);
    const planning = DataManager.setTournamentPlanning(tournament.id, {
        selectedCategories: [plus50.id, plus60.id],
        categoryDates: { [plus50.id]: ['2026-10-10'], [plus60.id]: ['2026-10-10'] }
    });
    assert.deepEqual(categoryIds(planning.matches).sort(), [plus50.id, plus60.id].sort());
    assert.deepEqual([...new Set(planning.matches.map(match => planning.categoryDates[match.categoriaId][0]))], ['2026-10-10']);
});
