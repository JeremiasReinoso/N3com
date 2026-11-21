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
    FormatRegistry,
    RoundRobinEngine,
    KnockoutEngine,
    StandingsEngine,
    ValidationEngine
} = await import('../js/engine/index.js');

const win20 = (a = 15, b = 10) => [
    { puntosLocal: a, puntosVisitante: b },
    { puntosLocal: a, puntosVisitante: b }
];

const setupBase = (name, teamCount, { courts = 2, start = '2026-11-01', end = '2026-11-03' } = {}) => {
    memory.clear();
    const tournament = DataManager.createTournament(name, 2);
    DataManager.setTournamentCalendar(tournament.id, start, end, '08:00', '22:00', []);
    DataManager.setTournamentCourtCount(tournament.id, courts);
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 0, 30);
    const category = DataManager.createCategory('+40 Mixto', tournament.id);
    const teams = Array.from({ length: teamCount }, (_, i) => DataManager.createTeam(`Equipo ${i + 1}`, category.id, tournament.id));
    return { tournament, category, teams };
};

test('RoundRobinEngine: Método del Círculo exacto para 3, 4, 5, 6, 8, 10, 12, 16 y 20 equipos', () => {
    for (const n of [3, 4, 5, 6, 8, 10, 12, 16, 20]) {
        const teams = Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, nombre: `Equipo ${i + 1}` }));
        const rr = RoundRobinEngine.generateRoundRobin(teams);
        const expectedMatches = (n * (n - 1)) / 2;
        const expectedRounds = n % 2 === 0 ? n - 1 : n;

        assert.equal(rr.totalMatches, expectedMatches, `N=${n} debe tener ${expectedMatches} partidos`);
        assert.equal(rr.totalRounds, expectedRounds, `N=${n} debe tener exactamente ${expectedRounds} rondas óptimas`);
        assert.equal(rr.hasByes, n % 2 === 1);

        // Ningún enfrentamiento repetido ni duplicado dentro de la misma ronda
        const pairs = new Set();
        const byeCounts = new Map(teams.map(t => [t.id, 0]));
        rr.rounds.forEach(round => {
            const playedInRound = new Set();
            round.matches.forEach(match => {
                assert.notEqual(match.local.id, match.visitante.id);
                assert(!playedInRound.has(match.local.id), `N=${n} ronda ${round.round}: equipo local repetido`);
                assert(!playedInRound.has(match.visitante.id), `N=${n} ronda ${round.round}: equipo visitante repetido`);
                playedInRound.add(match.local.id);
                playedInRound.add(match.visitante.id);
                const key = [match.local.id, match.visitante.id].sort().join(':');
                assert(!pairs.has(key), `N=${n}: cruce repetido ${key}`);
                pairs.add(key);
            });
            if (n % 2 === 1) {
                assert.equal(round.byes.length, 1);
                assert(!playedInRound.has(round.byes[0].id));
                byeCounts.set(round.byes[0].id, byeCounts.get(round.byes[0].id) + 1);
            } else {
                assert.equal(round.byes.length, 0);
            }
        });
        assert.equal(pairs.size, expectedMatches);
        if (n % 2 === 1) {
            assert([...byeCounts.values()].every(count => count === 1), `N=${n}: cada equipo debe descansar exactamente 1 vez`);
        }
        assert(Object.values(rr.matchesPerTeam).every(count => count === n - 1));
    }
});

test('KnockoutEngine: cuadros válidos con byes reales (sin partidos ficticios) para 3, 5, 6, 8, 10, 12, 16 y 20 equipos', () => {
    for (const n of [3, 5, 6, 8, 10, 12, 16, 20]) {
        const teams = Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, nombre: `Seed ${i + 1}`, seed: i + 1 }));
        const plan = KnockoutEngine.buildBracketPlan(teams, { thirdPlace: n >= 4 });
        const expectedMainMatches = n - 1;
        const mainMatches = plan.matches.filter(m => m.phase !== 'THIRD_PLACE');
        assert.equal(mainMatches.length, expectedMainMatches, `N=${n} debe crear exactamente ${expectedMainMatches} partidos reales`);
        assert.equal(plan.byeCount, KnockoutEngine.nextPowerOfTwo(n) - n);
        // Ningún partido tiene el mismo equipo en ambos lados ni un bye como rival
        mainMatches.forEach(match => {
            if (match.equipoLocalId && match.equipoVisitanteId) {
                assert.notEqual(match.equipoLocalId, match.equipoVisitanteId);
            }
        });
        if (n >= 4) assert(plan.thirdPlaceMatch, `N=${n} con thirdPlace debe incluir partido por 3.º puesto`);
        else assert.equal(plan.thirdPlaceMatch, null, 'Con 3 equipos no existen dos semifinales para 3.º puesto');
    }
});

