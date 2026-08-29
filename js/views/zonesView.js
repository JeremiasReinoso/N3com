import { AppState } from '../core/state.js';
import { DataManager } from '../data/dataManager.js';

export const initZonasView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const alertBox = document.getElementById('alerta-zonas');
    const panel = document.getElementById('panel-zonas-activo');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        alertBox.style.display = 'block'; panel.style.display = 'none';
        return;
    }
    const category = DataManager.getCategory(categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    alertBox.style.display = 'none'; panel.style.display = 'block';
    document.getElementById('titulo-categoria-zonas').textContent = `Categoría activa: ${category.nombre}`;
    const free = teams.filter(team => !team.zonaId);
    document.getElementById('equipos-libres-list').innerHTML = free.length ? free.map(team => `<article class="card"><strong>${team.nombre}</strong>${zones.length ? `<label style="display:block; margin-top:8px;">Asignar a <select class="asignar-zona" data-team="${team.id}"><option value="">Seleccione una zona...</option>${zones.map(zone => `<option value="${zone.id}">${zone.nombre}</option>`).join('')}</select></label>` : '<p>Cree una zona para asignarlo.</p>'}</article>`).join('') : '<p>No hay equipos sin zona.</p>';
    document.getElementById('zonas-list').innerHTML = zones.length ? zones.map(zone => {
        const zoneTeams = teams.filter(team => team.zonaId === zone.id);
        return `<article class="card"><h3>${zone.nombre}</h3>${zoneTeams.length ? zoneTeams.map(team => `
            <label style="display:block; margin:8px 0;">${team.nombre}
              <select class="asignar-zona" data-team="${team.id}"><option value="${zone.id}">Mover a...</option>${zones.filter(item => item.id !== zone.id).map(item => `<option value="${item.id}">${item.nombre}</option>`).join('')}</select>
            </label>`).join('') : '<p>Sin equipos.</p>'}</article>`;
    }).join('') : '<p>Cree zonas para esta categoría.</p>';
    document.querySelectorAll('.asignar-zona').forEach(select => select.addEventListener('change', () => {
        if (!select.value) return;
        DataManager.assignTeamToZone(select.dataset.team, select.value);
        initZonasView();
    }));

    const zoneControl = document.getElementById('form-nueva-zona') || document.getElementById('btn-nueva-zona');
    zoneControl.replaceWith(Object.assign(document.createElement('form'), {
        id: 'form-nueva-zona',
        className: 'form-grid',
        innerHTML: '<label class="form-field">Nueva zona<input id="zona-nombre" type="text" maxlength="40" required placeholder="Ej.: Zona A"></label><div class="form-actions"><button class="btn-primary" type="submit">Crear zona</button></div>'
    }));
    document.getElementById('form-nueva-zona').addEventListener('submit', event => {
        event.preventDefault();
        const name = document.getElementById('zona-nombre').value.trim();
        if (!name) return;
        DataManager.createZone(name, categoryId, tournamentId);
        initZonasView();
    });
    document.getElementById('btn-sortear-zonas')?.remove();
    const draw = document.createElement('button');
    draw.id = 'btn-sortear-zonas'; draw.className = 'btn-primary'; draw.textContent = 'Sortear equipos en zonas'; draw.style.marginLeft = '10px';
    document.getElementById('form-nueva-zona').after(draw);
    draw.addEventListener('click', () => {
        try { DataManager.drawZones(tournamentId, categoryId); initZonasView(); } catch (error) { alert(error.message); }
    });
};
