import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager } = await import('../js/data/dataManager.js');
const {
    CompetitionEngine,
    RoundRobinEngine,
    KnockoutEngine,
    SchedulingEngine,
    StandingsEngine,
    ValidationEngine
} = await import('../js/engine/index.js');
const { fixtureRows, buildFixturePdf, buildFixtureXlsx } = await import('../js/services/fixturePdf.js');
const { buildStandingsPdf, buildStandingsCsv, buildResultsPdf, buildResultsCsv } = await import('../js/services/reportsExport.js');

const decode = bytes => new TextDecoder('latin1').decode(bytes);
const assertValidPdf = bytes => {
    const pdf = decode(bytes);
    assert(pdf.startsWith('%PDF-1.4'));
    const start = Number(pdf.slice(pdf.lastIndexOf('startxref') + 9, pdf.indexOf('%%EOF')).trim());
    assert.equal(pdf.slice(start, start + 4), 'xref');
    const entries = pdf.slice(start).split('trailer')[0].split('\n').slice(2).filter(line => /^\d{10} \d{5} n/.test(line));
    assert(entries.length > 0);
    entries.forEach((entry, index) => {
        const offset = Number(entry.slice(0, 10));
        const expected = `${index + 1} 0 obj`;
        assert.equal(pdf.slice(offset, offset + expected.length), expected);
    });
    return pdf;
};

const scoreWin = (a = 15, b = 12, c = 15, d = 5) => [
    { puntosLocal: a, puntosVisitante: b },
    { puntosLocal: c, puntosVisitante: d }
];

test('QA integral: todos los tamaños (3, 4, 5, 6, 8, 10, 12, 16, 20 equipos) en Todos contra Todos y Eliminación Directa', () => {
    for (const n of [3, 4, 5, 6, 8, 10, 12, 16, 20]) {
        // Todos contra Todos
        memory.clear();
        const t = DataManager.createTournament(`RR-${n}`, 1, { cantidadCanchas: 4 });
        DataManager.setTournamentCalendar(t.id, '2026-11-01', '2026-11-05', '08:00', '22:00', []);
        const cat = DataManager.createCategory('+50 Mixto', t.id);
        for (let i = 1; i <= n; i += 1) DataManager.createTeam(`E${i}`, cat.id, t.id);
        CompetitionEngine.setCategoryFormat(t.id, cat.id, { formatId: 'TODOS_CONTRA_TODOS', vueltas: 1 });
        const gen = CompetitionEngine.generateInitialFixture(t.id, cat.id, { confirmImmediately: true });
        assert.equal(gen.createdCount, (n * (n - 1)) / 2, `RR-${n} partidos exactos`);
        const matches = DataManager.getMatchesByTournamentAndCategory(t.id, cat.id);
        const teams = DataManager.getTeamsByTournamentAndCategory(t.id, cat.id);
        assert.equal(ValidationEngine.validateFixtureIntegrity(matches, teams).valid, true);

        // Eliminación Directa
        memory.clear();
        const tKo = DataManager.createTournament(`KO-${n}`, 1, { cantidadCanchas: 4 });
        DataManager.setTournamentCalendar(tKo.id, '2026-11-01', '2026-11-03', '08:00', '22:00', []);
        const catKo = DataManager.createCategory('+40 Mixto', tKo.id);
        for (let i = 1; i <= n; i += 1) DataManager.createTeam(`K${i}`, catKo.id, tKo.id);
        CompetitionEngine.setCategoryFormat(tKo.id, catKo.id, { formatId: 'ELIMINACION_DIRECTA', thirdPlace: n >= 4 });
        const koGen = CompetitionEngine.generateInitialFixture(tKo.id, catKo.id);
        const expectedKo = (n - 1) + (n >= 4 ? 1 : 0);
        assert.equal(koGen.createdCount, expectedKo, `KO-${n} debe tener ${expectedKo} partidos reales sin ficticios`);
        const koMatches = DataManager.getMatchesByTournamentAndCategory(tKo.id, catKo.id);
        assert.equal(ValidationEngine.validateBracketIntegrity(koMatches).valid, true);
    }
});