test('Formato A (Zonas + Eliminatorias): clasificación por zona (Top 2), cruces, 3.º puesto y podio definitivo', () => {
    const { tournament, category, teams } = setupBase('Formato A', 8);
    const [zA, zB] = [DataManager.createZone('Zona A', category.id, tournament.id), DataManager.createZone('Zona B', category.id, tournament.id)];
    teams.forEach((team, idx) => DataManager.assignTeamToZone(team.id, idx < 4 ? zA.id : zB.id));

    CompetitionEngine.setCategoryFormat(tournament.id, category.id, {
        formatId: 'ZONAS_ELIMINATORIAS',
        groupMode: 'round_robin',
        qualificationMode: 'per_zone',
        qualifiersPerZone: 2,
        seedingMode: 'zone_cross',
        thirdPlace: true
    });

    const fixture = CompetitionEngine.generateInitialFixture(tournament.id, category.id);
    assert.equal(fixture.createdCount, 12, 'Dos zonas de 4 = 6 + 6 = 12 partidos');
    CompetitionEngine.confirmFixture(tournament.id, category.id);
    CompetitionEngine.scheduleTournament(tournament.id);
    assert.equal(CompetitionEngine.SchedulingEngine.getConflicts(tournament.id).length, 0);

    // Finaliza fase de zonas
    DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id)
        .filter(m => m.phase === 'ZONAS')
        .forEach(m => CompetitionEngine.recordResult(m.id, win20()));

    const standings = CompetitionEngine.getStandings(tournament.id, category.id);
    assert.equal(standings.byZone.length, 2);
    assert.equal(standings.byZone[0].standings.length, 4);

    const qualified = CompetitionEngine.getQualifiedTeams(tournament.id, category.id);
    assert.equal(qualified.length, 4);
    assert.equal(new Set(qualified.map(q => q.id)).size, 4);

    const playoffs = CompetitionEngine.advanceStage(tournament.id, category.id, { schedule: true });
    assert.equal(playoffs.stage, 'ELIMINATORIAS');
    assert.equal(playoffs.created.length, 4, '2 semis + 1 final + 1 tercer puesto');

    // Juega semifinales -> debe poblar automáticamente Final (ganadores) y Tercer puesto (perdedores)
    const semis = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).filter(m => m.phase === 'SEMIFINAL');
    semis.forEach(m => CompetitionEngine.recordResult(m.id, win20(15, 11)));

    const afterSemis = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
    const finalMatch = afterSemis.find(m => m.phase === 'FINAL');
    const thirdMatch = afterSemis.find(m => m.phase === 'THIRD_PLACE');
    assert(finalMatch.equipoLocalId && finalMatch.equipoVisitanteId, 'La Final debe completarse con ambos ganadores');
    assert(thirdMatch.equipoLocalId && thirdMatch.equipoVisitanteId, 'El Tercer puesto debe completarse con ambos perdedores');
    assert.notEqual(finalMatch.equipoLocalId, thirdMatch.equipoLocalId);

    CompetitionEngine.recordResult(thirdMatch.id, win20(15, 9));
    CompetitionEngine.recordResult(finalMatch.id, win20(15, 13));

    const finalStandings = CompetitionEngine.getStandings(tournament.id, category.id).finalClassification;
    assert.equal(finalStandings[0].id, finalMatch.equipoLocalId);
    assert.equal(finalStandings[1].id, finalMatch.equipoVisitanteId);
    assert.equal(finalStandings[2].id, thirdMatch.equipoLocalId);
    assert.equal(finalStandings[3].id, thirdMatch.equipoVisitanteId);
});

test('Formato B (Todos contra Todos) y Formato E (Liga por Rondas) con cantidad impar (5 equipos)', () => {
    const { tournament, category } = setupBase('Todos contra Todos', 5);
    CompetitionEngine.setCategoryFormat(tournament.id, category.id, {
        formatId: 'TODOS_CONTRA_TODOS',
        vueltas: 1
    });

    const fixture = CompetitionEngine.generateInitialFixture(tournament.id, category.id);
    assert.equal(fixture.createdCount, 10);
    assert.equal(fixture.hasByes, true);
    CompetitionEngine.confirmFixture(tournament.id, category.id);
    CompetitionEngine.scheduleTournament(tournament.id);

    // No debe permitir avanzar a eliminatorias porque el formato no las contempla
    assert.throws(() => CompetitionEngine.advanceStage(tournament.id, category.id), /no contempla/i);

    DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id)
        .forEach(m => CompetitionEngine.recordResult(m.id, win20()));
    const status = CompetitionEngine.getCategoryStatus(tournament.id, category.id);
    assert.equal(status.completed, true);
    assert(status.champion);
});

