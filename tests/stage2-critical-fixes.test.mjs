import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
};

const { DataManager, resolveSlotInterval } = await import('../js/data/dataManager.js');
const { SchedulerService } = await import('../js/services/scheduler.js');
const { LogisticsService } = await import('../js/services/logistics.js');
const { PosicionesService } = await import('../js/services/standings.js');
const { PlayoffsService } = await import('../js/services/playoffs.js');
const { SpecialCrossService } = await import('../js/services/specialCrosses.js');
const { fixtureRows, buildFixturePdf } = await import('../js/services/fixturePdf.js');
const { escapeHtml } = await import('../js/core/escapeHtml.js');

const decode = bytes => new TextDecoder('latin1').decode(bytes);

test('resiliencia de _getStorage: un partido con sets corruptos no borra torneos existentes', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Torneo Protegido', 2);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teamA = DataManager.createTeam('Equipo A', category.id, tournament.id);
    const teamB = DataManager.createTeam('Equipo B', category.id, tournament.id);
    DataManager.assignTeamToZone(teamA.id, zone.id);
    DataManager.assignTeamToZone(teamB.id, zone.id);

    const raw = JSON.parse(memory.get('newcom_data'));
    raw.matches.push({
        id: 'corrupt_match',
        torneoId: tournament.id,
        categoriaId: category.id,
        zonaId: zone.id,
        phase: 'ZONAS',
        equipoLocalId: teamA.id,
        equipoVisitanteId: teamB.id,
        estado: 'finalizado',
        sets: [{ puntosLocal: 15, puntosVisitante: 15 }, { puntosLocal: 15, puntosVisitante: 10 }]
    });
    memory.set('newcom_data', JSON.stringify(raw));

    assert.equal(DataManager.getTournaments().length, 1);
    const restored = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).find(m => m.id === 'corrupt_match');
    assert.equal(restored.estado, 'pendiente');
    assert.deepEqual(restored.sets, []);

    memory.set('newcom_data', '{json_invalido');
    assert.deepEqual(DataManager.getTournaments(), []);
    assert.equal(memory.get('newcom_data_corrupt_backup'), '{json_invalido');
});