test('QA integral: clasificación Top 2, Top 4, Top 8 y Top 16 con 1 zona y múltiples zonas', () => {
    for (const [teamsCount, zonesCount, topN] of [[4, 1, 2], [6, 2, 4], [12, 3, 8], [16, 4, 16]]) {
        memory.clear();
        const t = DataManager.createTournament(`Top-${topN}`, 1, { cantidadCanchas: 4 });
        DataManager.setTournamentCalendar(t.id, '2026-11-01', '2026-11-05', '08:00', '22:00', []);
        const cat = DataManager.createCategory('+50 Mixto', t.id);
        const zones = Array.from({ length: zonesCount }, (_, i) => DataManager.createZone(`Zona ${String.fromCharCode(65 + i)}`, cat.id, t.id));
        for (let i = 0; i < teamsCount; i += 1) {
            const team = DataManager.createTeam(`T${i + 1}`, cat.id, t.id);
            DataManager.assignTeamToZone(team.id, zones[i % zonesCount].id);
        }
        CompetitionEngine.setCategoryFormat(t.id, cat.id, {
            formatId: 'ZONAS_ELIMINATORIAS',
            groupMode: 'round_robin',
            qualificationMode: 'general_top_n',
            qualifiersTotal: topN,
            thirdPlace: topN >= 4
        });
        CompetitionEngine.generateInitialFixture(t.id, cat.id, { confirmImmediately: true });
        SchedulingEngine.scheduleTournament(t.id);

        // Con resultados incompletos no debe permitir generar eliminatorias
        assert.throws(() => CompetitionEngine.advanceStage(t.id, cat.id), /Faltan/);

        const zoneMatches = DataManager.getMatchesByTournamentAndCategory(t.id, cat.id);
        zoneMatches.forEach(m => CompetitionEngine.recordResult(m.id, scoreWin()));

        const qualified = CompetitionEngine.getQualifiedTeams(t.id, cat.id);
        assert.equal(qualified.length, topN);
        assert.equal(new Set(qualified.map(q => q.id)).size, topN);

        const bracket = CompetitionEngine.advanceStage(t.id, cat.id, { schedule: true });
        assert.equal(bracket.stage, 'ELIMINATORIAS');
        assert.equal(bracket.created.filter(m => m.phase !== 'THIRD_PLACE').length, topN - 1);
    }
});

