import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

export const initZonasView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const alertBox = document.getElementById('alerta-zonas');
    const panel = document.getElementById('panel-zonas-activo');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        alertBox.style.display = 'block';
        panel.style.display = 'none';
        return;
    }

    const category = DataManager.getCategory(categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const teamName = id => teams.find(team => team.id === id)?.nombre || null;
    const freeTeams = teams.filter(team => !team.zonaId);
    const zoneSelectOptions = (currentZoneId, placeholder) => `<option value="" ${currentZoneId ? '' : 'selected'}>${placeholder}</option>${zones.map(zone => `<option value="${zone.id}" ${zone.id === currentZoneId ? 'selected' : ''}>${zone.nombre}</option>`).join('')}`;

    alertBox.style.display = 'none';
    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="zones-page-head"><div><h2>Distribución de zonas</h2><p>Categoría activa: <strong>${category.nombre}</strong>. Cada categoría conserva sus propias zonas.</p></div><span class="calendar-chip">${teams.length} EQUIPOS</span></div>
        <section class="form-card panel-control">
            <div class="form-title"><div><h3>Crear y sortear</h3><p>Primero cree las zonas. Después puede elegir una cabeza de serie por zona o realizar un sorteo completamente aleatorio.</p></div></div>
            <form id="form-nueva-zona" class="form-grid"><label class="form-field">Nombre de la zona<input id="zona-nombre" type="text" maxlength="40" required placeholder="Ej.: Zona A"></label><div class="form-actions"><button class="btn-primary" type="submit">Crear zona</button></div></form>
            ${zones.length ? `<div class="seed-draw"><div class="seed-draw-head"><div><h3>Cabezas de serie (opcional)</h3><p>El equipo elegido queda como líder de su zona. Los demás equipos se sortean automáticamente.</p></div><button type="button" id="btn-sortear-zonas" class="btn-primary">Sortear zonas</button></div><div class="seed-grid">${zones.map(zone => {
                const selectedLeader = zone.liderEquipoId && teams.find(team => team.id === zone.liderEquipoId && team.zonaId === zone.id) ? zone.liderEquipoId : '';
                return `<label class="seed-choice"><span>${zone.nombre}</span><select class="seed-selector" data-zone="${zone.id}"><option value="">Sorteo aleatorio</option>${teams.map(team => `<option value="${team.id}" ${team.id === selectedLeader ? 'selected' : ''}>${team.nombre}</option>`).join('')}</select></label>`;
            }).join('')}</div><p id="seed-validation" class="helper-text">Sin líderes seleccionados: el sorteo será completamente aleatorio.</p></div>` : '<div class="empty-state">Cree al menos una zona para poder sortear los equipos.</div>'}
        </section>
        <section class="zones-workspace">
            <div class="zones-section-head"><div><h3>Equipos sin zona</h3><p>${freeTeams.length ? 'También puede ubicarlos manualmente antes del sorteo.' : 'Todos los equipos ya tienen una zona asignada.'}</p></div><span>${freeTeams.length}</span></div>
            <div class="zone-team-grid">${freeTeams.length ? freeTeams.map(team => `<article class="free-team-card"><strong>${team.nombre}</strong>${zones.length ? `<label>Asignar manualmente<select class="asignar-zona" data-team="${team.id}">${zoneSelectOptions('', 'Elegí una zona')}</select></label>` : ''}</article>`).join('') : '<div class="empty-state">No quedan equipos libres.</div>'}</div>
        </section>
        <section class="zones-workspace"><div class="zones-section-head"><div><h3>Zonas creadas</h3><p>Revise la distribución y mueva equipos si es necesario.</p></div><span>${zones.length}</span></div><div class="zones-grid">${zones.length ? zones.map(zone => {
            const zoneTeams = teams.filter(team => team.zonaId === zone.id);
            const leader = teamName(zone.liderEquipoId);
            return `<article class="zone-card"><header><div><span class="calendar-chip">${zoneTeams.length} EQUIPOS</span><h3>${zone.nombre}</h3></div>${leader ? `<span class="leader-badge">★ ${leader}</span>` : '<span class="leader-badge empty">Sin líder</span>'}</header><div class="zone-team-list">${zoneTeams.length ? zoneTeams.map(team => `<div class="zone-team ${team.id === zone.liderEquipoId ? 'leader' : ''}"><strong>${team.nombre}${team.id === zone.liderEquipoId ? ' <small>cabeza de serie</small>' : ''}</strong><select class="asignar-zona" data-team="${team.id}">${zoneSelectOptions(zone.id, 'Mover a zona')}</select></div>`).join('') : '<p class="helper-text">Aún no hay equipos asignados.</p>'}</div></article>`;
        }).join('') : '<div class="empty-state">Aún no hay zonas.</div>'}</div></section>`;

    panel.querySelector('#form-nueva-zona').addEventListener('submit', event => {
        event.preventDefault();
        const name = panel.querySelector('#zona-nombre').value.trim();
        if (!name) return;
        try { DataManager.createZone(name, categoryId, tournamentId); initZonasView(); } catch (error) { alert(error.message); }
    });
    panel.querySelectorAll('.asignar-zona').forEach(select => select.addEventListener('change', () => {
        if (!select.value) return;
        try { DataManager.assignTeamToZone(select.dataset.team, select.value); initZonasView(); } catch (error) { alert(error.message); }
    }));

    const drawButton = panel.querySelector('#btn-sortear-zonas');
    const updateSeedStatus = () => {
        if (!drawButton) return;
        const selected = [...panel.querySelectorAll('.seed-selector')].map(select => select.value).filter(Boolean);
        const duplicated = selected.length !== new Set(selected).size;
        const message = panel.querySelector('#seed-validation');
        drawButton.disabled = duplicated;
        message.textContent = duplicated ? 'Un mismo equipo no puede ser líder de dos zonas.' : (selected.length ? `${selected.length} cabeza${selected.length === 1 ? '' : 's'} de serie seleccionada${selected.length === 1 ? '' : 's'}; el resto se sortea al azar.` : 'Sin líderes seleccionados: el sorteo será completamente aleatorio.');
        message.classList.toggle('validation-error', duplicated);
    };
    panel.querySelectorAll('.seed-selector').forEach(select => select.addEventListener('change', updateSeedStatus));
    updateSeedStatus();
    drawButton?.addEventListener('click', () => {
        const leaders = Object.fromEntries([...panel.querySelectorAll('.seed-selector')].filter(select => select.value).map(select => [select.dataset.zone, select.value]));
        try { DataManager.drawZones(tournamentId, categoryId, leaders); initZonasView(); } catch (error) { alert(error.message); }
    });
};