test('posiciones: PG prevalece sobre PF, suma real de sets y clasificación final respeta semifinalistas y 3er puesto', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Orden Deportivo', 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-02', '08:00', '20:00', []);
    const category = DataManager.createCategory('+50 Mixto', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const [a, b, c, d, e, f] = ['A', 'B', 'C', 'D', 'E', 'F'].map(name => {
        const team = DataManager.createTeam(name, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });

    const [m1, m2, m3] = DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: a.id, equipoVisitanteId: b.id, confirmado: true, estado: 'pendiente' },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: c.id, equipoVisitanteId: d.id, confirmado: true, estado: 'pendiente' },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: e.id, equipoVisitanteId: f.id, confirmado: true, estado: 'pendiente' }
    ]);

    // A gana 2-0 (15-12, 15-5 -> PF=30, PC=17, DIF=+13)
    DataManager.updateMatchResult(m1.id, [{ puntosLocal: 15, puntosVisitante: 12 }, { puntosLocal: 15, puntosVisitante: 5 }]);
    // C gana 2-1 sobre D (D tiene PF=36, PC=38, DIF=-2, PG=0)
    DataManager.updateMatchResult(m2.id, [{ puntosLocal: 15, puntosVisitante: 13 }, { puntosLocal: 13, puntosVisitante: 15 }, { puntosLocal: 10, puntosVisitante: 8 }]);
    // E gana 2-0 (15-1, 15-1 -> PF=30, PC=2, DIF=+28)
    DataManager.updateMatchResult(m3.id, [{ puntosLocal: 15, puntosVisitante: 1 }, { puntosLocal: 15, puntosVisitante: 1 }]);

    const standings = PosicionesService.calcularPosiciones(tournament.id, category.id);
    assert.deepEqual(standings.map(row => row.nombre), ['E', 'A', 'C', 'D', 'B', 'F']);
    const rowA = standings.find(row => row.id === a.id);
    const rowB = standings.find(row => row.id === b.id);
    assert.deepEqual([rowA.puntosFavor, rowA.puntosContra, rowA.diferenciaPuntos, rowA.setsFavor, rowA.setsContra], [30, 17, 13, 2, 0]);
    assert.deepEqual([rowB.puntosFavor, rowB.puntosContra, rowB.diferenciaPuntos, rowB.setsFavor, rowB.setsContra], [17, 30, -13, 0, 2]);

    // Modo legacy_pf sigue disponible como opción explícita
    const legacy = PosicionesService.calcularPosiciones(tournament.id, category.id, { mode: 'legacy_pf' });
    assert.equal(legacy[0].nombre, 'C');
    assert.equal(legacy[1].nombre, 'D');

    // Semifinales, 3er puesto y Final entre A, B, C, D (E quedó eliminado en zonas pese a mejor DIF)
    const [sf1, sf2, third, final] = DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'SEMIFINAL', equipoLocalId: a.id, equipoVisitanteId: b.id, confirmado: true, estado: 'pendiente' },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'SEMIFINAL', equipoLocalId: c.id, equipoVisitanteId: d.id, confirmado: true, estado: 'pendiente' },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'THIRD_PLACE', equipoLocalId: b.id, equipoVisitanteId: d.id, confirmado: true, estado: 'pendiente' },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'FINAL', equipoLocalId: a.id, equipoVisitanteId: c.id, confirmado: true, estado: 'pendiente' }
    ]);
    DataManager.updateMatchResult(sf1.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }]);
    DataManager.updateMatchResult(sf2.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }]);
    DataManager.updateMatchResult(third.id, [{ puntosLocal: 10, puntosVisitante: 15 }, { puntosLocal: 10, puntosVisitante: 15 }]);
    DataManager.updateMatchResult(final.id, [{ puntosLocal: 15, puntosVisitante: 12 }, { puntosLocal: 15, puntosVisitante: 12 }]);

    const finalOrder = PosicionesService.calcularClasificacionFinal(tournament.id, category.id);
    assert.deepEqual(finalOrder.slice(0, 4).map(row => row.nombre), ['A', 'C', 'D', 'B']);
});

test('partidos eliminatorios TBD (null) en paralelo no producen falsos conflictos de equipo ni descanso', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Llaves TBD', 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '20:00', []);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    DataManager.setCategoryRestBlocks(tournament.id, category.id, 2);

    assert.doesNotThrow(() => DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'SEMIFINAL', equipoLocalId: null, equipoVisitanteId: null, fecha: '2026-10-01', hora: '10:00', courtId: 'court_1', cancha: 'Cancha 1', confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'SEMIFINAL', equipoLocalId: null, equipoVisitanteId: null, fecha: '2026-10-01', hora: '10:00', courtId: 'court_2', cancha: 'Cancha 2', confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'THIRD_PLACE', equipoLocalId: null, equipoVisitanteId: null, fecha: '2026-10-01', hora: '11:00', courtId: 'court_1', cancha: 'Cancha 1', confirmado: true }
    ]));
    assert.equal(LogisticsService.getConflicts(tournament.id).length, 0);
});

