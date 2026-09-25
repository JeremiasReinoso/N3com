import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');
const { LogisticsService, fixtureCompare } = await import('../js/services/logistics.js');
const { filterFixtureMatches, PHASE_LABELS } = await import('../js/views/scheduleView.js');
const { fixtureRows, buildFixturePdf } = await import('../js/services/fixturePdf.js');

const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const decode = bytes => new TextDecoder('latin1').decode(bytes);

// Verifica que la tabla de referencias del PDF apunte realmente a cada objeto.
const assertPdfStructure = pdf => {
    const start = Number(pdf.slice(pdf.lastIndexOf('startxref') + 9, pdf.indexOf('%%EOF')).trim());
    assert.equal(pdf.slice(start, start + 4), 'xref', 'El PDF debe tener su tabla de referencias.');
    const entries = pdf.slice(start).split('trailer')[0].split('\n').slice(2).filter(line => /^\d{10} \d{5} n/.test(line));
    assert(entries.length > 0, 'El PDF debe declarar al menos un objeto.');
    entries.forEach((entry, index) => {
        const offset = Number(entry.slice(0, 10));
        const expected = `${index + 1} 0 obj`;
        assert.equal(pdf.slice(offset, offset + expected.length), expected, `El objeto ${index + 1} del PDF está mal ubicado.`);
    });
};

const createScenario = ({ from, to, start = '08:00', end = '12:00', courts, categories: names, block = 30, guaranteed = 1 }) => {
    const tournament = DataManager.createTournament('Torneo Regional de Newcom', guaranteed);
    DataManager.setTournamentCalendar(tournament.id, from, to, start, end, []);
    DataManager.setTournamentCourts(tournament.id, courts);
    DataManager.setTournamentSchedulingSettings(tournament.id, block, 0, block);
    const categories = DataManager.createCategories(names, tournament.id);
    return { tournament, categories };
};

const addZone = (tournamentId, category, letters) => {
    const zone = DataManager.createZone('Zona A', category.id, tournamentId);
    const teams = letters.map(letter => {
        const team = DataManager.createTeam(`${category.nombre} ${letter}`, category.id, tournamentId);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    return { zone, teams };
};

const pair = (tournamentId, category, zone, local, visitante, orden) => ({
    torneoId: tournamentId,
    categoriaId: category.id,
    zonaId: zone.id,
    phase: 'ZONAS',
    equipoLocalId: local.id,
    equipoVisitanteId: visitante.id,
    fecha: null,
    hora: null,
    cancha: null,
    orden,
    estado: 'pendiente',
    confirmado: true
});

const rowsFor = (tournamentId, categories, filters = {}) => fixtureRows({
    matches: LogisticsService.getTournamentMatches(tournamentId),
    categories: categories.map(category => ({ ...category, edad: category.nombre.split(' ')[0], modalidad: category.nombre.split(' ')[1] })),
    teams: categories.flatMap(category => DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id)),
    zones: categories.flatMap(category => DataManager.getZonesByTournamentAndCategory(tournamentId, category.id)),
    phaseLabels: PHASE_LABELS,
    filters
});

// Dos categorías juegan el viernes y dos el sábado: ninguna comparte el
// mismo cronograma, tal como en un torneo real.
const splitPlanning = (tournamentId, categories, firstDate, secondDate) => categories.forEach((category, index) => {
    DataManager.setCategoryPlanning(tournamentId, category.id, [{
        date: index % 2 === 0 ? firstDate : secondDate,
        stages: ['ZONAS']
    }]);
});

const buildMatches = (tournamentId, categories) => {
    const created = [];
    categories.forEach((category, index) => {
        const { zone, teams } = addZone(tournamentId, category, ['A', 'B', 'C', 'D']);
        created.push(pair(tournamentId, category, zone, teams[0], teams[1], index + 1));
        created.push(pair(tournamentId, category, zone, teams[2], teams[3], index + 1));
    });
    DataManager.addMatches(created);
    return created;
};

test('el fixture general queda ordenado por día, hora y cancha y sus filtros se combinan', () => {
    memory.clear();
    const { tournament, categories } = createScenario({
        from: '2026-10-09',
        to: '2026-10-10',
        courts: [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }],
        categories: ['+40 Femenino', '+50 Masculino', '+60 Mixto', '+68 Femenino']
    });
    splitPlanning(tournament.id, categories, '2026-10-09', '2026-10-10');
    const created = buildMatches(tournament.id, categories);
    const result = LogisticsService.programTournament(tournament.id);
    assert.equal(result.failures.length, 0, JSON.stringify(result.failures));

    const rows = rowsFor(tournament.id, categories);
    assert.equal(rows.length, created.length, 'La programación no debe duplicar partidos.');
    rows.forEach((row, index) => {
        if (index === 0) return;
        const previous = rows[index - 1];
        assert(`${previous.fecha}T${previous.hora}` <= `${row.fecha}T${row.hora}`, `Orden cronológico: ${previous.fecha} ${previous.hora} antes de ${row.fecha} ${row.hora}`);
    });
    rows.forEach((row, index) => {
        if (index === 0 || row.fecha !== rows[index - 1].fecha) return;
        const sameMoment = rows.filter(other => other.fecha === row.fecha && other.hora === row.hora).map(item => item.cancha);
        if (sameMoment.length < 2) return;
        assert.deepEqual([...sameMoment].sort((left, right) => left.localeCompare(right, 'es', { numeric: true })), sameMoment, 'A la misma hora las canchas se ordenan de forma estable.');
    });

    const allMatches = LogisticsService.getTournamentMatches(tournament.id);
    const dayFilter = filterFixtureMatches(allMatches, { date: '2026-10-09' });
    const courtFilter = filterFixtureMatches(allMatches, { court: 'court_2' });
    const categoryFilter = filterFixtureMatches(allMatches, { categoryId: categories.at(-1).id });
    const combined = filterFixtureMatches(allMatches, {
        date: '2026-10-09',
        court: 'court_1',
        categoryId: categories[0].id,
        categories,
        phase: 'ZONAS',
        status: 'pendiente',
        modality: 'Femenino'
    });
    assert(dayFilter.length > 0 && dayFilter.every(match => match.fecha === '2026-10-09') && dayFilter.length < allMatches.length, 'El filtro por día debe acotar el fixture.');
    assert(courtFilter.length > 0 && courtFilter.every(match => match.courtId === 'court_2' || match.cancha === 'Cancha 2'), 'El filtro por cancha debe acotar el fixture.');
    assert(categoryFilter.length > 0 && categoryFilter.every(match => match.categoriaId === categories.at(-1).id), 'El filtro por categoría debe acotar el fixture.');
    assert(combined.length > 0, 'El filtro combinado día + cancha + categoría + etapa + estado debe devolver partidos.');
    assert(combined.every(match => match.fecha === '2026-10-09' && match.courtId === 'court_1' && match.categoriaId === categories[0].id));
    assert.equal(filterFixtureMatches(allMatches, { date: '2026-10-09', court: 'court_1', categoryId: categories.at(-1).id }).length, 0, 'Una combinación imposible no devuelve partidos.');
});

