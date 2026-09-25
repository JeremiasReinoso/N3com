import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);
export const PHASE_LABELS = { ZONAS: 'Fase de zonas', ALL_VS_ALL: 'Cruces', TOP_16: 'Octavos', TOP_8: 'Cuartos de final', SEMIFINAL: 'Semifinales', THIRD_PLACE: 'Tercer puesto', FINAL: 'Final' };
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatDay = date => date ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${date}T12:00:00`)) : 'Sin fecha asignada';
const matchPhase = match => match.phase || 'ZONAS';
const compareMatches = (left, right) => String(left.fecha || '9999').localeCompare(String(right.fecha || '9999'))
    || String(left.hora || '99:99').localeCompare(String(right.hora || '99:99'))
    || Number(left.orden || Number.MAX_SAFE_INTEGER) - Number(right.orden || Number.MAX_SAFE_INTEGER)
    || String(left.cancha || '').localeCompare(String(right.cancha || ''), 'es', { numeric: true });

export const filterFixtureMatches = (matches, filters = {}) => matches.filter(match => (
    (!filters.date || match.fecha === filters.date)
    && (!filters.categoryId || match.categoriaId === filters.categoryId)
    && (!filters.phase || matchPhase(match) === filters.phase)
    && (!filters.zoneId || match.zonaId === filters.zoneId)
    && (!filters.court || match.cancha === filters.court)
));

const option = (value, label, selected = false) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

export const initScheduleView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const view = document.getElementById('view-programacion');
    const activeCategoryId = AppState.getCategory();
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    const activeCategory = activeCategoryId ? DataManager.getCategory(activeCategoryId) : null;
    if (!tournament || !activeCategory || activeCategory.torneoId !== tournamentId) {
        view.innerHTML = '<h2>Programación y fixture</h2><div class="empty-state">Seleccione un torneo y una categoría desde Equipos.</div>';
        return;
    }

    const categories = DataManager.getCategoriesByTournament(tournamentId);
    const allTeams = categories.flatMap(category => DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id));
    const allZones = categories.flatMap(category => DataManager.getZonesByTournamentAndCategory(tournamentId, category.id));
    const allMatches = categories.flatMap(category => DataManager.getMatchesByTournamentAndCategory(tournamentId, category.id));
    const activeMatches = allMatches.filter(match => match.categoriaId === activeCategoryId);
    const drafts = activeMatches.filter(match => !isOfficialMatch(match));
    const official = allMatches.filter(isOfficialMatch).sort(compareMatches);
    const activeTeams = allTeams.filter(team => team.categoriaId === activeCategoryId);
    const calendarDates = DataManager.getCalendarDates(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, activeCategoryId);
    const planningDays = planning?.days?.filter(day => calendarDates.includes(day.date)) || calendarDates.map(date => ({ date, stages: [] }));
    const courtCount = DataManager.getTournamentCourtCount(tournamentId);
    const courts = Array.from({ length: courtCount }, (_, index) => `Cancha ${index + 1}`);
    const teamName = id => allTeams.find(team => team.id === id)?.nombre || 'Equipo no disponible';
    const categoryName = id => categories.find(category => category.id === id)?.nombre || 'Sin categoría';
    const zoneName = id => allZones.find(zone => zone.id === id)?.nombre || 'Sin zona';
    const activeTeamOptions = selected => activeTeams.map(team => option(team.id, team.nombre, team.id === selected)).join('');
    const courtOptions = selected => courts.map(court => option(court, court, court === selected)).join('');
    const dateOptions = selected => `${selected && !calendarDates.includes(selected) ? option(selected, `${formatDay(selected)} · fuera del calendario`, true) : ''}${calendarDates.map(date => option(date, formatDay(date), date === selected)).join('')}`;
    const stageSummary = day => day.stages?.length ? day.stages.map(stage => PHASE_LABELS[stage] || (stage === 'GARANTIZADOS' ? 'Partidos garantizados' : stage)).join(' · ') : 'Sin etapas configuradas';

    view.innerHTML = `
        <div class="fixture-heading"><div><span class="eyebrow">ORGANIZACIÓN DEL TORNEO</span><h2>Programación y fixture</h2><p>Emparejamientos crea los partidos; Programación organiza esos mismos registros; Resultados los actualiza sin duplicarlos.</p></div><button id="print-fixture" class="btn-secondary" type="button">Imprimir fixture</button></div>
        <section class="pairing-context panel-control">
            <div class="form-title"><div><h3>Emparejamientos — ${escapeHtml(activeCategory.nombre)}</h3><p>Elegí una jornada. Sólo podrás generar etapas habilitadas en su planificación.</p></div><span class="calendar-chip">${planning ? 'PLANIFICADA' : 'SIN PLANIFICAR'}</span></div>
            ${!planning ? '<div class="planning-notice">Esta categoría todavía no tiene una planificación configurada. Se conserva el flujo compatible del torneo existente.</div>' : ''}
            <div class="pairing-day-selector"><label class="form-field">Jornada<select id="pairing-day">${planningDays.map(day => option(day.date, `${formatDay(day.date)} — ${stageSummary(day)}`)).join('')}</select></label><div id="pairing-day-context" class="pairing-day-context"></div></div>
            <div class="form-grid"><label class="form-field">Canchas disponibles<input id="cantidad-canchas" type="number" min="1" max="20" value="${courtCount}"></label><div class="form-actions"><button id="guardar-canchas" class="btn-secondary" type="button">Guardar canchas</button><button id="btn-generar-emparejamientos" class="btn-primary" type="button">Generar emparejamientos</button><button id="btn-confirmar-emparejamientos" class="btn-primary" type="button">Confirmar emparejamientos</button></div></div>
            <details class="schedule-editor"><summary>+ Crear partido manual de zona</summary><form id="manual-group-match-form"><div class="form-grid"><label class="form-field">Equipo A<select name="local" required><option value="">Seleccionar</option>${activeTeamOptions('')}</select></label><label class="form-field">Equipo B<select name="visitante" required><option value="">Seleccionar</option>${activeTeamOptions('')}</select></label><label class="form-field">Fecha<select name="fecha" required>${dateOptions(planningDays[0]?.date)}</select></label><label class="form-field">Hora<input name="hora" type="time" required></label><label class="form-field">Cancha<select name="cancha" required><option value="">Seleccionar</option>${courtOptions('')}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1"></label></div><p class="helper-text">Sólo acepta dos equipos de esta categoría y de la misma zona.</p><button class="btn-secondary" type="submit">Crear partido manual</button></form></details>
        </section>
        <section class="fixture-preview"><div class="schedule-board-head"><div><h3>Previsualización antes de confirmar</h3><p>Revisá los cruces. Todavía no aparecen en Resultados hasta confirmarlos.</p></div><span class="calendar-chip">${drafts.length} BORRADORES</span></div><div class="draft-fixture-list">${drafts.length ? drafts.map(match => `<div class="draft-fixture-row"><span>${escapeHtml(formatDay(match.fecha))} · ${escapeHtml(zoneName(match.zonaId))}</span><strong>${escapeHtml(teamName(match.equipoLocalId))} <b>vs</b> ${escapeHtml(teamName(match.equipoVisitanteId))}</strong><button type="button" class="eliminar-borrador btn-secondary" data-id="${match.id}">Quitar</button></div>`).join('') : '<div class="empty-state compact">No hay emparejamientos pendientes de confirmación.</div>'}</div></section>
        <section class="fixture-board" aria-label="Fixture del torneo">
            <div class="schedule-board-head"><div><h3>Fixture final</h3><p>Vista jerárquica por día, etapa, categoría y zona.</p></div><div class="fixture-view-toggle"><button class="btn-secondary active" data-view-mode="hierarchy" type="button">Por etapas</button><button class="btn-secondary" data-view-mode="day" type="button">Por día</button></div></div>
            <div class="fixture-filters"><label>Día<select id="fixture-filter-date"><option value="">Todos los días</option>${calendarDates.map(date => option(date, formatDay(date))).join('')}<option value="__none">Sin fecha</option></select></label><label>Categoría<select id="fixture-filter-category"><option value="">Todas</option>${categories.map(category => option(category.id, category.nombre)).join('')}</select></label><label>Etapa<select id="fixture-filter-phase"><option value="">Todas</option>${Object.entries(PHASE_LABELS).map(([value, label]) => option(value, label)).join('')}</select></label><label>Zona<select id="fixture-filter-zone"><option value="">Todas</option>${allZones.map(zone => option(zone.id, `${categoryName(zone.categoriaId)} · ${zone.nombre}`)).join('')}</select></label><label>Cancha<select id="fixture-filter-court"><option value="">Todas</option>${courts.map(court => option(court, court)).join('')}</select></label><button id="clear-fixture-filters" class="btn-secondary" type="button">Limpiar filtros</button></div>
            <div id="fixture-list" class="fixture-list" aria-live="polite"></div>
        </section>`;

    const selectedPairingDay = () => view.querySelector('#pairing-day')?.value || '';
    const renderPairingContext = () => {
        const date = selectedPairingDay();
        const day = planningDays.find(item => item.date === date);
        const hasZoneStage = !planning || day?.stages?.some(stage => ['ZONAS', 'GARANTIZADOS'].includes(stage));
        view.querySelector('#pairing-day-context').innerHTML = `<strong>${escapeHtml(formatDay(date))}</strong><span>${escapeHtml(stageSummary(day || { stages: [] }))}</span>${hasZoneStage ? '<small>Fase de zonas habilitada para generar.</small>' : '<small class="warning-text">Esta jornada no habilita partidos de zona.</small>'}`;
        view.querySelector('#btn-generar-emparejamientos').disabled = !date || !hasZoneStage;
    };

    const matchEditor = match => {
        if (match.estado === 'finalizado') return '';
        const teams = allTeams.filter(team => team.categoriaId === match.categoriaId);
        return `<details class="schedule-editor"><summary>Editar programación</summary><form class="schedule-match-form" data-id="${match.id}"><div class="form-grid"><label class="form-field">Local<select name="local" required>${teams.map(team => option(team.id, team.nombre, team.id === match.equipoLocalId)).join('')}</select></label><label class="form-field">Visitante<select name="visitante" required>${teams.map(team => option(team.id, team.nombre, team.id === match.equipoVisitanteId)).join('')}</select></label><label class="form-field">Fecha<select name="fecha" required>${dateOptions(match.fecha)}</select></label><label class="form-field">Hora<input name="hora" type="time" required value="${escapeHtml(match.hora || '')}"></label><label class="form-field">Cancha<select name="cancha" required>${courtOptions(match.cancha)}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1" value="${escapeHtml(match.orden || '')}"></label></div><p class="helper-text">Se modifica el mismo partido que utilizan Fixture y Resultados.</p><div class="form-actions"><button class="btn-primary" type="submit">Guardar cambios</button><button class="eliminar-partido btn-secondary" type="button" data-id="${match.id}">Eliminar</button></div></form></details>`;
    };
    const matchCard = match => `<article class="fixture-match ${match.estado === 'finalizado' ? 'is-finished' : ''}" data-match-id="${match.id}"><div class="fixture-match-slot"><strong>${escapeHtml(match.hora || 'Horario pendiente')}</strong><span>${escapeHtml(match.cancha || 'Cancha por definir')}${match.orden ? ` · Orden ${match.orden}` : ''}</span></div><div class="fixture-match-context"><span>${escapeHtml(categoryName(match.categoriaId))}${matchPhase(match) === 'ZONAS' ? ` · ${escapeHtml(zoneName(match.zonaId))}` : ''}</span><div class="fixture-teams"><strong>${escapeHtml(teamName(match.equipoLocalId))}</strong><b>vs</b><strong>${escapeHtml(teamName(match.equipoVisitanteId))}</strong></div></div><span class="match-status ${match.estado === 'finalizado' ? 'finished' : 'pending'}">${match.estado === 'finalizado' ? `${match.setsLocal}–${match.setsVisitante} · JUGADO` : 'PENDIENTE'}</span>${matchEditor(match)}</article>`;

    let viewMode = 'hierarchy';
    const bindEditorActions = () => {
        view.querySelectorAll('.schedule-match-form').forEach(form => form.addEventListener('submit', event => {
            event.preventDefault();
            try {
                const current = allMatches.find(match => match.id === form.dataset.id);
                const values = new FormData(form);
                DataManager.updateMatches([{ ...current, equipoLocalId: values.get('local'), equipoVisitanteId: values.get('visitante'), fecha: values.get('fecha'), hora: values.get('hora'), cancha: values.get('cancha'), orden: values.get('orden') ? Number(values.get('orden')) : null }]);
                initScheduleView();
            } catch (error) { alert(error.message); }
        }));
        view.querySelectorAll('.eliminar-partido').forEach(button => button.addEventListener('click', () => {
            if (!window.confirm('¿Eliminar este partido pendiente? Esta acción no afecta otros partidos.')) return;
            try { DataManager.removeMatch(button.dataset.id); initScheduleView(); } catch (error) { alert(error.message); }
        }));
    };
    const renderFixture = () => {
        const dateValue = view.querySelector('#fixture-filter-date').value;
        const filters = { date: dateValue === '__none' ? '' : dateValue, categoryId: view.querySelector('#fixture-filter-category').value, phase: view.querySelector('#fixture-filter-phase').value, zoneId: view.querySelector('#fixture-filter-zone').value, court: view.querySelector('#fixture-filter-court').value };
        let visible = filterFixtureMatches(official, filters);
        if (dateValue === '__none') visible = visible.filter(match => !match.fecha);
        const list = view.querySelector('#fixture-list');
        if (!visible.length) { list.innerHTML = '<div class="empty-state">No hay partidos que coincidan con estos filtros.</div>'; return; }
        const byDate = Map.groupBy(visible, match => match.fecha || '');
        list.innerHTML = [...byDate.entries()].map(([date, dayMatches]) => {
            const dayTitle = `<header class="fixture-day-header"><div><span>${date ? 'JORNADA' : 'PENDIENTE'}</span><h4>${escapeHtml(formatDay(date))}</h4></div><strong>${dayMatches.length} partido${dayMatches.length === 1 ? '' : 's'}</strong></header>`;
            if (viewMode === 'day') return `<section class="fixture-day">${dayTitle}<div class="fixture-day-cards">${dayMatches.map(matchCard).join('')}</div></section>`;
            const byPhase = Map.groupBy(dayMatches, matchPhase);
            return `<section class="fixture-day">${dayTitle}${[...byPhase.entries()].map(([phase, phaseMatches]) => `<section class="fixture-stage"><h5>${escapeHtml(PHASE_LABELS[phase] || phase)}</h5>${[...Map.groupBy(phaseMatches, match => match.categoriaId).entries()].map(([categoryId, categoryMatches]) => `<section class="fixture-category"><h6>${escapeHtml(categoryName(categoryId))}</h6>${[...Map.groupBy(categoryMatches, match => phase === 'ZONAS' ? match.zonaId : '').entries()].map(([zoneId, zoneMatches]) => `<div class="fixture-zone">${phase === 'ZONAS' ? `<strong class="fixture-zone-title">${escapeHtml(zoneName(zoneId))}</strong>` : ''}${zoneMatches.map(matchCard).join('')}</div>`).join('')}</section>`).join('')}</section>`).join('')}</section>`;
        }).join('');
        bindEditorActions();
    };

    view.querySelector('#pairing-day')?.addEventListener('change', renderPairingContext);
    renderPairingContext();
    view.querySelectorAll('.eliminar-borrador').forEach(button => button.addEventListener('click', () => { try { DataManager.removeMatch(button.dataset.id); initScheduleView(); } catch (error) { alert(error.message); } }));
    view.querySelector('#guardar-canchas').addEventListener('click', () => { try { DataManager.setTournamentCourtCount(tournamentId, view.querySelector('#cantidad-canchas').value); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelector('#btn-generar-emparejamientos').addEventListener('click', () => {
        try { const date = selectedPairingDay(); const created = SchedulerService.generarEmparejamientos(tournamentId, activeCategoryId, { date }); alert(`${created} emparejamiento${created === 1 ? '' : 's'} creado${created === 1 ? '' : 's'} para ${formatDay(date)}. Revisalos antes de confirmar.`); initScheduleView(); }
        catch (error) { alert(error.message); }
    });
    view.querySelector('#btn-confirmar-emparejamientos').addEventListener('click', () => {
        try { const check = SchedulerService.verificarPartidosAsegurados(tournamentId, activeCategoryId); if (!check.ok) throw new Error(check.mensaje); const confirmed = SchedulerService.confirmarEmparejamientos(tournamentId, activeCategoryId); if (confirmed) SchedulerService.programarEmparejamientos(tournamentId, activeCategoryId); alert(`${confirmed} partido${confirmed === 1 ? '' : 's'} confirmado${confirmed === 1 ? '' : 's'}. Ya ${confirmed === 1 ? 'está' : 'están'} en Resultados.`); initScheduleView(); }
        catch (error) { alert(error.message); }
    });
    view.querySelector('#manual-group-match-form').addEventListener('submit', event => {
        event.preventDefault();
        try { const values = new FormData(event.currentTarget); const local = activeTeams.find(team => team.id === values.get('local')); DataManager.createManualMatch({ torneoId: tournamentId, categoriaId: activeCategoryId, zonaId: local?.zonaId, tipo: 'fase_zonas', phase: 'ZONAS', equipoLocalId: values.get('local'), equipoVisitanteId: values.get('visitante'), fecha: values.get('fecha'), hora: values.get('hora'), cancha: values.get('cancha'), orden: values.get('orden') ? Number(values.get('orden')) : null }); initScheduleView(); }
        catch (error) { alert(error.message); }
    });
    view.querySelectorAll('.fixture-filters select').forEach(select => select.addEventListener('change', renderFixture));
    view.querySelector('#clear-fixture-filters').addEventListener('click', () => { view.querySelectorAll('.fixture-filters select').forEach(select => { select.value = ''; }); renderFixture(); });
    view.querySelectorAll('[data-view-mode]').forEach(button => button.addEventListener('click', () => { viewMode = button.dataset.viewMode; view.querySelectorAll('[data-view-mode]').forEach(item => item.classList.toggle('active', item === button)); renderFixture(); }));
    view.querySelector('#print-fixture').addEventListener('click', () => window.print());
    renderFixture();
};