test('reorganizeCourts respeta partidos finalizados y reorganizeFixture revierte si falla la programación', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Logística Segura', 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '10:00', []);
    DataManager.setTournamentCourts(tournament.id, [{ id: 'court_1', name: 'Cancha 1' }, { id: 'court_2', name: 'Cancha 2' }]);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teams = ['A', 'B', 'C', 'D'].map(name => {
        const team = DataManager.createTeam(name, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    const [m1, m2, m3] = DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[1].id, fecha: '2026-10-01', hora: '08:00', courtId: 'court_1', cancha: 'Cancha 1', confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[2].id, equipoVisitanteId: teams[3].id, fecha: '2026-10-01', hora: '08:00', courtId: 'court_2', cancha: 'Cancha 2', confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[2].id, fecha: '2026-10-01', hora: '09:00', courtId: 'court_2', cancha: 'Cancha 2', confirmado: true }
    ]);
    DataManager.updateMatchResult(m1.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }]);
    DataManager.updateMatchResult(m3.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }]);

    const result = LogisticsService.reorganizeCourts(tournament.id);
    assert.equal(result.validation.valid, true);
    const updatedM2 = LogisticsService.getTournamentMatches(tournament.id).find(m => m.id === m2.id);
    assert.equal(updatedM2.courtId, 'court_2', 'm2 a las 08:00 no debe chocar con m1 finalizado en Cancha 1.');

    // Reducir la ventana del calendario para forzar error en reorganizeFixture y verificar rollback
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '08:15', [], { allowUsedDateRemoval: true });
    assert.throws(() => LogisticsService.reorganizeFixture(tournament.id));
    const afterRollback = LogisticsService.getTournamentMatches(tournament.id).find(m => m.id === m2.id);
    assert.equal(afterRollback.hora, '08:00');
    assert.equal(afterRollback.courtId, 'court_2');
});

test('semántica unificada de intervalo y bloque protege descansos mínimos', () => {
    assert.equal(resolveSlotInterval(30, 0), 30);
    assert.equal(resolveSlotInterval(35, 5), 40);
    assert.equal(resolveSlotInterval(30, 35), 35);

    memory.clear();
    const tournament = DataManager.createTournament('Descansos con Pausa', 2);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '12:00', []);
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 5, 35);
    const category = DataManager.createCategory('+68 Femenino', tournament.id);
    DataManager.setCategoryRestBlocks(tournament.id, category.id, 1);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teams = ['A', 'B', 'C'].map(name => {
        const team = DataManager.createTeam(name, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });

    const blocks = LogisticsService.generateTimeBlocks(tournament.id, DataManager.getDaySchedules(tournament.id)[0]);
    assert.deepEqual(blocks.slice(0, 4), ['08:00', '08:40', '09:20', '10:00']);

    assert.throws(() => DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[1].id, fecha: '2026-10-01', hora: '08:00', courtId: 'court_1', cancha: 'Cancha 1', confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[2].id, fecha: '2026-10-01', hora: '08:40', courtId: 'court_2', cancha: 'Cancha 2', confirmado: true }
    ]), /descanso mínimo/i);

    assert.doesNotThrow(() => DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[1].id, fecha: '2026-10-01', hora: '08:00', courtId: 'court_1', cancha: 'Cancha 1', confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zone.id, phase: 'ZONAS', equipoLocalId: teams[0].id, equipoVisitanteId: teams[2].id, fecha: '2026-10-01', hora: '09:20', courtId: 'court_2', cancha: 'Cancha 2', confirmado: true }
    ]));
});

test('cruce_especial y revanchas existentes no corrompen generarEmparejamientos', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Revancha y Cruce Especial', 4);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '20:00', []);
    const category = DataManager.createCategory('+50 Mixto', tournament.id);
    const [zc, zd] = ['C', 'D'].map(name => DataManager.createZone(name, category.id, tournament.id));
    const [c1, c2] = ['C1', 'C2'].map(n => { const t = DataManager.createTeam(n, category.id, tournament.id); DataManager.assignTeamToZone(t.id, zc.id); return t; });
    const [d1, d2] = ['D1', 'D2'].map(n => { const t = DataManager.createTeam(n, category.id, tournament.id); DataManager.assignTeamToZone(t.id, zd.id); return t; });

    // Tres partidos en cada zona (con revanchas legítimas) + dos cruces especiales C↔D
    DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zc.id, phase: 'ZONAS', equipoLocalId: c1.id, equipoVisitanteId: c2.id, confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zc.id, phase: 'ZONAS', equipoLocalId: c1.id, equipoVisitanteId: c2.id, revancha: true, confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zc.id, phase: 'ZONAS', equipoLocalId: c1.id, equipoVisitanteId: c2.id, revancha: true, confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zd.id, phase: 'ZONAS', equipoLocalId: d1.id, equipoVisitanteId: d2.id, confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zd.id, phase: 'ZONAS', equipoLocalId: d1.id, equipoVisitanteId: d2.id, revancha: true, confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: zd.id, phase: 'ZONAS', equipoLocalId: d1.id, equipoVisitanteId: d2.id, revancha: true, confirmado: true }
    ]);
    SpecialCrossService.create(tournament.id, category.id, c1.id, d1.id);
    SpecialCrossService.create(tournament.id, category.id, c2.id, d2.id);

    assert.equal(SchedulerService.generarEmparejamientos(tournament.id, category.id), 0);
});