test('el PDF completo, el PDF de una jornada y el de una cancha reflejan el fixture vigente', () => {
    memory.clear();
    const { tournament, categories } = createScenario({
        from: '2026-10-09',
        to: '2026-10-10',
        courts: [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }],
        categories: ['+40 Femenino', '+50 Masculino', '+60 Mixto', '+68 Femenino']
    });
    splitPlanning(tournament.id, categories, '2026-10-09', '2026-10-10');
    const created = buildMatches(tournament.id, categories);
    assert.equal(LogisticsService.programTournament(tournament.id).failures.length, 0);

    const rows = rowsFor(tournament.id, categories);
    const fullBytes = buildFixturePdf(tournament, rows, 'TODAS LAS JORNADAS DEL TORNEO');
    const fullPdf = decode(fullBytes);
    assertPdfStructure(fullPdf);
    assert.equal(rows.length, created.length, 'El PDF no debe crear ni duplicar partidos.');
    assert(fullPdf.startsWith('%PDF-1.4'));
    assert(fullPdf.includes('FIXTURE GENERAL DEL TORNEO'));
    assert(fullPdf.includes(tournament.nombre));
    assert(fullPdf.includes('TODAS LAS JORNADAS DEL TORNEO'));
    rows.forEach(row => assert(fullPdf.includes(`${row.teamA} vs ${row.teamB}`), `El PDF debe incluir ${row.teamA} vs ${row.teamB}`));
    assert.equal((fullPdf.match(/ vs /g) || []).length, rows.length, 'El PDF debe tener exactamente un renglón por partido.');
    rows.forEach(row => assert(fullPdf.includes(row.cancha), 'El PDF debe mostrar la cancha de cada partido.'));
    rows.forEach(row => assert(fullPdf.includes(row.categoryAge), 'El PDF debe mostrar la edad de la categoría.'));

    const dayRows = rowsFor(tournament.id, categories, { date: '2026-10-09' });
    const dayPdf = decode(buildFixturePdf(tournament, dayRows, 'JORNADA: VIERNES 09 DE OCTUBRE DE 2026'));
    assert(dayRows.length > 0 && dayRows.every(row => row.fecha === '2026-10-09'));
    assert(dayPdf.includes('JORNADA: VIERNES 09 DE OCTUBRE DE 2026'));
    assert.equal((dayPdf.match(/ vs /g) || []).length, dayRows.length, 'El PDF de la jornada contiene sólo sus partidos.');
    rows.filter(row => row.fecha !== '2026-10-09').forEach(row => assert(!dayPdf.includes(`${row.teamA} vs ${row.teamB}`), 'El PDF de una jornada no debe mezclar otra jornada.'));

    const courtRows = rowsFor(tournament.id, categories, { courtId: 'court_1', courtName: 'Cancha 1' });
    const courtPdf = decode(buildFixturePdf(tournament, courtRows, 'CANCHA: CANCHA 1'));
    assert(courtRows.length > 0 && courtRows.every(row => row.cancha === 'Cancha 1'));
    assert.equal((courtPdf.match(/ vs /g) || []).length, courtRows.length, 'El PDF de la cancha contiene sólo sus partidos.');
    assert(!courtPdf.includes('Cancha 2'), 'El PDF de una cancha no debe incluir la otra.');

    const many = Array.from({ length: 45 }, (_, index) => ({
        fecha: `2026-10-${String(9 + Math.floor(index / 18)).padStart(2, '0')}`,
        hora: '08:00',
        cancha: 'Cancha 1',
        categoryAge: '+40',
        modality: 'Femenino',
        categoryName: '+40 Femenino',
        phaseLabel: 'Fase de zonas',
        zoneName: 'Zona A',
        teamA: `Local ${index}`,
        teamB: `Visitante ${index}`,
        status: 'Programado'
    }));
    const multipage = decode(buildFixturePdf(tournament, many, 'TODAS LAS JORNADAS DEL TORNEO'));
    assertPdfStructure(multipage);
    assert.match(multipage, /Pagina 1 de \d+/, 'El documento debe indicar el número de página.');
    assert.match(multipage, /Pagina 2 de [2-9]/, 'Los partidos deben repartirse en varias páginas.');
});

