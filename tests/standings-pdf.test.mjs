import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');
const { fixtureRows, buildFixturePdf } = await import('../js/services/fixturePdf.js');
const { buildStandingsPdf } = await import('../js/services/standingsPdf.js');
const { PosicionesService } = await import('../js/services/standings.js');

const decode = bytes => new TextDecoder('latin1').decode(bytes);
const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

// Verifica que la tabla de referencias del PDF apunte realmente a cada objeto.
const assertPdfStructure = pdf => {
    const start = Number(pdf.slice(pdf.lastIndexOf('startxref') + 9, pdf.indexOf('%%EOF')).trim());
    assert.equal(pdf.slice(start, start + 4), 'xref', 'El PDF debe tener su tabla de referencias.');
    const entries = pdf.slice(start).split('trailer')[0].split('\n').slice(2).filter(line => /^\d{10} \d{5} n/.test(line));
    entries.forEach((entry, index) => {
        const offset = Number(entry.slice(0, 10));
        const expected = `${index + 1} 0 obj`;
        assert.equal(pdf.slice(offset, offset + expected.length), expected, `El objeto ${index + 1} del PDF está mal ubicado.`);
    });
};

const createScenario = (name, teamCount, guaranteed = 1) => {
    memory.clear();
    const tournament = DataManager.createTournament(name, guaranteed);
    DataManager.setTournamentCalendar(tournament.id, '2026-11-05', '2026-11-05', '09:00', '18:00', []);
    const category = DataManager.createCategory('Categoria de prueba', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teams = Array.from({ length: teamCount }, (_, index) => {
        const team = DataManager.createTeam(`${name} ${index + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    return { tournament, category, zone, teams };
};

const pair = (setup, local, visitante, orden) => ({
    torneoId: setup.tournament.id,
    categoriaId: setup.category.id,
    zonaId: setup.zone.id,
    phase: 'ZONAS',
    equipoLocalId: local.id,
    equipoVisitanteId: visitante.id,
    fecha: '2026-11-05',
    hora: `${String(10 + orden).padStart(2, '0')}:00`,
    cancha: 'Cancha 1',
    orden,
    estado: 'pendiente',
    confirmado: true
});

const rowsFor = setup => fixtureRows({
    matches: DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id),
    categories: [{ ...setup.category, edad: '', modalidad: '' }],
    teams: setup.teams,
    zones: [setup.zone],
    phaseLabels: {}
});

test('el fixture muestra el resultado de los partidos finalizados y lo omite si siguen en curso', () => {
    const setup = createScenario('Fixture con resultados', 4);
    DataManager.addMatches([pair(setup, setup.teams[0], setup.teams[1], 1), pair(setup, setup.teams[2], setup.teams[3], 2)]);
    assert.equal(rowsFor(setup)[0].resultado, '', 'Un partido sin jugar no muestra resultado.');

    const match = DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id)[0];
    DataManager.updateMatchResult(match.id, [{ puntosLocal: 21, puntosVisitante: 15 }]);
    const withResult = rowsFor(setup);
    assert.equal(withResult.find(row => row.teamA === `${setup.tournament.nombre} 1`).resultado, '1-0', 'Con 1 set el marcador es 1-0.');
    assert.equal(withResult.find(row => row.teamA === `${setup.tournament.nombre} 3`).resultado, '', 'El partido sin jugar sigue vacío.');

    const pdf = decode(buildFixturePdf(setup.tournament, withResult));
    assertPdfStructure(pdf);
    assert(pdf.includes('RESULTADO'), 'La columna de resultado debe aparecer en el encabezado.');
    assert(pdf.includes('(1-0)'), 'El marcador del partido finalizado debe imprimirse.');
    assert.equal((pdf.match(/ vs /g) || []).length, 2, 'El PDF conserva un renglón por partido.');

    // Un partido a dos sets imprime el marcador 2-0 en la misma columna.
    DataManager.setTournamentSetFormats(setup.tournament.id, { zones: 'two_sets_15' });
    const second = DataManager.getMatchesByTournamentAndCategory(setup.tournament.id, setup.category.id)[1];
    DataManager.updateMatchResult(second.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 12 }]);
    const twoSetRows = rowsFor(setup);
    assert.equal(twoSetRows.find(row => row.teamA === `${setup.tournament.nombre} 3`).resultado, '2-0', 'El partido a dos sets muestra 2-0.');
    assert.equal(twoSetRows.find(row => row.teamA === `${setup.tournament.nombre} 1`).resultado, '1-0', 'El partido de un set conserva su marcador.');
    assert(decode(buildFixturePdf(setup.tournament, twoSetRows)).includes('(2-0)'), 'El marcador 2-0 debe imprimirse en el PDF.');

    // Datos heredados o importados: si falta el resumen del marcador, el
    // resultado se reconstruye desde los sets guardados.
    const legacyMatch = {
        id: 'legacy-match', torneoId: setup.tournament.id, categoriaId: setup.category.id, zonaId: setup.zone.id,
        phase: 'ZONAS', equipoLocalId: setup.teams[2].id, equipoVisitanteId: setup.teams[3].id,
        fecha: '2026-11-05', hora: '13:00', cancha: 'Cancha 1', orden: 4,
        estado: 'finalizado', confirmado: true,
        sets: [{ puntosLocal: 21, puntosVisitante: 15 }, { puntosLocal: 12, puntosVisitante: 15 }, { puntosLocal: 15, puntosVisitante: 11 }]
    };
    const legacyRow = fixtureRows({
        matches: [legacyMatch],
        categories: [{ ...setup.category, edad: '', modalidad: '' }],
        teams: setup.teams,
        zones: [setup.zone],
        phaseLabels: {}
    })[0];
    assert.equal(legacyRow.resultado, '2-1', 'Un partido heredado muestra el marcador calculado desde sus sets.');
});

test('el PDF de posiciones imprime la tabla vigente con puesto, sets y puntos', () => {
    const setup = createScenario('Torneo Posiciones PDF', 4, 2);
    const matches = DataManager.addMatches([
        pair(setup, setup.teams[0], setup.teams[1], 1),
        pair(setup, setup.teams[2], setup.teams[3], 2),
        pair(setup, setup.teams[0], setup.teams[2], 3)
    ]);
    matches.forEach(match => DataManager.updateMatchResult(match.id, [{ puntosLocal: 21, puntosVisitante: 15 }]));

    const rows = PosicionesService.calcularPosiciones(setup.tournament.id, setup.category.id);
    assert.equal(rows.length, 4, 'La tabla debe incluir a los cuatro equipos.');
    const labelFor = index => `${index + 1}.º`;
    const pdf = decode(buildStandingsPdf({
        tournament: setup.tournament,
        category: setup.category,
        rows,
        title: 'CLASIFICACIÓN GENERAL DEL TORNEO',
        subtitle: 'Puntos 3/2/1 en ambos modos.',
        labelFor
    }));
    assertPdfStructure(pdf);
    assert(pdf.startsWith('%PDF-1.4'));
    assert(pdf.includes('CLASIFICACION GENERAL DEL TORNEO'), 'El título se imprime sin acentos por la codificación del PDF.');
    assert(pdf.includes(setup.tournament.nombre));
    assert(pdf.includes('Categoria de prueba'));
    assert(pdf.includes('Puntos 3/2/1 en ambos modos.'));
    assert(pdf.includes('DIF. PUNTOS') && pdf.includes('DIF. SETS') && pdf.includes('PTS'), 'La tabla conserva las columnas de la vista.');
    rows.forEach((row, index) => {
        assert(pdf.includes(row.nombre), `El PDF debe listar ${row.nombre}.`);
        assert(pdf.includes(`(${normalize(labelFor(index))})`), `El PDF debe mostrar el puesto de ${row.nombre}: ${labelFor(index)}.`);
        assert(pdf.includes(`(${row.puntosClasificacion})`), `El PDF debe mostrar los puntos de ${row.nombre}.`);
    });
    assert(pdf.includes('Generado desde la clasificacion vigente'));

    const many = Array.from({ length: 30 }, (_, index) => ({
        ...rows[0], nombre: `Equipo Pagina ${index + 1}`, jugados: index, ganados: index, perdidos: index
    }));
    const multipage = decode(buildStandingsPdf({ tournament: setup.tournament, category: setup.category, rows: many, title: 'CLASIFICACIÓN GENERAL DEL TORNEO' }));
    assertPdfStructure(multipage);
    assert.match(multipage, /Pagina 1 de \d+/, 'El documento debe indicar el número de página.');
    assert.match(multipage, /Pagina 2 de [2-9]/, 'Los equipos deben repartirse en varias páginas.');
});
