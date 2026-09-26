// Se ejecuta dentro de la página (Electron) desde tests/smoke/app/main.mjs.
// Recorre el flujo real de Programación: emparejar, confirmar, programar,
// filtrar, cambiar de vista, guardar descansos y formato de sets; y luego
// carga un resultado en Resultados con el formato activo.
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
        blocksHint: text('.schedule-global-config .helper-text'),
        formatZones: document.querySelector('#set-format-form [name="zones"]')?.value,
        formatPlayoffs: document.querySelector('#set-format-form [name="playoffs"]')?.value
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

    // Los botones de Programación trabajan sobre la categoría activa. La otra
    // categoría se arma con los mismos servicios para que "Programar todos los
    // partidos" tenga las dos categorías compitiendo por el mismo día y canchas.
    await step('emparejar-resto', async () => {
        const { SchedulerService } = await import('/js/services/scheduler.js');
        const date = document.querySelector('#pairing-day')?.value || '2026-11-02';
        categories.forEach(category => {
            if (DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).length) return;
            SchedulerService.generarEmparejamientos(tournament.id, category.id, { date });
            SchedulerService.confirmarEmparejamientos(tournament.id, category.id);
        });
        await wait(250);
    });

    await step('programar', async () => {
        document.querySelector('#btn-generar-programacion').click();
        await wait(400);
        const cards = [...document.querySelectorAll('#fixture-list .fixture-match')];
        const slots = new Map();
        categories.forEach(category => DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id).forEach(match => {
            if (!match.fecha || !match.hora) return;
            const key = `${match.fecha} ${match.hora}`;
            const atSlot = slots.get(key) || new Set();
            atSlot.add(category.id);
            slots.set(key, atSlot);
        }));
        report.afterProgram = {
            cards: cards.length,
            withTime: cards.filter(card => /^\d{2}:\d{2}$/.test((card.querySelector('.fixture-cell-time strong')?.textContent || '').trim())).length,
            withCourt: cards.filter(card => /^Cancha/.test((card.querySelector('.fixture-cell-court strong')?.textContent || '').trim())).length,
            slots: slots.size,
            mixedSlots: [...slots.values()].filter(atSlot => atSlot.size === categories.length).length,
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

    await step('formato', async () => {
        const zonesSelect = () => document.querySelector('#set-format-form [name="zones"]');
        zonesSelect().value = 'two_sets_15';
        document.querySelector('#set-format-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await wait(350);
        let saved = DataManager.getTournamentSetFormats(tournament.id);
        report.formatSaved = { zones: saved.zones.key, playoffs: saved.playoffs.key, selectAfter: zonesSelect()?.value };
        zonesSelect().value = 'one_set_21';
        document.querySelector('#set-format-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await wait(350);
        report.formatRestored = DataManager.getTournamentSetFormats(tournament.id).zones.key;
    });

    await step('resultados', async () => {
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/resultados`;
        await wait(900);
        const cards = [...document.querySelectorAll('#resultados-list .set-result-card')];
        report.results = {
            active: document.getElementById('view-resultados').classList.contains('active'),
            cards: cards.length,
            formatHint: text('#view-resultados .helper-text'),
            firstFormat: cards[0]?.dataset.format || '',
            quickLegend: cards[0]?.querySelector('.quick-result-actions legend')?.textContent || '',
            quickButtons: cards[0] ? [...cards[0].querySelectorAll('.quick-result')].map(button => button.textContent.trim()) : []
        };
        cards[0]?.querySelector('.toggle-result-editor')?.click();
        await wait(150);
        report.results.editorRows = cards[0] ? cards[0].querySelectorAll('.set-points').length : 0;
        report.results.editorHint = cards[0]?.querySelector('.set-preview')?.textContent || '';
        const scoredId = cards[0]?.dataset.id;
        cards[0]?.querySelector('.quick-result')?.click();
        await wait(350);
        const scored = categories
            .flatMap(category => DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id))
            .find(match => match.id === scoredId);
        report.results.scored = scored ? { sets: scored.sets.length, score: scored.score, estado: scored.estado } : null;
        report.results.finishedCards = count('#resultados-list .set-result-card.is-finished');
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/programacion`;
        await wait(700);
        report.results.backToSchedule = document.getElementById('view-programacion').classList.contains('active');
    });

    await step('exportar', async () => {
        const before = report.alerts.length;
        document.querySelector('#export-fixture-day').click();
        await wait(200);
        report.dayExportWithoutDate = report.alerts.slice(before).join(' | ');
        document.querySelector('#export-fixture-full').click();
        await wait(800);
    });

    await step('dos-sets', async () => {
        const zonesSelect = document.querySelector('#set-format-form [name="zones"]');
        zonesSelect.value = 'two_sets_15';
        document.querySelector('#set-format-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await wait(350);
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/resultados`;
        await wait(900);
        const card = document.querySelector('#resultados-list .set-result-card:not(.is-finished)');
        report.twoSets = {
            format: card?.dataset.format || '',
            legend: card?.querySelector('.quick-result-actions legend')?.textContent || '',
            buttons: card ? [...card.querySelectorAll('.quick-result')].map(button => button.textContent.trim()) : []
        };
        card?.querySelector('.toggle-result-editor')?.click();
        await wait(200);
        const rows = card ? [...card.querySelectorAll('.set-points')] : [];
        report.twoSets.editorRows = rows.length;
        report.twoSets.labels = rows.map(row => row.querySelector('span').textContent.trim());
        if (rows.length === 3) {
            rows[0].querySelector('[data-side="local"]').value = '15';
            rows[0].querySelector('[data-side="visitante"]').value = '14';
            fire(rows[0].querySelector('[data-side="local"]'), 'input');
            rows[1].querySelector('[data-side="local"]').value = '14';
            rows[1].querySelector('[data-side="visitante"]').value = '15';
            fire(rows[1].querySelector('[data-side="local"]'), 'input');
            report.twoSets.preview = card.querySelector('.set-preview').textContent.trim();
        }
        const scoredId = card?.dataset.id;
        card?.querySelector('.quick-result[data-result="local-20"]')?.click();
        await wait(450);
        const scored = categories
            .flatMap(category => DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id))
            .find(match => match.id === scoredId);
        report.twoSets.scored = scored ? { sets: scored.sets.length, score: scored.score, estado: scored.estado } : null;
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/programacion`;
        await wait(800);
        const restoreSelect = document.querySelector('#set-format-form [name="zones"]');
        restoreSelect.value = 'one_set_21';
        document.querySelector('#set-format-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await wait(350);
        report.twoSets.restored = DataManager.getTournamentSetFormats(tournament.id).zones.key;
    });

    await step('zonas', async () => {
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/zonas`;
        await wait(900);
        const zoneList = DataManager.getZonesByTournamentAndCategory(tournament.id, categories[0].id);
        const toggle = document.querySelector(`.zone-round-robin[data-zone="${zoneList[0].id}"]`);
        report.zones = {
            active: document.getElementById('view-zonas').classList.contains('active'),
            toggles: count('.zone-round-robin'),
            formToggle: count('#zona-todos-contra-todos'),
            before: zoneList.length
        };
        toggle.checked = true;
        fire(toggle, 'change');
        await wait(500);
        report.roundRobin = {
            stored: DataManager.getZonesByTournamentAndCategory(tournament.id, categories[0].id)[0].todosContraTodos,
            chips: [...document.querySelectorAll('.zone-card .calendar-chip')].map(node => node.textContent.trim()).join(' | '),
            toggleAfter: document.querySelector(`.zone-round-robin[data-zone="${zoneList[0].id}"]`)?.checked === true
        };
        const alertsBefore = report.alerts.length;
        document.querySelector('#zona-nombre').value = 'Zona Nueva';
        document.querySelector('#zona-todos-contra-todos').checked = true;
        document.querySelector('#form-nueva-zona').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await wait(500);
        const zonesNow = DataManager.getZonesByTournamentAndCategory(tournament.id, categories[0].id);
        report.zones.created = {
            count: zonesNow.length,
            flag: zonesNow.find(zone => zone.nombre === 'Zona Nueva')?.todosContraTodos === true,
            names: [...document.querySelectorAll('.zone-card h3')].map(node => node.textContent.trim()).join(' | '),
            alerts: report.alerts.slice(alertsBefore).join(' | ')
        };
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/programacion`;
        await wait(900);
        report.roundRobin.avisos = text('.schedule-zone-avisos');
        report.roundRobin.backToSchedule = document.getElementById('view-programacion').classList.contains('active');
    });

    await step('eliminatorias', async () => {
        const categoryTeams = DataManager.getTeamsByTournamentAndCategory(tournament.id, categories[0].id);
        const categoryZone = DataManager.getZonesByTournamentAndCategory(tournament.id, categories[0].id)[0];
        const created = DataManager.addMatches([{
            torneoId: tournament.id, categoriaId: categories[0].id, zonaId: categoryZone.id,
            tipo: 'semifinal', phase: 'SEMIFINAL',
            equipoLocalId: categoryTeams[0].id, equipoVisitanteId: categoryTeams[1].id,
            fecha: null, hora: null, cancha: null, orden: 9, estado: 'pendiente', confirmado: true
        }])[0];
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/resultados`;
        await wait(900);
        const card = document.querySelector(`#resultados-list .set-result-card[data-id="${created.id}"]`);
        report.playoffs = {
            found: Boolean(card),
            format: card?.dataset.format || '',
            legend: card?.querySelector('.quick-result-actions legend')?.textContent || '',
            buttons: card ? [...card.querySelectorAll('.quick-result')].map(button => button.textContent.trim()) : [],
            zonesFormat: DataManager.getTournamentSetFormats(tournament.id).zones.key
        };
        card?.querySelector('.quick-result[data-result="local-20"]')?.click();
        await wait(450);
        const scored = DataManager.getMatchesByTournamentAndCategory(tournament.id, categories[0].id).find(match => match.id === created.id);
        report.playoffs.scored = scored ? { sets: scored.sets.length, score: scored.score, estado: scored.estado } : null;
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/programacion`;
        await wait(900);
    });

    await step('posiciones', async () => {
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/posiciones`;
        await wait(900);
        report.standings = {
            active: document.getElementById('view-posiciones').classList.contains('active'),
            rows: count('.standings-table tbody tr'),
            hasButton: Boolean(document.querySelector('#export-standings')),
            columns: count('.standings-table thead th')
        };
        document.querySelector('#export-standings')?.click();
        await wait(400);
        location.hash = `#/torneo/${encodeURIComponent(tournament.id)}/programacion`;
        await wait(900);
        report.standings.backToSchedule = document.getElementById('view-programacion').classList.contains('active');
    });

    await step('limpiar', async () => {
        const before = report.alerts.length;
        document.querySelector('#btn-limpiar-programacion').click();
        await wait(400);
        const matches = categories.flatMap(category => DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id));
        report.limpiar = {
            alerts: report.alerts.slice(before).join(' | '),
            scheduled: matches.filter(match => match.fecha && match.hora && match.cancha).length,
            finished: matches.filter(match => match.estado === 'finalizado' && match.fecha && match.hora && match.cancha).length,
            pendingLeft: matches.filter(match => match.estado !== 'finalizado' && (match.fecha || match.hora || match.cancha)).length,
            cards: count('#fixture-list .fixture-match'),
            sinHorario: [...document.querySelectorAll('#fixture-list .fixture-cell-time strong')].filter(node => node.textContent.trim() === 'Sin horario').length
        };
    });

    report.tournamentId = tournament.id;
    return report;
})()