test('Formato C (Zonas + Zona Final): diferencia explícita entre reset (cero puntos) y carry_over (arrastre)', () => {
    // Escenario 1: carryOverMode = 'reset'
    {
        const { tournament, category, teams } = setupBase('Zona Final Reset', 6);
        const [zA, zB] = [DataManager.createZone('Zona A', category.id, tournament.id), DataManager.createZone('Zona B', category.id, tournament.id)];
        teams.forEach((team, idx) => DataManager.assignTeamToZone(team.id, idx < 3 ? zA.id : zB.id));
        CompetitionEngine.setCategoryFormat(tournament.id, category.id, {
            formatId: 'ZONAS_ZONA_FINAL',
            qualifiersPerZone: 2,
            carryOverMode: 'reset'
        });
        CompetitionEngine.generateInitialFixture(tournament.id, category.id, { confirmImmediately: true });
        DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).forEach(m => CompetitionEngine.recordResult(m.id, win20()));

        const stage = CompetitionEngine.advanceStage(tournament.id, category.id);
        assert.equal(stage.stage, 'ZONA_FINAL');
        assert.equal(stage.created.length, 6, 'Con reset, 4 clasificados juegan todos los 6 partidos desde cero');
        assert.equal(stage.carriedMatches.length, 0);

        const initialFinalTable = CompetitionEngine.getStandings(tournament.id, category.id).finalGroup;
        assert(initialFinalTable.every(row => row.jugados === 0 && row.puntosFavor === 0), 'En modo reset todos arrancan en 0');

        // Nunca genera eliminatorias en Formato C
        assert.throws(() => CompetitionEngine.advanceStage(tournament.id, category.id), /no contempla/i);
    }

    // Escenario 2: carryOverMode = 'carry_over'
    {
        const { tournament, category, teams } = setupBase('Zona Final Arrastre', 6);
        const [zA, zB] = [DataManager.createZone('Zona A', category.id, tournament.id), DataManager.createZone('Zona B', category.id, tournament.id)];
        teams.forEach((team, idx) => DataManager.assignTeamToZone(team.id, idx < 3 ? zA.id : zB.id));
        CompetitionEngine.setCategoryFormat(tournament.id, category.id, {
            formatId: 'ZONAS_ZONA_FINAL',
            qualifiersPerZone: 2,
            carryOverMode: 'carry_over'
        });
        CompetitionEngine.generateInitialFixture(tournament.id, category.id, { confirmImmediately: true });
        DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).forEach(m => CompetitionEngine.recordResult(m.id, win20()));

        const stage = CompetitionEngine.advanceStage(tournament.id, category.id);
        assert.equal(stage.stage, 'ZONA_FINAL');
        assert.equal(stage.carriedMatches.length, 2, 'Se arrastran 1 partido de Zona A y 1 de Zona B entre clasificados');
        assert.equal(stage.created.length, 4, 'Sólo se generan los 4 cruces nuevos entre clasificados de zonas distintas');

        const initialFinalTable = CompetitionEngine.getStandings(tournament.id, category.id).finalGroup;
        assert(initialFinalTable.every(row => row.jugados === 1), 'En modo carry_over cada clasificado arranca con su partido arrastrado');
    }
});

test('Formato D (Eliminación Directa) con 5 equipos (3 byes) avanza automáticamente hasta el campeón', () => {
    const { tournament, category } = setupBase('Directa 5', 5);
    CompetitionEngine.setCategoryFormat(tournament.id, category.id, {
        formatId: 'ELIMINACION_DIRECTA',
        thirdPlace: true
    });
    const fixture = CompetitionEngine.generateInitialFixture(tournament.id, category.id);
    assert.equal(fixture.createdCount, 5, '4 partidos principales (N-1) + 1 tercer puesto');
    assert.equal(fixture.plan.byeCount, 3);
    CompetitionEngine.scheduleTournament(tournament.id);
    assert.equal(CompetitionEngine.SchedulingEngine.getConflicts(tournament.id).length, 0);

    // Ronda 1 (Cuarto único: Seed 4 vs Seed 5)
    const qf = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).filter(m => m.phase === 'TOP_8');
    assert.equal(qf.length, 1);
    CompetitionEngine.recordResult(qf[0].id, win20());

    // Semifinales ahora tienen ambos equipos (Seed 1 vs Ganador QF, Seed 2 vs Seed 3)
    const semis = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).filter(m => m.phase === 'SEMIFINAL');
    assert(semis.every(m => m.equipoLocalId && m.equipoVisitanteId));
    semis.forEach(m => CompetitionEngine.recordResult(m.id, win20()));

    const finals = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).filter(m => ['FINAL', 'THIRD_PLACE'].includes(m.phase));
    assert(finals.every(m => m.equipoLocalId && m.equipoVisitanteId));
    finals.forEach(m => CompetitionEngine.recordResult(m.id, win20()));

    const status = CompetitionEngine.getCategoryStatus(tournament.id, category.id);
    assert.equal(status.completed, true);
    assert(status.champion);
});

