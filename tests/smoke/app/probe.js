// Se ejecuta dentro de la página (Electron) desde tests/smoke/app/main.mjs.
// Recorre el flujo real de Programación: emparejar, confirmar, programar,
// filtrar, cambiar de vista, guardar descansos y exportar.
(async () => {
    const report = { alerts: [], errors: [] };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const count = selector => document.querySelectorAll(selector).length;
    const text = selector => (document.querySelector(selector)?.textContent || '').trim();
    const fire = (element, type) => element.dispatchEvent(new Event(type, { bubbles: true }));
    const step = async (name, callback) => {
        try { await callback(); }
        catch (error) { report.errors.push(`${name}: ${error && error.message ? error.message : error}`); }
    };

    window.addEventListener('error', event => report.errors.push(String(event.message || event.error || 'error')));
    window.addEventListener('unhandledrejection', event => report.errors.push(String(event.reason)));
    window.alert = message => report.alerts.push(String(message));
    window.confirm = () => true;
    window.print = () => report.alerts.push('print()');

    const { DataManager } = await import('/js/data/dataManager.js');
    const tournament = DataManager.createTournament('Torneo Smoke Programacion', 1);
    DataManager.setTournamentCalendar(tournament.id, '2026-11-02', '2026-11-05', '08:00', '10:00', []);
    DataManager.setTournamentCourts(tournament.id, [{ id: 'c1', name: 'Cancha 1' }, { id: 'c2', name: 'Cancha 2' }]);
    DataManager.setTournamentSchedulingSettings(tournament.id, 30, 0, 30);
    const categories = DataManager.createCategories(['+40 Femenino', '+50 Masculino'], tournament.id);
    categories.forEach(category => DataManager.setCategoryPlanning(tournament.id, category.id, [
        { date: '2026-11-02', stages: ['ZONAS'] },
        { date: '2026-11-03', stages: ['ZONAS'] }
    ]));
    categories.forEach(category => {
        const zone = DataManager.createZone('Zona A', category.id, tournament.id);
        ['A', 'B', 'C', 'D'].forEach(letter => {
            const team = DataManager.createTeam(`${category.nombre} Equipo ${letter}`, category.id, tournament.id);
            DataManager.assignTeamToZone(team.id, zone.id);
        });
    });

    location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/programacion`;
    await wait(900);

    report.initial = {
        viewActive: document.getElementById('view-programacion').classList.contains('active'),
        restInputs: count('[data-rest-category]'),
        courts: count('.court-config-row'),
        drafts: count('.draft-fixture-row'),
        emptyDrafts: text('.draft-fixture-list').includes('No hay emparejamientos pendientes'),
        cards: count('#fixture-list .fixture-match'),
        statusChip: text('.schedule-conflicts .match-status'),
        pairDayOptions: count('#pairing-day option'),
        blocksHint: text('.schedule-global-config .helper-text')
    };

    await step('emparejar', async () => {
        document.querySelector('#btn-generar-emparejamientos').click();
        await wait(250);
        report.afterPairing = { drafts: count('.draft-fixture-row'), cards: count('#fixture-list .fixture-match') };
    });

    await step('confirmar', async () => {
        document.querySelector('#btn-confirmar-emparejamientos').click();
        await wait(250);
        report.afterConfirm = {
            drafts: count('.draft-fixture-row'),
            cards: count('#fixture-list .fixture-match'),
            statusChip: text('.schedule-conflicts .match-status'),
            conflictGroups: count('.conflict-group'),
            conflictSample: text('.conflict-groups').slice(0, 160)
        };
    });

    await step('programar', async () => {
        document.querySelector('#btn-generar-programacion').click();
        await wait(400);
        const cards = [...document.querySelectorAll('#fixture-list .fixture-match')];
        report.afterProgram = {
            cards: cards.length,
            withTime: cards.filter(card => /^\d{2}:\d{2}$/.test((card.querySelector('.fixture-cell-time strong')?.textContent || '').trim())).length,
            withCourt: cards.filter(card => /^Cancha/.test((card.querySelector('.fixture-cell-court strong')?.textContent || '').trim())).length,
            statusChip: text('.schedule-conflicts .match-status'),
            conflictText: text('.schedule-conflicts p')
        };
    });

    await step('filtros', async () => {
        const dateSelect = document.querySelector('#fixture-filter-date');
        dateSelect.value = '2026-11-02';
        fire(dateSelect, 'change');
        await wait(200);
        report.filterDay = count('#fixture-list .fixture-match');
        const courtSelect = document.querySelector('#fixture-filter-court');
        courtSelect.value = 'c1';
        fire(courtSelect, 'change');
        await wait(200);
        report.filterDayCourt = count('#fixture-list .fixture-match');
        document.querySelector('#clear-fixture-filters').click();
        await wait(200);
        dateSelect.value = '2026-11-05';
        fire(dateSelect, 'change');
        await wait(200);
        report.filterOtherDay = count('#fixture-list .fixture-match');
        report.filterOtherDayMessage = text('#fixture-list');
        document.querySelector('#clear-fixture-filters').click();
        await wait(200);
        report.filterCleared = count('#fixture-list .fixture-match');
    });

    await step('vistas', async () => {
        document.querySelector('[data-view-mode="court"]').click();
        await wait(200);
        report.courtView = {
            headers: [...document.querySelectorAll('.fixture-day-header > div > span')].map(node => node.textContent.trim()),
            groups: count('.fixture-day')
        };
        document.querySelector('[data-view-mode="day"]').click();
        await wait(200);
        report.dayHeaders = [...document.querySelectorAll('.fixture-day-header > div > span')].map(node => node.textContent.trim());
    });

    await step('descanso', async () => {
        [...document.querySelectorAll('[data-rest-category]')].forEach(input => { input.value = '1'; });
        document.querySelector('#block-config-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await wait(350);
        report.restSaved = categories.map(category => ({ category: category.nombre, value: DataManager.getCategoryRestBlocks(category.id) }));
    });

    await step('exportar', async () => {
        const before = report.alerts.length;
        document.querySelector('#export-fixture-day').click();
        await wait(200);
        report.dayExportWithoutDate = report.alerts.slice(before).join(' | ');
        document.querySelector('#export-fixture-full').click();
        await wait(800);
    });

    report.tournamentId = tournament.id;
    return report;
})()