test('QA integral: torneo multicategoría con 4 formatos distintos compartiendo 3 canchas y descansos independientes', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Abierto Nacional Newcom', 2, {
        organizacion: 'Federación Argentina de Newcom',
        cantidadCanchas: 3,
        startDate: '2026-11-10',
        endDate: '2026-11-13',
        branding: { brandName: 'FAN Oficial' }
    });
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 5, 30);

    const [catA, catB, catC, catD] = DataManager.createCategories(['+40 Mixto', '+50 Femenino', '+60 Mixto', '+68 Femenino'], tournament.id);
    DataManager.setCategoryRestBlocks(tournament.id, catA.id, 0);
    DataManager.setCategoryRestBlocks(tournament.id, catB.id, 1);
    DataManager.setCategoryRestBlocks(tournament.id, catC.id, 1);
    DataManager.setCategoryRestBlocks(tournament.id, catD.id, 2);

    // Cat A: Formato A (2 zonas de 3, Top 4)
    const [za1, za2] = [DataManager.createZone('Zona A', catA.id, tournament.id), DataManager.createZone('Zona B', catA.id, tournament.id)];
    for (let i = 0; i < 6; i += 1) {
        const team = DataManager.createTeam(`A${i + 1}`, catA.id, tournament.id);
        DataManager.assignTeamToZone(team.id, i < 3 ? za1.id : za2.id);
    }
    CompetitionEngine.setCategoryFormat(tournament.id, catA.id, { formatId: 'ZONAS_ELIMINATORIAS', groupMode: 'round_robin', qualificationMode: 'per_zone', qualifiersPerZone: 2, thirdPlace: true });

    // Cat B: Formato B (Todos contra Todos, 5 equipos impar)
    for (let i = 1; i <= 5; i += 1) DataManager.createTeam(`B${i}`, catB.id, tournament.id);
    CompetitionEngine.setCategoryFormat(tournament.id, catB.id, { formatId: 'TODOS_CONTRA_TODOS', vueltas: 1 });

    // Cat C: Formato C (Zonas + Zona Final con carry_over)
    const [zc1, zc2] = [DataManager.createZone('Zona 1', catC.id, tournament.id), DataManager.createZone('Zona 2', catC.id, tournament.id)];
    for (let i = 0; i < 6; i += 1) {
        const team = DataManager.createTeam(`C${i + 1}`, catC.id, tournament.id);
        DataManager.assignTeamToZone(team.id, i < 3 ? zc1.id : zc2.id);
    }
    CompetitionEngine.setCategoryFormat(tournament.id, catC.id, { formatId: 'ZONAS_ZONA_FINAL', qualifiersPerZone: 2, carryOverMode: 'carry_over' });

    // Cat D: Formato D (Eliminación Directa, 6 equipos con 2 byes)
    for (let i = 1; i <= 6; i += 1) DataManager.createTeam(`D${i}`, catD.id, tournament.id);
    CompetitionEngine.setCategoryFormat(tournament.id, catD.id, { formatId: 'ELIMINACION_DIRECTA', thirdPlace: true });

    [catA, catB, catC, catD].forEach(cat => {
        CompetitionEngine.generateInitialFixture(tournament.id, cat.id, { confirmImmediately: true });
    });

    const scheduled = SchedulingEngine.scheduleTournament(tournament.id);
    assert.equal(scheduled.failures.length, 0);
    assert.equal(SchedulingEngine.getConflicts(tournament.id).length, 0);

    // Verificar exactamente cero colisiones de cancha y equipo en todo el torneo
    const allScheduled = SchedulingEngine.getGeneralFixture(tournament.id);
    assert(allScheduled.length >= 28);
    allScheduled.forEach((m, i) => allScheduled.slice(i + 1).forEach(o => {
        if (m.fecha !== o.fecha || m.hora !== o.hora) return;
        assert.notEqual(m.courtId, o.courtId, 'Nunca dos partidos en la misma cancha y horario');
        const leftTeams = [m.equipoLocalId, m.equipoVisitanteId].filter(Boolean);
        const rightTeams = [o.equipoLocalId, o.equipoVisitanteId].filter(Boolean);
        assert(!leftTeams.some(id => rightTeams.includes(id)), 'Nunca un equipo en dos partidos simultáneos');
    }));

    // Reprogramación manual válida conserva el mismo ID; en conflicto rechaza
    const target = allScheduled[0];
    const simultaneous = allScheduled.find(m => m.id !== target.id && m.fecha === target.fecha && m.hora === target.hora);
    assert(simultaneous);
    assert.throws(() => SchedulingEngine.rescheduleMatch(tournament.id, simultaneous.id, { courtId: target.courtId }), /ocupada/i);

    // Cargar resultados exactos (15-12, 15-5 -> PF 30, PC 17, DIF +13) y verificar exportaciones completas
    const catBMatches = DataManager.getMatchesByTournamentAndCategory(tournament.id, catB.id);
    catBMatches.forEach(m => CompetitionEngine.recordResult(m.id, scoreWin(15, 12, 15, 5)));
    const catBStandings = CompetitionEngine.getStandings(tournament.id, catB.id);
    assert.equal(catBStandings.general.reduce((s, r) => s + r.puntosFavor, 0), catBMatches.length * (30 + 17));
    assert.equal(catBStandings.general.reduce((s, r) => s + r.diferenciaPuntos, 0), 0);

    // Exportaciones: PDF fixture general, PDF categoría, XLSX, PDF posiciones, CSV posiciones, PDF resultados, CSV resultados
    const categories = DataManager.getCategoriesByTournament(tournament.id);
    const allTeams = categories.flatMap(c => DataManager.getTeamsByTournamentAndCategory(tournament.id, c.id));
    const allZones = categories.flatMap(c => DataManager.getZonesByTournamentAndCategory(tournament.id, c.id));
    const phaseLabels = { ZONAS: 'Zonas', LIGA: 'Todos contra todos', ZONA_FINAL: 'Zona Final', TOP_8: 'Cuartos', SEMIFINAL: 'Semifinales', THIRD_PLACE: 'Tercer puesto', FINAL: 'Final' };

    const updatedAll = SchedulingEngine.getGeneralFixture(tournament.id);
    const fullRows = fixtureRows({ matches: updatedAll, categories, teams: allTeams, zones: allZones, phaseLabels });
    const fullPdf = assertValidPdf(buildFixturePdf(tournament, fullRows, 'TODAS LAS JORNADAS'));
    assert(fullPdf.includes('Abierto Nacional Newcom'));
    assert(fullPdf.includes('Federación Argentina de Newcom'));
    assert(fullPdf.includes('de noviembre de 2026'));

    const catBRows = fixtureRows({ matches: updatedAll, categories, teams: allTeams, zones: allZones, phaseLabels, filters: { categoryId: catB.id } });
    assert.equal(catBRows.length, catBMatches.length);
    const catBPdf = assertValidPdf(buildFixturePdf(tournament, catBRows, 'CATEGORIA: +50 FEMENINO'));
    assert(catBPdf.includes('(+50)') && catBPdf.includes('(Femenino)') && catBPdf.includes('(Todos contra todos)'));
    catBRows.forEach(r => assert(catBPdf.includes(`${r.teamA}  vs  ${r.teamB}`)));

    const xlsx = buildFixtureXlsx({ tournament, rows: fullRows, courts: DataManager.getTournamentCourts(tournament.id) });
    assert(xlsx.length > 500 && xlsx[0] === 0x50 && xlsx[1] === 0x4b, 'XLSX debe ser un archivo ZIP válido');

    const standingsPdf = assertValidPdf(buildStandingsPdf({
        tournament,
        category: catB,
        formatLabel: 'Todos contra Todos',
        sections: [{ title: 'Tabla General', rows: catBStandings.general }]
    }));
    assert(standingsPdf.includes('TABLA DE POSICIONES'));
    assert(standingsPdf.includes('B1'));
    const standingsCsv = buildStandingsCsv({ sections: [{ title: 'Tabla General', rows: catBStandings.general }] });
    assert(standingsCsv.includes('"SF";"SC";"PF";"PC";"DIF"'));

    const resultsPdf = assertValidPdf(buildResultsPdf({
        tournament,
        category: catB,
        formatLabel: 'Todos contra Todos',
        matches: DataManager.getMatchesByTournamentAndCategory(tournament.id, catB.id),
        teams: DataManager.getTeamsByTournamentAndCategory(tournament.id, catB.id),
        zones: [],
        phaseLabels
    }));
    assert(resultsPdf.includes('REPORTE DE RESULTADOS'));
    assert(resultsPdf.includes('S1:15-12 S2:15-5'));
    const resultsCsv = buildResultsCsv({
        matches: DataManager.getMatchesByTournamentAndCategory(tournament.id, catB.id),
        teams: DataManager.getTeamsByTournamentAndCategory(tournament.id, catB.id),
        zones: [],
        phaseLabels
    });
    assert(resultsCsv.includes('"15-12";"15-5"'));
});