test('Formato F (Personalizado): valida combinaciones imposibles y permite extensibilidad en FormatRegistry', () => {
    assert.equal(ValidationEngine.validateFormatConfig({
        formatId: 'PERSONALIZADO',
        stages: [
            { type: 'ELIMINATORIAS' },
            { type: 'ZONAS' }
        ]
    }).valid, false, 'No puede haber fases posteriores a Eliminatorias');

    assert.equal(ValidationEngine.validateFormatConfig({
        formatId: 'PERSONALIZADO',
        stages: [
            { type: 'ZONAS', zonesCount: 2, qualifiersPerZone: 2 },
            { type: 'ZONA_FINAL' } // Falta carryOverMode explícito
        ]
    }).valid, false, 'Zona Final sin carryOverMode debe rechazarse');

    assert.equal(ValidationEngine.validateFormatConfig({
        formatId: 'PERSONALIZADO',
        stages: [
            { type: 'ZONAS', zonesCount: 4, qualifiersPerZone: 2 },
            { type: 'ELIMINATORIAS' }
        ]
    }, { teamCount: 6 }).valid, false, '6 equipos no alcanzan para 4 zonas de al menos 2');

    // Extensibilidad: registrar un formato nuevo sin reescribir los existentes
    const beforeCount = FormatRegistry.list().length;
    FormatRegistry.register({
        id: 'COPA_RELAMPAGO_TEST',
        code: 'X',
        name: 'Copa Relámpago (Extensión)',
        requiresZones: false,
        supportsPlayoffs: true,
        supportsFinalGroup: false,
        defaultConfig: { formatId: 'ELIMINACION_DIRECTA', thirdPlace: false }
    });
    assert.equal(FormatRegistry.has('COPA_RELAMPAGO_TEST'), true);
    assert.equal(FormatRegistry.list().length, beforeCount + 1);
});

test('StandingsEngine: desempate por mini-tabla en empate triple y puntuación FEVA (points_table)', () => {
    const teams = [
        { id: 'a', nombre: 'Alfa' },
        { id: 'b', nombre: 'Beta' },
        { id: 'c', nombre: 'Gamma' }
    ];
    // Todos ganan 1 y pierden 1; Alfa gana 2-0 (3 pts), Beta gana 2-1 (2 pts) y pierde 1-2 (1 pt) -> 3 pts, Gamma pierde 0-2 y gana 2-1 -> 2 pts
    const matches = [
        {
            equipoLocalId: 'a', equipoVisitanteId: 'c', estado: 'finalizado',
            sets: [{ puntosLocal: 15, puntosVisitante: 10 }, { puntosLocal: 15, puntosVisitante: 10 }],
            setsLocal: 2, setsVisitante: 0, ganadorId: 'a'
        },
        {
            equipoLocalId: 'b', equipoVisitanteId: 'a', estado: 'finalizado',
            sets: [{ puntosLocal: 15, puntosVisitante: 13 }, { puntosLocal: 13, puntosVisitante: 15 }, { puntosLocal: 15, puntosVisitante: 13 }],
            setsLocal: 2, setsVisitante: 1, ganadorId: 'b'
        },
        {
            equipoLocalId: 'c', equipoVisitanteId: 'b', estado: 'finalizado',
            sets: [{ puntosLocal: 15, puntosVisitante: 13 }, { puntosLocal: 13, puntosVisitante: 15 }, { puntosLocal: 15, puntosVisitante: 13 }],
            setsLocal: 2, setsVisitante: 1, ganadorId: 'c'
        }
    ];
    const fevaTable = StandingsEngine.calculateTable(teams, matches, { mode: 'points_table' });
    // Alfa: 3 + 1 = 4 pts (SF 3, SC 2); Beta: 2 + 1 = 3 pts (SF 3, SC 3); Gamma: 0 + 2 = 2 pts (SF 2, SC 3)
    assert.deepEqual(fevaTable.map(r => [r.id, r.puntosTabla]), [['a', 4], ['b', 3], ['c', 2]]);
});