test('cada categoría conserva su propio descanso mínimo entre partidos', () => {
    memory.clear();
    const { tournament, categories } = createScenario({
        from: '2026-10-09',
        to: '2026-10-09',
        start: '08:00',
        end: '11:00',
        courts: [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }],
        categories: ['+40 Femenino', '+68 Femenino'],
        guaranteed: 2
    });
    const [young, oldest] = categories;
    DataManager.setCategoryRestBlocks(tournament.id, young.id, 0);
    DataManager.setCategoryRestBlocks(tournament.id, oldest.id, 1);
    assert.equal(DataManager.getCategoryRestBlocks(young.id), 0);
    assert.equal(DataManager.getCategoryRestBlocks(oldest.id), 1);

    const fixtures = [];
    [young, oldest].forEach(category => {
        const { zone, teams } = addZone(tournament.id, category, ['A', 'B', 'C']);
        fixtures.push(pair(tournament.id, category, zone, teams[0], teams[1], 1));
        fixtures.push(pair(tournament.id, category, zone, teams[0], teams[2], 2));
    });
    const created = DataManager.addMatches(fixtures);
    const result = LogisticsService.programTournament(tournament.id);
    assert.equal(result.failures.length, 0, JSON.stringify(result.failures));

    const find = id => LogisticsService.getTournamentMatches(tournament.id).find(item => item.id === id);
    const youngFirst = find(created[0].id);
    const youngSecond = find(created[1].id);
    const oldestFirst = find(created[2].id);
    const oldestSecond = find(created[3].id);
    assert.equal(youngSecond.hora, `${String(Math.floor((minutes(youngFirst.hora) + 30) / 60)).padStart(2, '0')}:${String((minutes(youngFirst.hora) + 30) % 60).padStart(2, '0')}`, 'Con descanso 0 el mismo equipo puede jugar bloques consecutivos.');
    assert(minutes(oldestSecond.hora) - minutes(oldestFirst.hora) >= 60, 'Con descanso 1 el mismo equipo debe esperar un bloque completo.');
    assert.equal(LogisticsService.getConflicts(tournament.id).length, 0);
});

test('la programación informa el motivo cuando un partido no encuentra lugar', () => {
    memory.clear();
    const { tournament, categories } = createScenario({
        from: '2026-10-09',
        to: '2026-10-09',
        start: '08:00',
        end: '08:30',
        courts: [{ id: 'court_1', name: 'Cancha 1' }],
        categories: ['+40 Femenino'],
        guaranteed: 1
    });
    const category = categories[0];
    const { zone, teams } = addZone(tournament.id, category, ['A', 'B', 'C', 'D']);
    DataManager.addMatches([
        pair(tournament.id, category, zone, teams[0], teams[1], 1),
        pair(tournament.id, category, zone, teams[2], teams[3], 2)
    ]);
    const result = LogisticsService.programTournament(tournament.id);
    assert.equal(result.scheduled, 1, 'Sólo entra un partido en el único bloque disponible.');
    assert.equal(result.failures.length, 1);
    const failure = result.failures[0];
    assert(failure.label.includes('+40 Femenino'), 'El fallo debe identificar la categoría del partido.');
    assert(failure.reasons.some(reason => /canchas ocupadas/i.test(reason)), `Motivo esperado de cancha ocupada, obtenido: ${failure.reasons.join(', ')}`);
});