test('QA integral: CRUD completo (equipos, zonas, categorías, torneo) y respaldo JSON merge/replace', () => {
    memory.clear();
    const t = DataManager.createTournament('Copa Original', 2, { organizacion: 'Club Sur' });
    DataManager.updateTournament(t.id, { nombre: 'Copa Editada', organizacion: 'Asociación Sur', edition: 'asociacion' });
    assert.equal(DataManager.getTournament(t.id).nombre, 'Copa Editada');

    const cat = DataManager.createCategory('+70 Recreativo', t.id);
    const z1 = DataManager.createZone('Zona Norte', cat.id, t.id);
    assert.throws(() => DataManager.createZone('zona norte', cat.id, t.id), /ya existe una zona/i);
    DataManager.updateZone(z1.id, { nombre: 'Zona A' });

    const team1 = DataManager.createTeam('Cóndores', cat.id, t.id);
    const team2 = DataManager.createTeam('Águilas', cat.id, t.id);
    DataManager.updateTeam(team1.id, { nombre: 'Cóndores Sur' });
    assert.equal(DataManager.getTeamsByCategory(cat.id).find(x => x.id === team1.id).nombre, 'Cóndores Sur');

    DataManager.assignTeamToZone(team1.id, z1.id);
    DataManager.unassignTeamFromZone(team1.id);
    assert.equal(DataManager.getTeamsByCategory(cat.id).find(x => x.id === team1.id).zonaId, null);

    // Exportar respaldo individual y reimportar en un almacenamiento limpio
    const backup = DataManager.exportBackupSnapshot(t.id);
    assert.equal(backup.schema, 'n3com-backup');
    assert.equal(backup.data.tournaments.length, 1);

    DataManager.removeTeam(team2.id);
    assert.equal(DataManager.getTeamsByCategory(cat.id).length, 1);
    DataManager.removeZone(z1.id);
    assert.equal(DataManager.getZonesByCategory(cat.id).length, 0);
    DataManager.removeCategory(t.id, cat.id);
    assert.equal(DataManager.getCategoriesByTournament(t.id).length, 0);

    // Replace restaura exactamente todo
    const restored = DataManager.importBackupSnapshot(JSON.stringify(backup), { mode: 'replace' });
    assert.equal(restored.importedTournaments, 1);
    assert.equal(DataManager.getTeamsByCategory(cat.id).length, 2);

    // Merge no duplica torneos ya existentes
    const mergedAgain = DataManager.importBackupSnapshot(backup, { mode: 'merge' });
    assert.equal(mergedAgain.importedTournaments, 0);
    assert.equal(mergedAgain.skippedTournaments, 1);

    // Rechaza archivos inválidos
    assert.throws(() => DataManager.importBackupSnapshot({ invalid: true }), /no tiene una estructura N3com válida/i);
});
