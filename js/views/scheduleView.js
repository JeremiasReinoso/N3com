import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';
import { SchedulerService } from '../services/scheduler.js';
import { LogisticsService, fixtureCompare } from '../services/logistics.js';
import { downloadFixturePdf, fixtureRows } from '../services/fixturePdf.js';

const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'confirmado', 'en_juego', 'finalizado'].includes(match.estado);
export const PHASE_LABELS = { ZONAS: 'Fase de zonas', ALL_VS_ALL: 'Cruces', TOP_16: 'Octavos', TOP_8: 'Cuartos de final', SEMIFINAL: 'Semifinales', THIRD_PLACE: 'Tercer puesto', FINAL: 'Final' };
const STATUS_LABELS = { borrador: 'Sin programar', pendiente: 'Confirmado', programado: 'Programado', confirmado: 'Confirmado', en_juego: 'En juego', finalizado: 'Finalizado' };
export const CONFLICT_LABELS = {
    court: 'Conflictos de cancha',
    team: 'Conflictos de equipos',
    rest: 'Descanso insuficiente',
    planning: 'Jornada o etapa no habilitada',
    'no-date': 'Partidos sin día',
    'no-time': 'Partidos sin horario',
    'no-court': 'Partidos sin cancha',
    unscheduled: 'Partidos sin programar'
};
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatDay = date => date ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${date}T12:00:00`)) : 'Sin fecha asignada';
const matchPhase = match => match.phase || 'ZONAS';
const categoryParts = category => {
    const name = category?.nombre || 'Sin categoría';
    const age = category?.edad || name.match(/\+\s*\d+/)?.[0]?.replace(/\s/g, '') || name;
    const modality = category?.modalidad || name.match(/femenino|masculino|mixto/i)?.[0] || '';
    return { age, modality: modality ? modality[0].toUpperCase() + modality.slice(1).toLowerCase() : '', name };
};

export const filterFixtureMatches = (matches, filters = {}) => matches.filter(match => (
    (!filters.date || match.fecha === filters.date)
    && (!filters.categoryId || match.categoriaId === filters.categoryId)
    && (!filters.modality || filters.modality === categoryParts(filters.categories?.find(category => category.id === match.categoriaId)).modality)
    && (!filters.phase || matchPhase(match) === filters.phase)
    && (!filters.zoneId || match.zonaId === filters.zoneId)
    && (!filters.court || match.cancha === filters.court || match.courtId === filters.court)
    && (!filters.status || match.estado === filters.status)
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
        view.innerHTML = '<h2>Programación y fixture general</h2><div class="empty-state">Seleccione un torneo y una categoría desde Equipos.</div>';
        return;
    }

    const categories = DataManager.getCategoriesByTournament(tournamentId);
    const allTeams = categories.flatMap(category => DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id));
    const allZones = categories.flatMap(category => DataManager.getZonesByTournamentAndCategory(tournamentId, category.id));
    const allMatches = LogisticsService.getTournamentMatches(tournamentId);
    const activeMatches = allMatches.filter(match => match.categoriaId === activeCategoryId);
    const drafts = activeMatches.filter(match => !isOfficialMatch(match));
    const official = allMatches.filter(isOfficialMatch).sort(fixtureCompare);
    const activeTeams = allTeams.filter(team => team.categoriaId === activeCategoryId);
    const calendarDates = DataManager.getCalendarDates(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, activeCategoryId);
    const planningDays = planning?.days?.filter(day => calendarDates.includes(day.date)) || calendarDates.map(date => ({ date, stages: [] }));
    const courts = DataManager.getTournamentCourts(tournamentId);
    const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
    const setFormats = DataManager.getTournamentSetFormats(tournamentId);
    const setFormatOptions = selected => DataManager.getSetFormatOptions().map(item => option(item.key, item.label, item.key === selected)).join('');
    const daySchedules = DataManager.getDaySchedules(tournamentId);
    const previewBlocks = daySchedules.length ? LogisticsService.generateTimeBlocks(tournamentId, daySchedules[0]) : [];
    const firstBlocks = previewBlocks.length ? `${previewBlocks.slice(0, 6).join(', ')}${previewBlocks.length > 6 ? '…' : ''}` : 'primero guardá una jornada en Calendario';
    const conflicts = LogisticsService.getConflicts(tournamentId);
    const conflictGroups = Map.groupBy(conflicts, issue => issue.type);
    const zoneAvisos = SchedulerService.estadoFaseClasificatoria(tournamentId, activeCategoryId).avisos || [];
    const teamName = id => allTeams.find(team => team.id === id)?.nombre || 'Equipo no disponible';
    const category = id => categories.find(item => item.id === id);
    const zoneName = id => allZones.find(zone => zone.id === id)?.nombre || '';
    const activeTeamOptions = selected => activeTeams.map(team => option(team.id, team.nombre, team.id === selected)).join('');
    const courtOptions = selected => courts.map(court => option(court.id, court.name, court.id === selected || court.name === selected)).join('');
    const dateOptions = selected => `${selected && !calendarDates.includes(selected) ? option(selected, `${formatDay(selected)} · fuera del calendario`, true) : ''}${calendarDates.map(date => option(date, formatDay(date), date === selected)).join('')}`;
    const stageSummary = day => day.stages?.length ? day.stages.map(stage => PHASE_LABELS[stage] || (stage === 'GARANTIZADOS' ? 'Partidos garantizados' : stage)).join(' · ') : 'Sin etapas configuradas';
    const modalities = [...new Set(categories.map(item => categoryParts(item).modality).filter(Boolean))];

    view.innerHTML = `
        <div class="fixture-heading"><div><span class="eyebrow">ORGANIZACIÓN DEL TORNEO</span><h2>Programación y Fixture General</h2><p>Una única agenda cronológica para todas las categorías y las canchas compartidas del torneo.</p></div><div class="fixture-export-actions"><button id="export-fixture-full" class="btn-primary" type="button">Exportar fixture completo</button><button id="print-fixture" class="btn-secondary" type="button">Imprimir</button></div></div>
        <section class="schedule-global-config panel-control">
            <div class="form-title"><div><h3>Configuración logística global</h3><p>Estas canchas pertenecen al torneo y pueden ser utilizadas por todas las categorías.</p></div><span class="calendar-chip">${courts.length} CANCHA${courts.length === 1 ? '' : 'S'}</span></div>
            <form id="court-config-form"><div class="court-config-list">${courts.map(court => `<div class="court-config-row"><label class="form-field">Nombre de cancha<input data-court-id="${escapeHtml(court.id)}" value="${escapeHtml(court.name)}" required maxlength="40"></label><button class="remove-court btn-secondary" data-court-id="${escapeHtml(court.id)}" type="button">Eliminar cancha</button></div>`).join('')}</div><div class="form-actions"><button id="add-court" class="btn-secondary" type="button">+ Agregar cancha</button><button class="btn-primary" type="submit">Guardar canchas</button></div></form>
            <form id="block-config-form"><div class="form-grid"><label class="form-field">Duración del bloque (minutos)<input name="blockDuration" type="number" min="5" max="240" step="5" value="${settings.blockDuration}" required></label><div class="form-field"><span class="calendar-settings-label">Bloques horarios</span><p class="helper-text">La hora de inicio se define en Calendario. Con los valores guardados el sistema calcula solo los bloques: ${escapeHtml(firstBlocks)}.</p></div></div><fieldset class="rest-rules"><legend>Descanso mínimo entre partidos del mismo equipo</legend><p class="helper-text">Cada categoría puede tener su propia regla. El valor indica bloques completos que debe descansar el equipo después de jugar.</p><div class="rest-rules-list">${categories.map(item => `<label class="form-field rest-rule">${escapeHtml(item.nombre)}<input type="number" min="0" max="20" data-rest-category="${escapeHtml(item.id)}" value="${DataManager.getCategoryRestBlocks(item.id)}" required><small>bloques</small></label>`).join('')}</div></fieldset><div class="form-actions"><button class="btn-primary" type="submit">Guardar reglas</button></div></form>
            <form id="set-format-form"><div class="form-title"><div><h3>Formato de sets</h3><p>Define cómo se cargan los resultados en cada fase del torneo.</p></div><span class="calendar-chip">MARCADORES</span></div><div class="form-grid"><label class="form-field">Fase de zonas y cruces<select name="zones">${setFormatOptions(setFormats.zones.key)}</select></label><label class="form-field">Eliminatorias<select name="playoffs">${setFormatOptions(setFormats.playoffs.key)}</select></label><div class="form-field"><span class="calendar-settings-label">Reglas</span><p class="helper-text">Con 1 set × 21 el partido se resuelve en un solo set. Con 2 sets × 15 el partido finaliza 2-0; si queda 1-1 se carga el tercer set de desempate.</p></div></div><div class="form-actions"><button class="btn-primary" type="submit">Guardar formato de sets</button></div></form>
        </section>
        <section class="schedule-conflicts ${conflicts.length ? 'has-conflicts' : ''}" aria-live="polite"><div><h3>Estado del fixture</h3><p>${conflicts.length ? 'Revisá cada situación antes de exportar el fixture.' : 'No se detectaron conflictos logísticos.'}</p></div><div class="conflict-groups">${conflicts.length ? `<ul>${[...conflictGroups].map(([type, items]) => `<li class="conflict-group"><strong>${escapeHtml(CONFLICT_LABELS[type] || type)} (${items.length})</strong><ul>${items.slice(0, 4).map(issue => `<li>${escapeHtml(issue.message)}</li>`).join('')}${items.length > 4 ? `<li class="conflict-more">+${items.length - 4} situación(es) más…</li>` : ''}</ul></li>`).join('')}</ul>` : '<p>Cuando falte una cancha, un horario o exista un solape, aparecerá avisado aquí con el partido afectado.</p>'}</div><span class="match-status ${conflicts.length ? 'pending' : 'finished'}">${conflicts.length ? `${conflicts.length} ALERTA${conflicts.length === 1 ? '' : 'S'}` : 'LISTO'}</span></section>
        <section class="pairing-context panel-control">
            <div class="form-title"><div><h3>Emparejamientos — ${escapeHtml(activeCategory.nombre)}</h3><p>Los emparejamientos definen quién juega; la programación global define cuándo y dónde.</p></div><span class="calendar-chip">${planning ? 'PLANIFICADA' : 'SIN PLANIFICAR'}</span></div>
            <div class="pairing-day-selector"><label class="form-field">Jornada<select id="pairing-day">${planningDays.map(day => option(day.date, `${formatDay(day.date)} — ${stageSummary(day)}`)).join('')}</select></label><div id="pairing-day-context" class="pairing-day-context"></div></div>
            <div class="form-actions"><button id="btn-generar-emparejamientos" class="btn-secondary" type="button">Generar emparejamientos</button><button id="btn-confirmar-emparejamientos" class="btn-primary" type="button">Confirmar emparejamientos</button><button id="btn-generar-programacion" class="btn-primary btn-large" type="button">Programar todos los partidos</button><button id="btn-limpiar-programacion" class="btn-secondary" type="button">Limpiar programación</button></div>
            ${zoneAvisos.length ? `<div class="schedule-zone-avisos" role="status"><strong>Aviso de zonas</strong><ul>${zoneAvisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul></div>` : ''}
            <details class="schedule-editor"><summary>+ Crear partido manual de zona</summary><form id="manual-group-match-form"><div class="form-grid"><label class="form-field">Equipo A<select name="local" required><option value="">Seleccionar</option>${activeTeamOptions('')}</select></label><label class="form-field">Equipo B<select name="visitante" required><option value="">Seleccionar</option>${activeTeamOptions('')}</select></label><label class="form-field">Fecha<select name="fecha" required>${dateOptions(planningDays[0]?.date)}</select></label><label class="form-field">Hora<input name="hora" type="time" required></label><label class="form-field">Cancha<select name="courtId" required><option value="">Seleccionar</option>${courtOptions('')}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1"></label></div><button class="btn-secondary" type="submit">Crear partido manual</button></form></details>
        </section>
        <section class="fixture-preview"><div class="schedule-board-head"><div><h3>Previsualización antes de confirmar</h3><p>Estos cruces todavía no aparecen en Resultados.</p></div><span class="calendar-chip">${drafts.length} BORRADORES</span></div><div class="draft-fixture-list">${drafts.length ? drafts.map(match => `<div class="draft-fixture-row"><span>${escapeHtml(formatDay(match.fecha))} · ${escapeHtml(zoneName(match.zonaId))}</span><strong>${escapeHtml(teamName(match.equipoLocalId))} <b>vs</b> ${escapeHtml(teamName(match.equipoVisitanteId))}</strong><button type="button" class="eliminar-borrador btn-secondary" data-id="${match.id}">Quitar</button></div>`).join('') : '<div class="empty-state compact">No hay emparejamientos pendientes de confirmación.</div>'}</div></section>
        <section class="fixture-board" aria-label="Fixture general del torneo">
            <div class="schedule-board-head"><div><h3>Fixture General</h3><p>Orden: día, hora, cancha y orden del partido.</p></div><div class="fixture-view-toggle"><button class="btn-secondary active" data-view-mode="day" type="button">Por día</button><button class="btn-secondary" data-view-mode="court" type="button">Por cancha</button></div></div>
            <div class="fixture-filters"><label>Día<select id="fixture-filter-date"><option value="">Todos los días</option>${calendarDates.map(date => option(date, formatDay(date))).join('')}<option value="__none">Sin fecha</option></select></label><label>Categoría<select id="fixture-filter-category"><option value="">Todas</option>${categories.map(item => option(item.id, item.nombre)).join('')}</select></label><label>Modalidad<select id="fixture-filter-modality"><option value="">Todas</option>${modalities.map(value => option(value, value)).join('')}</select></label><label>Etapa<select id="fixture-filter-phase"><option value="">Todas</option>${Object.entries(PHASE_LABELS).map(([value, label]) => option(value, label)).join('')}</select></label><label>Zona<select id="fixture-filter-zone"><option value="">Todas</option>${allZones.map(zone => option(zone.id, `${category(zone.categoriaId)?.nombre} · ${zone.nombre}`)).join('')}</select></label><label>Cancha<select id="fixture-filter-court"><option value="">Todas</option>${courts.map(court => option(court.id, court.name)).join('')}</select></label><label>Estado<select id="fixture-filter-status"><option value="">Todos</option>${[...new Set(official.map(match => match.estado))].map(value => option(value, STATUS_LABELS[value] || value)).join('')}</select></label><button id="clear-fixture-filters" class="btn-secondary" type="button">Limpiar filtros</button></div>
            <div class="fixture-export-actions"><button id="export-fixture-day" class="btn-secondary" type="button">PDF del día filtrado</button><button id="export-fixture-court" class="btn-secondary" type="button">PDF de la cancha filtrada</button></div>
            <div id="fixture-list" class="fixture-list" aria-live="polite"></div>
        </section>`;

    const selectedPairingDay = () => view.querySelector('#pairing-day')?.value || '';
    const renderPairingContext = () => {
        const date = selectedPairingDay(); const day = planningDays.find(item => item.date === date);
        const hasZoneStage = !planning || day?.stages?.some(stage => ['ZONAS', 'GARANTIZADOS'].includes(stage));
        view.querySelector('#pairing-day-context').innerHTML = `<strong>${escapeHtml(formatDay(date))}</strong><span>${escapeHtml(stageSummary(day || { stages: [] }))}</span>`;
        view.querySelector('#btn-generar-emparejamientos').disabled = !date || !hasZoneStage;
    };
    const editor = match => match.estado === 'finalizado' ? '' : `<details class="schedule-editor"><summary>Reprogramar</summary><form class="schedule-match-form" data-id="${match.id}"><div class="form-grid"><label class="form-field">Día<select name="fecha" required>${dateOptions(match.fecha)}</select></label><label class="form-field">Hora<input name="hora" type="time" value="${escapeHtml(match.hora || '')}" required></label><label class="form-field">Cancha<select name="courtId" required>${courtOptions(match.courtId || match.cancha)}</select></label><label class="form-field">Orden<input name="orden" type="number" min="1" value="${escapeHtml(match.orden || '')}"></label></div><div class="form-actions"><button class="btn-primary" type="submit">Validar y guardar</button><button class="eliminar-partido btn-secondary" type="button" data-id="${match.id}">Eliminar partido</button></div></form></details>`;
    const card = match => {
        const parts = categoryParts(category(match.categoriaId));
        return `<article class="fixture-match" data-match-id="${match.id}">
            <div class="fixture-cell fixture-cell-time"><strong>${escapeHtml(match.hora || 'Sin horario')}</strong>${match.orden ? `<span class="fixture-cell-note">Orden ${match.orden}</span>` : ''}</div>
            <div class="fixture-cell fixture-cell-court"><strong>${escapeHtml(match.cancha || 'Sin cancha')}</strong><span class="fixture-cell-note">${escapeHtml(match.fecha ? formatDay(match.fecha) : 'Sin día asignado')}</span></div>
            <div class="fixture-cell fixture-cell-category"><strong>${escapeHtml(parts.age)}</strong>${parts.modality ? `<span class="fixture-cell-note">${escapeHtml(parts.modality)}</span>` : ''}</div>
            <div class="fixture-cell fixture-cell-stage"><strong>${escapeHtml(PHASE_LABELS[matchPhase(match)] || matchPhase(match))}</strong>${match.zonaId ? `<span class="fixture-cell-note">${escapeHtml(zoneName(match.zonaId))}</span>` : ''}</div>
            <div class="fixture-cell fixture-cell-teams"><div class="fixture-teams"><strong>${escapeHtml(teamName(match.equipoLocalId))}</strong><b>vs</b><strong>${escapeHtml(teamName(match.equipoVisitanteId))}</strong></div></div>
            <div class="fixture-cell fixture-cell-status"><span class="match-status ${match.estado === 'finalizado' ? 'finished' : 'pending'}">${escapeHtml(STATUS_LABELS[match.estado] || match.estado)}</span></div>
            ${editor(match)}
        </article>`;
    };
    let viewMode = 'day';
    const currentFilters = () => ({ date: view.querySelector('#fixture-filter-date').value === '__none' ? '' : view.querySelector('#fixture-filter-date').value, categoryId: view.querySelector('#fixture-filter-category').value, modality: view.querySelector('#fixture-filter-modality').value, phase: view.querySelector('#fixture-filter-phase').value, zoneId: view.querySelector('#fixture-filter-zone').value, court: view.querySelector('#fixture-filter-court').value, status: view.querySelector('#fixture-filter-status').value, categories });
    const bindEditors = () => {
        view.querySelectorAll('.schedule-match-form').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); try { const current = allMatches.find(match => match.id === form.dataset.id); const values = new FormData(form); const court = courts.find(item => item.id === values.get('courtId')); DataManager.updateMatches([{ ...current, fecha: values.get('fecha'), hora: values.get('hora'), courtId: court.id, cancha: court.name, orden: values.get('orden') ? Number(values.get('orden')) : null }]); initScheduleView(); } catch (error) { alert(error.message); } }));
        view.querySelectorAll('.eliminar-partido').forEach(button => button.addEventListener('click', () => { if (confirm('¿Eliminar este partido pendiente?')) { try { DataManager.removeMatch(button.dataset.id); initScheduleView(); } catch (error) { alert(error.message); } } }));
    };
    const renderFixture = () => {
        const rawDate = view.querySelector('#fixture-filter-date').value; let visible = filterFixtureMatches(official, currentFilters());
        if (rawDate === '__none') visible = visible.filter(match => !match.fecha);
        const groups = viewMode === 'court' ? Map.groupBy(visible, match => match.courtId || match.cancha || '') : Map.groupBy(visible, match => match.fecha || '');
        view.querySelector('#fixture-list').innerHTML = visible.length ? [...groups.entries()].map(([key, matches]) => `<section class="fixture-day"><header class="fixture-day-header"><div><span>${viewMode === 'court' ? 'CANCHA' : 'JORNADA'}</span><h4>${escapeHtml(viewMode === 'court' ? (courts.find(item => item.id === key)?.name || key || 'Sin cancha') : formatDay(key))}</h4></div><strong>${matches.length} partido${matches.length === 1 ? '' : 's'}</strong></header><div class="fixture-table" role="table"><div class="fixture-table-head" role="row"><span>Hora</span><span>Cancha</span><span>Categoría · modalidad</span><span>Etapa · zona</span><span>Partido</span><span>Estado</span></div>${matches.sort(fixtureCompare).map(card).join('')}</div></section>`).join('') : '<div class="empty-state">No hay partidos que coincidan con estos filtros.</div>';
        bindEditors();
    };
    const exportRows = filters => fixtureRows({ matches: official, categories: categories.map(item => ({ ...item, categoryAge: categoryParts(item).age, modality: categoryParts(item).modality, edad: categoryParts(item).age, modalidad: categoryParts(item).modality })), teams: allTeams, zones: allZones, phaseLabels: PHASE_LABELS, filters });

    view.querySelector('#pairing-day')?.addEventListener('change', renderPairingContext); renderPairingContext();
    view.querySelector('#court-config-form').addEventListener('submit', event => { event.preventDefault(); try { DataManager.setTournamentCourts(tournamentId, courts.map(court => ({ ...court, name: view.querySelector(`[data-court-id="${court.id}"]`).value }))); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelector('#add-court').addEventListener('click', () => { try { DataManager.setTournamentCourts(tournamentId, [...courts, { id: `court_${Date.now()}`, name: `Cancha ${courts.length + 1}` }]); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelectorAll('.remove-court').forEach(button => button.addEventListener('click', () => { if (courts.length === 1) return alert('El torneo debe conservar al menos una cancha.'); try { DataManager.setTournamentCourts(tournamentId, courts.filter(court => court.id !== button.dataset.courtId)); initScheduleView(); } catch (error) { alert(error.message); } }));
    view.querySelector('#block-config-form').addEventListener('submit', event => { event.preventDefault(); try { const values = new FormData(event.currentTarget); DataManager.setTournamentSchedulingSettings(tournamentId, settings.duracionPartido, settings.intervaloPartidos, values.get('blockDuration')); view.querySelectorAll('[data-rest-category]').forEach(input => DataManager.setCategoryRestBlocks(tournamentId, input.dataset.restCategory, input.value)); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelector('#set-format-form').addEventListener('submit', event => { event.preventDefault(); try { const values = new FormData(event.currentTarget); DataManager.setTournamentSetFormats(tournamentId, { zones: values.get('zones'), playoffs: values.get('playoffs') }); alert('Formato de sets guardado.'); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelectorAll('.eliminar-borrador').forEach(button => button.addEventListener('click', () => { try { DataManager.removeMatch(button.dataset.id); initScheduleView(); } catch (error) { alert(error.message); } }));
    view.querySelector('#btn-generar-emparejamientos').addEventListener('click', () => { try { const count = SchedulerService.generarEmparejamientos(tournamentId, activeCategoryId, { date: selectedPairingDay() }); alert(`${count} emparejamiento${count === 1 ? '' : 's'} creado${count === 1 ? '' : 's'}.`); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelector('#btn-confirmar-emparejamientos').addEventListener('click', () => { try { const count = SchedulerService.confirmarEmparejamientos(tournamentId, activeCategoryId); alert(`${count} partido${count === 1 ? '' : 's'} confirmado${count === 1 ? '' : 's'}. Ahora podés programar el torneo completo.`); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelector('#btn-generar-programacion').addEventListener('click', () => { try { const result = LogisticsService.programTournament(tournamentId); const warning = result.failures.length ? `\n\nNo se encontró un horario disponible para ${result.failures.length} partido(s) respetando las reglas actuales:\n${result.failures.map(item => `• ${item.label}\n   Motivo: ${item.reasons.join(' · ')}`).join('\n')}` : ''; alert(`${result.scheduled} partido(s) programado(s).${warning}`); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelector('#btn-limpiar-programacion').addEventListener('click', () => { if (!confirm('Se quitará el día, la hora y la cancha de todos los partidos pendientes. Se conservan los equipos, los resultados y los partidos finalizados. ¿Continuar?')) return; try { const cleared = DataManager.clearTournamentSchedule(tournamentId); alert(`${cleared} partido(s) quedaron sin programar. Ahora podés programarlos de nuevo.`); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelector('#manual-group-match-form').addEventListener('submit', event => { event.preventDefault(); try { const values = new FormData(event.currentTarget); const local = activeTeams.find(team => team.id === values.get('local')); const court = courts.find(item => item.id === values.get('courtId')); DataManager.createManualMatch({ torneoId: tournamentId, categoriaId: activeCategoryId, zonaId: local?.zonaId, tipo: 'fase_zonas', phase: 'ZONAS', equipoLocalId: values.get('local'), equipoVisitanteId: values.get('visitante'), fecha: values.get('fecha'), hora: values.get('hora'), courtId: court.id, cancha: court.name, orden: values.get('orden') ? Number(values.get('orden')) : null, estado: 'programado' }); initScheduleView(); } catch (error) { alert(error.message); } });
    view.querySelectorAll('.fixture-filters select').forEach(select => select.addEventListener('change', renderFixture));
    view.querySelector('#clear-fixture-filters').addEventListener('click', () => { view.querySelectorAll('.fixture-filters select').forEach(select => { select.value = ''; }); renderFixture(); });
    view.querySelectorAll('[data-view-mode]').forEach(button => button.addEventListener('click', () => { viewMode = button.dataset.viewMode; view.querySelectorAll('[data-view-mode]').forEach(item => item.classList.toggle('active', item === button)); renderFixture(); }));
    view.querySelector('#export-fixture-full').addEventListener('click', () => downloadFixturePdf(tournament, exportRows({}), 'completo', 'TODAS LAS JORNADAS DEL TORNEO'));
    view.querySelector('#export-fixture-day').addEventListener('click', () => { const date = view.querySelector('#fixture-filter-date').value; if (!date || date === '__none') return alert('Seleccioná un día en los filtros para exportarlo.'); downloadFixturePdf(tournament, exportRows({ date }), date, `JORNADA: ${formatDay(date).toUpperCase()}`); });
    view.querySelector('#export-fixture-court').addEventListener('click', () => { const courtId = view.querySelector('#fixture-filter-court').value; const court = courts.find(item => item.id === courtId); if (!court) return alert('Seleccioná una cancha en los filtros para exportarla.'); downloadFixturePdf(tournament, exportRows({ courtId, courtName: court.name }), court.name.toLowerCase().replace(/\s+/g, '-'), `CANCHA: ${court.name.toUpperCase()}`); });
    view.querySelector('#print-fixture').addEventListener('click', () => window.print());
    renderFixture();
};