test('advanceBracketWinner impide corromper una final ya jugada y playoffs hace rollback si falla la agenda', () => {
    memory.clear();
    const tournament = DataManager.createTournament('Integridad Eliminatorias', 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '10:00', []);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    const zone = DataManager.createZone('Zona A', category.id, tournament.id);
    const teams = Array.from({ length: 16 }, (_, i) => {
        const team = DataManager.createTeam(`E${i + 1}`, category.id, tournament.id);
        DataManager.assignTeamToZone(team.id, zone.id);
        return team;
    });
    const [sf1, sf2] = DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'SEMIFINAL', equipoLocalId: teams[0].id, equipoVisitanteId: teams[1].id, confirmado: true },
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'SEMIFINAL', equipoLocalId: teams[2].id, equipoVisitanteId: teams[3].id, confirmado: true }
    ]);
    const [final] = DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: category.id, zonaId: null, phase: 'FINAL', sourceMatchIds: [sf1.id, sf2.id], equipoLocalId: null, equipoVisitanteId: null, confirmado: true }
    ]);
    DataManager.updateMatchResult(sf1.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }]);
    DataManager.updateMatchResult(sf2.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }]);
    DataManager.updateMatchResult(final.id, [{ puntosLocal: 15, puntosVisitante: 12 }, { puntosLocal: 15, puntosVisitante: 12 }]);

    // Corregir puntos manteniendo el mismo ganador está permitido
    assert.doesNotThrow(() => DataManager.updateMatchResult(sf1.id, [{ puntosLocal: 15, puntosVisitante: 11 }, { puntosLocal: 15, puntosVisitante: 10 }]));
    // Cambiar el ganador con la final ya finalizada debe rechazarse
    assert.throws(() => DataManager.updateMatchResult(sf1.id, [{ puntosLocal: 10, puntosVisitante: 15 }, { puntosLocal: 10, puntosVisitante: 15 }]), /instancia siguiente ya fue finalizada/i);

    // Rollback en addStage cuando no hay capacidad para programar Top 16
    const t2 = DataManager.createTournament('Rollback Playoffs', 1);
    DataManager.setTournamentCalendar(t2.id, '2026-10-01', '2026-10-01', '08:00', '09:00', []);
    DataManager.setTournamentCourts(t2.id, [{ id: 'court_1', name: 'Cancha 1' }]);
    const c2 = DataManager.createCategory('+40 Mixto', t2.id);
    const z2 = DataManager.createZone('Zona A', c2.id, t2.id);
    const teams2 = Array.from({ length: 16 }, (_, i) => {
        const team = DataManager.createTeam(`T${i + 1}`, c2.id, t2.id);
        DataManager.assignTeamToZone(team.id, z2.id);
        return team;
    });
    const groupMatches = [];
    for (let i = 0; i < 16; i += 2) {
        groupMatches.push({ torneoId: t2.id, categoriaId: c2.id, zonaId: z2.id, phase: 'ZONAS', equipoLocalId: teams2[i].id, equipoVisitanteId: teams2[i + 1].id, confirmado: true });
    }
    const createdGroup = DataManager.addMatches(groupMatches);
    createdGroup.forEach(m => DataManager.updateMatchResult(m.id, [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }]));

    assert.throws(() => PlayoffsService.generarTop16(t2.id, c2.id));
    assert.equal(DataManager.getMatchesByTournamentAndCategory(t2.id, c2.id).filter(m => m.phase === 'TOP_16').length, 0);
});