test('los conflictos del fixture señalan el partido, el tipo y la situación exacta', () => {
    memory.clear();
    const { tournament, categories } = createScenario({
        from: '2026-10-09',
        to: '2026-10-09',
        courts: [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }],
        categories: ['+68 Femenino']
    });
    const category = categories[0];
    const { zone, teams } = addZone(tournament.id, category, ['A', 'B', 'C']);
    const [first, second] = DataManager.addMatches([
        { ...pair(tournament.id, category, zone, teams[0], teams[1], 1), fecha: '2026-10-09', estado: 'programado' },
        { ...pair(tournament.id, category, zone, teams[1], teams[2], 2), fecha: '2026-10-09', hora: '10:00', estado: 'programado' }
    ]);
    const issues = LogisticsService.getConflicts(tournament.id);
    assert(issues.some(issue => issue.type === 'no-time' && issue.matchId === first.id && /falta indicar el horario/.test(issue.message)), 'Debe avisarse el partido sin horario.');
    assert(issues.some(issue => issue.type === 'no-court' && issue.matchId === second.id && /falta asignar una cancha/.test(issue.message)), 'Debe avisarse el partido sin cancha.');
    assert(issues.every(issue => issue.message.includes('+68 Femenino')), 'Cada conflicto debe nombrar la categoría del partido.');

    // Datos heredados o importados pueden contener solapes ya persistidos.
    const stored = JSON.parse(memory.get('newcom_data'));
    stored.matches = stored.matches.map(match => match.id === first.id ? { ...match, hora: '09:00', courtId: 'court_1', cancha: 'Cancha 1' } : match);
    stored.matches.push({ ...stored.matches.find(match => match.id === second.id), id: 'legacy-overlap', hora: '09:00', courtId: 'court_1', cancha: 'Cancha 1' });
    memory.set('newcom_data', JSON.stringify(stored));
    const courtIssue = LogisticsService.getConflicts(tournament.id).find(issue => issue.type === 'court');
    assert(courtIssue, 'Debe detectarse el conflicto de cancha.');
    assert(courtIssue.message.includes('Cancha 1') && courtIssue.message.includes('09:00'), courtIssue.message);
    assert.equal(LogisticsService.getConflicts(tournament.id).filter(issue => issue.type === 'court').length, 1);
});

test('reprogramar a mano conserva el mismo partido y rechaza cambios en conflicto', () => {
    memory.clear();
    const { tournament, categories } = createScenario({
        from: '2026-10-09',
        to: '2026-10-09',
        start: '08:00',
        end: '11:00',
        courts: [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }],
        categories: ['+50 Masculino']
    });
    const category = categories[0];
    const { zone, teams } = addZone(tournament.id, category, ['A', 'B', 'C', 'D']);
    DataManager.addMatches([
        pair(tournament.id, category, zone, teams[0], teams[1], 1),
        pair(tournament.id, category, zone, teams[2], teams[3], 2)
    ]);
    assert.equal(LogisticsService.programTournament(tournament.id).failures.length, 0);
    const [first, second] = LogisticsService.getTournamentMatches(tournament.id).sort(fixtureCompare);
    const originalCount = LogisticsService.getTournamentMatches(tournament.id).length;

    DataManager.updateMatches([{ ...first, hora: '10:00' }]);
    const later = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(match => match.id === first.id);
    assert.equal(later.hora, '10:00', 'Cambiar el horario debe conservar el ID del partido.');
    assert.equal(later.courtId, first.courtId);

    DataManager.updateMatches([{ ...second, courtId: first.courtId, cancha: first.cancha }]);
    const moved = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(match => match.id === second.id);
    assert.equal(moved.courtId, first.courtId, 'Cambiar la cancha debe conservar el ID del partido.');

    assert.throws(
        () => DataManager.updateMatches([{ ...moved, hora: '10:00' }]),
        /ocupada|partido programado/i,
        'Un cambio que genera conflicto debe explicarse, no aplicarse en silencio.'
    );
    const reverted = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(match => match.id === second.id);
    assert.notEqual(reverted.hora, '10:00', 'El cambio inválido no debe quedar guardado.');
    assert.equal(LogisticsService.getTournamentMatches(tournament.id).length, originalCount, 'No deben crearse partidos duplicados.');
});
