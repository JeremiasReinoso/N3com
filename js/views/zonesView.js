import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine, ReclassificationEngine } from '../engine/index.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, promptDialog, showToast } from '../ui/feedback.js';

export const initZonasView = () => {
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const alertBox = document.getElementById('alerta-zonas');
    const panel = document.getElementById('panel-zonas-activo');
    const categoryId = AppState.getCategory();
    if (!tournamentId || !categoryId) {
        alertBox.style.display = 'grid';
        panel.style.display = 'none';
        return;
    }

    const category = DataManager.getCategory(categoryId);
    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, categoryId);
    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, categoryId);
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const formatInfo = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const needsZones = formatInfo.definition.requiresZones || formatInfo.config.stages?.[0]?.type === 'ZONAS';
    const teamName = id => teams.find(team => team.id === id)?.nombre || 'Equipo';
    const freeTeams = teams.filter(team => !team.zonaId);
    const assignedCount = teams.length - freeTeams.length;
    const interzonalMatches = matches.filter(m => m.interzonal);

    const pendingSelectOptions = () =>
        '<option value="" selected>Seleccionar zona...</option>'
        + zones.map(zone => `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.nombre)}</option>`).join('');

    const assignedSelectOptions = currentZoneId =>
        zones.map(zone => `<option value="${escapeHtml(zone.id)}" ${zone.id === currentZoneId ? 'selected' : ''}>${escapeHtml(zone.nombre)}</option>`).join('')
        + '<option value="__unassign__">Dejar sin zona</option>';

    const nextLetter = String.fromCharCode(65 + zones.length);

    alertBox.style.display = 'none';
    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">ZONAS · ${escapeHtml(category.nombre.toUpperCase())}</span>
                <h1>Distribución de zonas</h1>
                <p>${assignedCount} de ${teams.length} equipos asignados · ${zones.length} zona${zones.length === 1 ? '' : 's'}</p>
            </div>
            <div class="page-header-actions">
                <button type="button" id="btn-sortear-zonas-top" class="btn-secondary" ${zones.length && freeTeams.length ? '' : 'disabled'}>Sortear equipos libres</button>
                <button type="button" id="btn-ir-programacion-zonas" class="btn-primary">Ir a programación →</button>
                <button type="button" id="btn-toggle-admin-zonas" class="btn-icon" aria-label="Crear zonas y cabezas de serie" title="Crear zonas y cabezas de serie">${icon('sliders', { size: 17 })}</button>
            </div>
        </div>

        ${!needsZones ? `
            <div class="zones-info-banner">
                La modalidad <strong>${escapeHtml(formatInfo.definition.name)}</strong> se disputa sin dividir en zonas. Podés pasar directo a <strong>Programación</strong> o cambiar la modalidad en <strong>Equipos</strong>.
            </div>
        ` : ''}

        ${needsZones && zones.length > 0 && freeTeams.length > 0 ? `
            <div class="zones-info-banner" role="status">
                Faltan ubicar ${freeTeams.length} equipo${freeTeams.length === 1 ? '' : 's'}. Asignalos a una zona o usá el sorteo automático.
            </div>
        ` : ''}

        <details id="panel-admin-zonas" class="collapsible-panel" ${zones.length === 0 ? 'open' : 'hidden'}>
            <summary>
                <span>Crear zonas y definir cabezas de serie</span>
                <span class="chip-pill chip-blue">${zones.length} ZONA${zones.length === 1 ? '' : 'S'}</span>
            </summary>
            <div class="collapsible-body">
                <form id="form-nueva-zona" class="form-grid" style="grid-template-columns: minmax(220px, 1fr) auto auto;">
                    <label class="form-field">Nombre de la nueva zona
                        <input id="zona-nombre" type="text" maxlength="40" required value="Zona ${escapeHtml(nextLetter)}" placeholder="Ej.: Zona A">
                    </label>
                    <div class="form-actions">
                        <button class="btn-primary" type="submit">+ Crear zona</button>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="btn-zonas-rapidas" class="btn-secondary">Crear varias zonas…</button>
                    </div>
                </form>

                ${zones.length ? `
                    <div class="seed-draw" style="margin-top: 16px;">
                        <div class="seed-draw-head">
                            <p class="helper-text">Elegí opcionalmente una cabeza de serie fija por zona antes de sortear los equipos libres.</p>
                            <button type="button" id="btn-sortear-zonas" class="btn-secondary" ${freeTeams.length ? '' : 'disabled'}>Sortear con cabezas de serie</button>
                        </div>
                        <div class="seed-grid">${zones.map(zone => {
                            const selectedLeader = zone.liderEquipoId && teams.find(team => team.id === selectedLeaderId(zone)) ? zone.liderEquipoId : '';
                            const zoneCandidates = selectedLeader ? teams.filter(team => team.id === selectedLeader) : [...teams.filter(t => t.zonaId === zone.id), ...freeTeams];
                            return `<label class="seed-choice"><span>${escapeHtml(zone.nombre)}</span><select class="seed-selector" data-zone="${escapeHtml(zone.id)}" ${selectedLeader ? 'disabled' : ''}><option value="">${selectedLeader ? 'Cabeza de serie fija' : 'Sin cabeza de serie'}</option>${zoneCandidates.map(team => `<option value="${escapeHtml(team.id)}" ${team.id === selectedLeader ? 'selected' : ''}>${escapeHtml(team.nombre)}</option>`).join('')}</select></label>`;
                        }).join('')}</div>
                        <p id="seed-validation" class="helper-text">El sorteo reparte equilibradamente los equipos pendientes.</p>
                    </div>
                ` : ''}
            </div>
        </details>

        ${zones.length ? `
            <div class="zones-grid">
                ${zones.map(zone => {
                    const rawZoneTeams = teams.filter(team => team.zonaId === zone.id);
                    const zoneTeams = [...rawZoneTeams].sort((a, b) => (b.id === zone.liderEquipoId ? 1 : 0) - (a.id === zone.liderEquipoId ? 1 : 0));
                    const leader = zone.liderEquipoId ? teamName(zone.liderEquipoId) : null;
                    return `
                        <article class="zone-card">
                            <header>
                                <div class="zone-card-title-group">
                                    <h3>${escapeHtml(zone.nombre)}</h3>
                                    <span>${zoneTeams.length} equipo${zoneTeams.length === 1 ? '' : 's'}</span>
                                </div>
                                <div class="zone-card-controls">
                                    ${leader ? `<span class="leader-star-label" title="Cabeza de serie">★ ${escapeHtml(leader)}</span>` : ''}
                                    <div class="ui-dropdown" data-dropdown>
                                        <button type="button" class="btn-icon" data-dropdown-trigger aria-label="Opciones de ${escapeHtml(zone.nombre)}" aria-expanded="false">${icon('moreHorizontal', { size: 17 })}</button>
                                        <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                                            ${leader ? `<button type="button" class="ui-dropdown-item liberar-lider" data-zone="${escapeHtml(zone.id)}">Liberar cabeza de serie</button>` : ''}
                                            <button type="button" class="ui-dropdown-item renombrar-zona" data-zone="${escapeHtml(zone.id)}" data-name="${escapeHtml(zone.nombre)}">Renombrar zona</button>
                                            <button type="button" class="ui-dropdown-item is-danger eliminar-zona" data-zone="${escapeHtml(zone.id)}" data-name="${escapeHtml(zone.nombre)}">Eliminar zona</button>
                                        </div>
                                    </div>
                                </div>
                            </header>
                            <div class="zone-team-list">
                                ${zoneTeams.length ? zoneTeams.map(team => {
                                    const isLeader = team.id === zone.liderEquipoId;
                                    return `
                                        <div class="zone-team ${isLeader ? 'leader' : ''}">
                                            <strong>${escapeHtml(team.nombre)}${isLeader ? '<small>CABEZA DE SERIE</small>' : ''}</strong>
                                            ${isLeader
                                                ? '<span class="zone-team-fixed">Fija</span>'
                                                : `<select class="asignar-zona zone-inline-select" data-team="${escapeHtml(team.id)}" aria-label="Zona de ${escapeHtml(team.nombre)}">${assignedSelectOptions(zone.id)}</select>`}
                                        </div>`;
                                }).join('') : '<p class="helper-text" style="padding: 16px 20px;">Todavía no hay equipos en esta zona.</p>'}
                            </div>
                        </article>`;
                }).join('')}
            </div>
        ` : `
            <div class="empty-state" style="margin-bottom: 20px;">
                <strong>Todavía no creaste zonas</strong>
                <p>Creá las zonas arriba (Zona A, Zona B…) para distribuir los equipos de ${escapeHtml(category.nombre)}.</p>
            </div>
        `}

        ${freeTeams.length ? `
            <section class="pending-teams-panel" aria-label="Equipos pendientes de ubicar">
                <h3>Equipos pendientes de ubicar</h3>
                <div class="zone-team-grid">
                    ${freeTeams.map(team => `
                        <article class="free-team-card">
                            <strong>${escapeHtml(team.nombre)}</strong>
                            ${zones.length
                                ? `<label>Ubicar en zona<select class="asignar-zona" data-team="${escapeHtml(team.id)}">${pendingSelectOptions()}</select></label>`
                                : '<small class="helper-text">Creá primero al menos una zona.</small>'}
                        </article>`).join('')}
                </div>
            </section>
        ` : ''}

        ${zones.length >= 2 && assignedCount >= 4 ? `
            <details id="panel-interzonales-zonas" class="collapsible-panel" ${interzonalMatches.length ? 'open' : 'hidden'}>
                <summary>
                    <span>Cruces interzonales opcionales</span>
                    <span class="chip-pill chip-blue">${interzonalMatches.length} CREADO${interzonalMatches.length === 1 ? '' : 'S'}</span>
                </summary>
                <div class="collapsible-body">
                    <p class="helper-text" style="margin-bottom: 12px;">
                        Si tenés zonas de distinto tamaño, podés sumar cruces interzonales para equilibrar partidos. El resultado suma en la zona propia de cada equipo.
                    </p>
                    <form id="form-interzonal-zona" class="form-grid" style="grid-template-columns: minmax(200px, 1fr) minmax(200px, 1fr) auto;">
                        <label class="form-field">Equipo A
                            <select id="interzonal-local" required>
                                <option value="">Seleccionar equipo…</option>
                                ${zones.map(z => `<optgroup label="${escapeHtml(z.nombre)}">${teams.filter(t => t.zonaId === z.id).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nombre)} (${escapeHtml(z.nombre)})</option>`).join('')}</optgroup>`).join('')}
                            </select>
                        </label>
                        <label class="form-field">Equipo B (otra zona)
                            <select id="interzonal-visitante" required>
                                <option value="">Seleccionar rival…</option>
                                ${zones.map(z => `<optgroup label="${escapeHtml(z.nombre)}">${teams.filter(t => t.zonaId === z.id).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nombre)} (${escapeHtml(z.nombre)})</option>`).join('')}</optgroup>`).join('')}
                            </select>
                        </label>
                        <div class="form-actions">
                            <button type="submit" class="btn-secondary">+ Agregar interzonal</button>
                        </div>
                    </form>
                    ${interzonalMatches.length ? `
                        <div class="draft-fixture-list" style="margin-top: 14px;">
                            ${interzonalMatches.map(m => `
                                <div class="draft-fixture-row">
                                    <span class="chip-pill chip-blue">${escapeHtml(m.nombreEtapa || 'Interzonal')}</span>
                                    <strong>${escapeHtml(teamName(m.equipoLocalId))} <span class="vs-sep">vs</span> ${escapeHtml(teamName(m.equipoVisitanteId))}</strong>
                                    ${m.estado === 'finalizado' ? `<span class="chip-pill chip-green">${escapeHtml(m.score)}</span>` : `<button type="button" class="btn-secondary btn-sm quitar-interzonal" data-id="${escapeHtml(m.id)}">Quitar</button>`}
                                </div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            </details>
        ` : ''}`;

    function selectedLeaderId(zone) {
        return zone.liderEquipoId;
    }

    const adminDrawer = panel.querySelector('#panel-admin-zonas');
    const interzonalDrawer = panel.querySelector('#panel-interzonales-zonas');
    panel.querySelector('#btn-toggle-admin-zonas')?.addEventListener('click', () => {
        if (!adminDrawer) return;
        const willShow = adminDrawer.hidden || !adminDrawer.open;
        adminDrawer.hidden = !willShow;
        adminDrawer.open = willShow;
        if (interzonalDrawer && !interzonalMatches.length) {
            interzonalDrawer.hidden = !willShow;
        }
    });

    panel.querySelector('#btn-ir-programacion-zonas')?.addEventListener('click', () => {
        goToTournament(tournamentId, 'programacion');
    });

    panel.querySelector('#form-nueva-zona')?.addEventListener('submit', event => {
        event.preventDefault();
        const name = panel.querySelector('#zona-nombre').value.trim();
        if (!name) return;
        try {
            DataManager.createZone(name, categoryId, tournamentId);
            showToast(`${name} creada.`, { type: 'success', duration: 2200 });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });

    panel.querySelector('#btn-zonas-rapidas')?.addEventListener('click', async () => {
        const countStr = await promptDialog({
            title: 'Crear zonas automáticamente',
            message: 'Indicá cuántas zonas en total tendrá esta categoría (Zona A, Zona B, Zona C…).',
            label: 'Cantidad total de zonas',
            type: 'number',
            value: String(Math.max(2, zones.length || 2)),
            min: 2,
            max: 12,
            confirmLabel: 'Crear zonas'
        });
        const totalDesired = Number(countStr);
        if (!countStr || !Number.isInteger(totalDesired) || totalDesired < 1) return;
        try {
            let createdCount = 0;
            const existingZoneNames = new Set(zones.map(z => z.nombre.trim().toLocaleLowerCase('es')));
            for (let i = 0; i < totalDesired; i += 1) {
                const candidate = `Zona ${String.fromCharCode(65 + i)}`;
                if (!existingZoneNames.has(candidate.toLocaleLowerCase('es'))) {
                    DataManager.createZone(candidate, categoryId, tournamentId);
                    createdCount += 1;
                }
            }
            if (createdCount > 0) showToast(`Se crearon ${createdCount} zona(s).`, { type: 'success' });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });

    panel.querySelectorAll('.asignar-zona').forEach(select => select.addEventListener('change', () => {
        if (!select.value) return;
        try {
            if (select.value === '__unassign__') {
                DataManager.unassignTeamFromZone(select.dataset.team);
            } else {
                DataManager.assignTeamToZone(select.dataset.team, select.value);
            }
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));

    panel.querySelectorAll('.liberar-lider').forEach(button => button.addEventListener('click', () => {
        try {
            DataManager.clearZoneLeader(button.dataset.zone);
            showToast('Cabeza de serie liberada.', { type: 'info' });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));

    panel.querySelectorAll('.renombrar-zona').forEach(button => button.addEventListener('click', async () => {
        const nextName = await promptDialog({
            title: 'Renombrar zona',
            label: 'Nombre de la zona',
            value: button.dataset.name,
            maxLength: 40,
            confirmLabel: 'Guardar nombre'
        });
        if (!nextName || nextName === button.dataset.name) return;
        try {
            DataManager.updateZone(button.dataset.zone, { nombre: nextName });
            showToast('Zona renombrada.', { type: 'success' });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));

    panel.querySelectorAll('.eliminar-zona').forEach(button => button.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
            title: `¿Eliminar "${button.dataset.name}"?`,
            message: 'Los equipos asignados volverán a quedar pendientes de ubicar.',
            confirmLabel: 'Eliminar zona',
            danger: true
        });
        if (!confirmed) return;
        try {
            DataManager.removeZone(button.dataset.zone);
            showToast(`"${button.dataset.name}" eliminada.`, { type: 'info' });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));

    const drawButton = panel.querySelector('#btn-sortear-zonas');
    const topDrawButton = panel.querySelector('#btn-sortear-zonas-top');
    const runDraw = () => {
        const leaders = Object.fromEntries(
            [...panel.querySelectorAll('.seed-selector')]
                .filter(select => select.value && !select.disabled)
                .map(select => [select.dataset.zone, select.value])
        );
        try {
            DataManager.drawZones(tournamentId, categoryId, leaders);
            showToast('Equipos distribuidos equilibradamente en las zonas.', { type: 'success' });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    };

    const updateSeedStatus = () => {
        if (!drawButton) return;
        const selected = [...panel.querySelectorAll('.seed-selector')].map(select => select.value).filter(Boolean);
        const duplicated = selected.length !== new Set(selected).size;
        const message = panel.querySelector('#seed-validation');
        drawButton.disabled = duplicated || freeTeams.length === 0;
        if (topDrawButton) topDrawButton.disabled = duplicated || freeTeams.length === 0;
        if (message) {
            message.textContent = duplicated
                ? 'Un mismo equipo no puede ser cabeza de serie de dos zonas.'
                : (selected.length
                    ? `${selected.length} cabeza${selected.length === 1 ? '' : 's'} de serie seleccionada${selected.length === 1 ? '' : 's'}; el resto se sorteará en cupos parejos.`
                    : 'El sorteo distribuirá de forma equilibrada los equipos libres.');
            message.classList.toggle('validation-error', duplicated);
        }
    };

    panel.querySelectorAll('.seed-selector').forEach(select => select.addEventListener('change', updateSeedStatus));
    updateSeedStatus();
    drawButton?.addEventListener('click', runDraw);
    topDrawButton?.addEventListener('click', runDraw);

    panel.querySelector('#form-interzonal-zona')?.addEventListener('submit', event => {
        event.preventDefault();
        const localId = panel.querySelector('#interzonal-local')?.value;
        const awayId = panel.querySelector('#interzonal-visitante')?.value;
        try {
            ReclassificationEngine.createInterzonalMatch(tournamentId, categoryId, localId, awayId, { confirmImmediately: true });
            showToast('Partido interzonal agregado y confirmado.', { type: 'success' });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    });

    panel.querySelectorAll('.quitar-interzonal').forEach(btn => btn.addEventListener('click', () => {
        try {
            DataManager.removeMatch(btn.dataset.id);
            showToast('Partido interzonal eliminado.', { type: 'info' });
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));
};