test('PDF y fixtureRows conservan hora por partido, hora de inicio por cancha y filtro por categoría', () => {
    memory.clear();
    const tournament = DataManager.createTournament('PDF Canchas', 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-10-01', '2026-10-01', '08:00', '12:00', []);
    const [c1, c2] = DataManager.createCategories(['+40 Mixto', '+50 Femenino'], tournament.id);
    const z1 = DataManager.createZone('Zona A', c1.id, tournament.id);
    const z2 = DataManager.createZone('Zona A', c2.id, tournament.id);
    const t1 = ['A', 'B', 'C', 'D'].map(n => { const t = DataManager.createTeam(n, c1.id, tournament.id); DataManager.assignTeamToZone(t.id, z1.id); return t; });
    const t2 = ['E', 'F'].map(n => { const t = DataManager.createTeam(n, c2.id, tournament.id); DataManager.assignTeamToZone(t.id, z2.id); return t; });

    DataManager.addMatches([
        { torneoId: tournament.id, categoriaId: c1.id, zonaId: z1.id, phase: 'ZONAS', equipoLocalId: t1[0].id, equipoVisitanteId: t1[1].id, fecha: '2026-10-01', hora: '08:00', courtId: 'court_1', cancha: 'Cancha 1', confirmado: true },
        { torneoId: tournament.id, categoriaId: c1.id, zonaId: z1.id, phase: 'ZONAS', equipoLocalId: t1[2].id, equipoVisitanteId: t1[3].id, fecha: '2026-10-01', hora: '08:00', courtId: 'court_2', cancha: 'Cancha 2', confirmado: true },
        { torneoId: tournament.id, categoriaId: c2.id, zonaId: z2.id, phase: 'ZONAS', equipoLocalId: t2[0].id, equipoVisitanteId: t2[1].id, fecha: '2026-10-01', hora: '08:30', courtId: 'court_1', cancha: 'Cancha 1', confirmado: true }
    ]);

    const rows = fixtureRows({
        matches: LogisticsService.getTournamentMatches(tournament.id),
        categories: [c1, c2],
        teams: [...t1, ...t2],
        zones: [z1, z2],
        phaseLabels: { ZONAS: 'Fase de zonas' }
    });
    assert.equal(rows.find(r => r.cancha === 'Cancha 1' && r.hora === '08:00').horaInicio, '08:00');
    assert.equal(rows.find(r => r.cancha === 'Cancha 2' && r.hora === '08:00').horaInicio, '08:00');
    assert.equal(rows.find(r => r.cancha === 'Cancha 1' && r.hora === '08:30').horaInicio, '');

    const pdfDefault = decode(buildFixturePdf(tournament, rows));
    assert(pdfDefault.includes('(08:00)'));
    assert(pdfDefault.includes('(08:30)'));

    const pdfOnlyStart = decode(buildFixturePdf(tournament, rows, '', { onlyStartTime: true }));
    const streams = [...pdfOnlyStart.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]);
    assert.equal(streams.length, 2);
    assert(streams[0].includes('(08:00)') && !streams[0].includes('(08:30)'));
    assert(streams[1].includes('(08:00)'), 'Cancha 2 también debe mostrar su hora de inicio en modo solo hora de inicio.');

    const filteredByCat = fixtureRows({
        matches: LogisticsService.getTournamentMatches(tournament.id),
        categories: [c1, c2],
        teams: [...t1, ...t2],
        zones: [z1, z2],
        phaseLabels: { ZONAS: 'Fase de zonas' },
        filters: { categoryId: c2.id }
    });
    assert.equal(filteredByCat.length, 1);
    assert.equal(filteredByCat[0].categoryName, '+50 Femenino');
});

test('escapeHtml neutraliza payloads XSS comunes', () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(\'xss\')">&'), '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;&amp;');
});
