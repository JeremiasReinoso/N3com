import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine, ReclassificationEngine } from '../engine/index.js';
import { formatLabelFor } from './formatConfigurator.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, promptDialog, showToast } from '../ui/feedback.js';

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
    const matches = DataManager.getMatchesByTournamentAndCategory(tournamentId, categoryId);
    const formatInfo = CompetitionEngine.getCategoryFormat(tournamentId, categoryId);
    const needsZones = formatInfo.definition.requiresZones || formatInfo.config.stages?.[0]?.type === 'ZONAS';
    const teamName = id => teams.find(team => team.id === id)?.nombre || 'Equipo';
    const freeTeams = teams.filter(team => !team.zonaId);
    const assignedCount = teams.length - freeTeams.length;
    const interzonalMatches = matches.filter(m => m.interzonal);

    const zoneSelectOptions = (currentZoneId, placeholder) =>
        `<option value="" ${currentZoneId ? '' : 'selected'}>${escapeHtml(placeholder)}</option>`
        + zones.map(zone => `<option value="${escapeHtml(zone.id)}" ${zone.id === currentZoneId ? 'selected' : ''}>${escapeHtml(zone.nombre)}</option>`).join('');

    const nextLetter = String.fromCharCode(65 + zones.length);

    alertBox.style.display = 'none';
    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">Distribución de grupos · ${escapeHtml(category.nombre)}</span>
                <h2>Zonas — ${escapeHtml(category.nombre)}</h2>
                <p>
                    ${escapeHtml(formatLabelFor(formatInfo.config))} ·
                    <strong>${assignedCount} de ${teams.length}</strong> equipos asignados en <strong>${zones.length}</strong> zona${zones.length === 1 ? '' : 's'}.
                </p>
            </div>
            <div class="page-header-actions">
                ${zones.length && freeTeams.length ? `
                    <button type="button" id="btn-sortear-zonas-top" class="btn-primary">
                        ${icon('shuffle', { size: 16 })}
                        <span>Sortear ${freeTeams.length} equipo${freeTeams.length === 1 ? '' : 's'} libre${freeTeams.length === 1 ? '' : 's'}</span>
                    </button>
                ` : ''}
                <button type="button" id="btn-ir-programacion-zonas" class="btn-secondary">
                    <span>Ir a Programación</span>
                    ${icon('arrowRight', { size: 15 })}
                </button>
            </div>
        </div>

        ${!needsZones ? `
            <div class="planning-notice">
                <strong>Nota de modalidad:</strong> <strong>${escapeHtml(formatInfo.definition.name)}</strong> se juega sin dividir en zonas (tabla única o llave directa). Podés pasar directamente a <strong>Programación</strong> o cambiar la modalidad desde <strong>Equipos</strong>.
            </div>
        ` : ''}

        <section class="section-card">
            <form id="form-nueva-zona" class="form-grid" style="grid-template-columns: minmax(220px, 1fr) auto auto;">
                <label class="form-field">Crear nueva zona
                    <input id="zona-nombre" type="text" maxlength="40" required value="Zona ${escapeHtml(nextLetter)}" placeholder="Ej.: Zona A">
                </label>
                <div class="form-actions">
                    <button class="btn-primary" type="submit">${icon('plus', { size: 16 })}<span>Crear zona</span></button>
                </div>
                <div class="form-actions">
                    <button type="button" id="btn-zonas-rapidas" class="btn-secondary" title="Crear automáticamente Zonas A, B, C...">Crear varias zonas…</button>
                </div>
            </form>

            ${zones.length ? `
                <details class="schedule-editor" style="margin-top: var(--space-4);">
                    <summary>${icon('star', { size: 15 })} Cabezas de serie y sorteo automático (opcional)</summary>
                    <div class="seed-draw" style="margin-top: 0; border: 0; border-radius: 0;">
                        <div class="seed-draw-head">
                            <div>
                                <p>Las cabezas de serie quedan fijas en su zona; el sorteo reparte equilibradamente solo los equipos sin zona.</p>
                            </div>
                            <button type="button" id="btn-sortear-zonas" class="btn-primary" ${freeTeams.length ? '' : 'disabled'}>
                                ${icon('shuffle', { size: 16 })}
                                <span>Sortear equipos sin zona</span>
                            </button>
                        </div>
                        <div class="seed-grid">${zones.map(zone => {
                            const selectedLeader = zone.liderEquipoId && teams.find(team => team.id === zone.liderEquipoId && team.zonaId === zone.id) ? zone.liderEquipoId : '';
                            const candidates = selectedLeader ? teams.filter(team => team.id === selectedLeader) : freeTeams;
                            return `<label class="seed-choice"><span>${escapeHtml(zone.nombre)}</span><select class="seed-selector" data-zone="${escapeHtml(zone.id)}" ${selectedLeader ? 'disabled' : ''}><option value="">${selectedLeader ? 'Cabeza de serie fija' : 'Sin cabeza de serie'}</option>${candidates.map(team => `<option value="${escapeHtml(team.id)}" ${team.id === selectedLeader ? 'selected' : ''}>${escapeHtml(team.nombre)}</option>`).join('')}</select></label>`;
                        }).join('')}</div>
                        <p id="seed-validation" class="helper-text">El sorteo asignará únicamente los equipos sin zona.</p>
                    </div>
                </details>
            ` : ''}
        </section>

        ${freeTeams.length ? `
            <section class="zones-workspace">
                <div class="zones-section-head">
                    <div>
                        <h3>Equipos pendientes de ubicar</h3>
                        <p>Asignalos manualmente a una zona o utilizá el botón de sorteo automático.</p>
                    </div>
                    <span>${freeTeams.length}</span>
                </div>
                <div class="zone-team-grid">
                    ${freeTeams.map(team => `
                        <article class="free-team-card">
                            <strong>${escapeHtml(team.nombre)}</strong>
                            ${zones.length ? `<label>Ubicar en zona<select class="asignar-zona" data-team="${escapeHtml(team.id)}">${zoneSelectOptions('', 'Seleccionar zona…')}</select></label>` : '<small class="helper-text">Creá primero al menos una zona.</small>'}
                        </article>`).join('')}
                </div>
            </section>
        ` : ''}

        <section class="zones-workspace">
            <div class="zones-section-head">
                <div>
                    <h3>Zonas conformadas</h3>
                    <p>${zones.length ? 'Podés mover equipos entre zonas desde el selector de cada fila.' : 'Todavía no se crearon zonas en esta categoría.'}</p>
                </div>
                <span>${zones.length}</span>
            </div>
            ${zones.length ? `<div class="zones-grid">${zones.map(zone => {
                const zoneTeams = teams.filter(team => team.zonaId === zone.id);
                const leader = zone.liderEquipoId ? teamName(zone.liderEquipoId) : null;
                return `
                    <article class="zone-card">
                        <header>
                            <div>
                                <span class="stage-pill stage-pill-zonas">${zoneTeams.length} EQUIPO${zoneTeams.length === 1 ? '' : 'S'}</span>
                                <h3>${escapeHtml(zone.nombre)}</h3>
                            </div>
                            <div class="zone-card-controls">
                                ${leader ? `<span class="leader-badge" title="Cabeza de serie">★ ${escapeHtml(leader)}</span>` : ''}
                                <div class="ui-dropdown" data-dropdown>
                                    <button type="button" class="btn-icon" data-dropdown-trigger aria-label="Opciones de ${escapeHtml(zone.nombre)}" aria-expanded="false">${icon('moreHorizontal', { size: 18 })}</button>
                                    <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                                        ${leader ? `<button type="button" class="ui-dropdown-item liberar-lider" data-zone="${escapeHtml(zone.id)}">${icon('unlock', { size: 15 })}<span>Liberar cabeza de serie</span></button>` : ''}
                                        <button type="button" class="ui-dropdown-item renombrar-zona" data-zone="${escapeHtml(zone.id)}" data-name="${escapeHtml(zone.nombre)}">${icon('pencil', { size: 15 })}<span>Renombrar zona</span></button>
                                        <button type="button" class="ui-dropdown-item is-danger eliminar-zona" data-zone="${escapeHtml(zone.id)}" data-name="${escapeHtml(zone.nombre)}">${icon('trash', { size: 15 })}<span>Eliminar zona</span></button>
                                    </div>
                                </div>
                            </div>
                        </header>
                        <div class="zone-team-list">
                            ${zoneTeams.length ? zoneTeams.map(team => `
                                <div class="zone-team ${team.id === zone.liderEquipoId ? 'leader' : ''}">
                                    <strong>${escapeHtml(team.nombre)}${team.id === zone.liderEquipoId ? ' <small>cabeza de serie</small>' : ''}</strong>
                                    ${team.id === zone.liderEquipoId
                                        ? '<small class="helper-text">Fija</small>'
                                        : `<div class="zone-team-actions">
                                            <select class="asignar-zona" data-team="${escapeHtml(team.id)}" aria-label="Mover ${escapeHtml(team.nombre)} de zona">${zoneSelectOptions(zone.id, 'Mover a…')}</select>
                                            <button type="button" class="btn-icon quitar-de-zona" data-team="${escapeHtml(team.id)}" title="Dejar sin zona" aria-label="Quitar de la zona">${icon('x', { size: 15 })}</button>
                                        </div>`}
                                </div>`).join('') : '<p class="helper-text" style="padding: 14px;">Sin equipos asignados.</p>'}
                        </div>
                    </article>`;
            }).join('')}</div>` : `<div class="empty-state"><span class="empty-state-icon">${icon('layers', { size: 22 })}</span><strong>Aún no hay zonas creadas</strong><p>Creá las zonas arriba (por ejemplo Zona A, Zona B, Zona C) para distribuir los equipos.</p></div>`}
        </section>

        ${zones.length >= 2 && assignedCount >= 4 ? `
            <details class="collapsible-panel" style="margin-top: var(--space-5);" ${interzonalMatches.length ? 'open' : ''}>
                <summary>
                    <span>Cruces interzonales opcionales (para zonas de distinto tamaño, ej. Zona C vs Zona D)</span>
                    <span class="stage-pill stage-pill-interzonal">${interzonalMatches.length} CREADO${interzonalMatches.length === 1 ? '' : 'S'}</span>
                </summary>
                <div class="collapsible-body">
                    <p class="helper-text" style="margin-bottom: 12px;">
                        Si tenés zonas de 4 equipos y zonas de 3 equipos (como en +50 de 14 equipos), podés sumar 1 partido interzonal entre las zonas más chicas para que todos jueguen la misma cantidad de partidos el Día 1. El resultado suma para cada equipo en su propia zona.
                    </p>
                    <form id="form-interzonal-zona" class="form-grid" style="grid-template-columns: minmax(200px, 1fr) minmax(200px, 1fr) auto;">
                        <label class="form-field">Equipo A (con zona asignada)
                            <select id="interzonal-local" required>
                                <option value="">Seleccionar equipo…</option>
                                ${zones.map(z => `<optgroup label="${escapeHtml(z.nombre)} (${teams.filter(t => t.zonaId === z.id).length} eq.)">${teams.filter(t => t.zonaId === z.id).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nombre)} (${escapeHtml(z.nombre)})</option>`).join('')}</optgroup>`).join('')}
                            </select>
                        </label>
                        <label class="form-field">Equipo B (de otra zona)
                            <select id="interzonal-visitante" required>
                                <option value="">Seleccionar rival…</option>
                                ${zones.map(z => `<optgroup label="${escapeHtml(z.nombre)} (${teams.filter(t => t.zonaId === z.id).length} eq.)">${teams.filter(t => t.zonaId === z.id).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nombre)} (${escapeHtml(z.nombre)})</option>`).join('')}</optgroup>`).join('')}
                            </select>
                        </label>
                        <div class="form-actions">
                            <button type="submit" class="btn-secondary">${icon('plus', { size: 15 })}<span>Agregar interzonal</span></button>
                        </div>
                    </form>
                    ${interzonalMatches.length ? `
                        <div class="draft-fixture-list" style="margin-top: 14px;">
                            ${interzonalMatches.map(m => `
                                <div class="draft-fixture-row">
                                    <span class="stage-pill stage-pill-interzonal">${escapeHtml(m.nombreEtapa || 'Interzonal')}</span>
                                    <strong>${escapeHtml(teamName(m.equipoLocalId))} <b>vs</b> ${escapeHtml(teamName(m.equipoVisitanteId))}</strong>
                                    ${m.estado === 'finalizado' ? `<span class="badge badge-success">${escapeHtml(m.score)}</span>` : `<button type="button" class="btn-secondary btn-sm quitar-interzonal" data-id="${escapeHtml(m.id)}">Quitar</button>`}
                                </div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            </details>
        ` : ''}`;

    panel.querySelector('#btn-ir-programacion-zonas')?.addEventListener('click', () => {
        goToTournament(tournamentId, 'programacion');
    });

    panel.querySelector('#form-nueva-zona').addEventListener('submit', event => {
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
            message: 'Indicá cuántas zonas en total tendrá esta categoría (se nombrarán Zona A, Zona B, Zona C…).',
            label: 'Cantidad total de zonas',
            type: 'number',
            value: String(Math.max(2, zones.length || 3)),
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
            DataManager.assignTeamToZone(select.dataset.team, select.value);
            initZonasView();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));

    panel.querySelectorAll('.quitar-de-zona').forEach(button => button.addEventListener('click', () => {
        try {
            DataManager.unassignTeamFromZone(button.dataset.team);
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
            message: 'Los equipos asignados volverán a quedar sin zona.',
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
                    : 'El sorteo distribuirá de forma equilibrada los equipos sin zona.');
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
