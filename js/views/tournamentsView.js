import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { LicenciaRepo } from '../data/licenseRepo.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { FormatRegistry } from '../engine/index.js';
import { formatLabelFor, TOURNAMENT_MODALITY_PRESETS } from './formatConfigurator.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/feedback.js';

const downloadJson = (filename, payload) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const initTorneosVer = async () => {
    const view = document.getElementById('view-torneos');
    const license = await LicenciaRepo.obtenerActiva();
    if (!license) { location.reload(); return; }
    const tournaments = DataManager.getTournaments();

    const stats = tournaments.reduce((acc, tournament) => {
        const categories = DataManager.getCategoriesByTournament(tournament.id);
        acc.categories += categories.length;
        categories.forEach(category => {
            acc.teams += DataManager.getTeamsByTournamentAndCategory(tournament.id, category.id).length;
            const matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id);
            acc.matches += matches.length;
            acc.finished += matches.filter(match => match.estado === 'finalizado').length;
        });
        return acc;
    }, { categories: 0, teams: 0, matches: 0, finished: 0 });

    const initialOpen = tournaments.length === 0 || license.disponibles < 1;

    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">Panel principal</span>
                <div class="form-title" style="margin-bottom:0;gap:12px;align-items:center;">
                    <h2 style="margin:0;">Mis torneos</h2>
                    <span class="calendar-chip">${license.disponibles} DISPONIBLES</span>
                </div>
                <p>Creá un nuevo torneo en segundos o abrí uno existente para administrar categorías, zonas y fixture.</p>
            </div>
            <div class="page-header-actions">
                <div class="ui-dropdown" data-dropdown>
                    <button type="button" class="btn-secondary" data-dropdown-trigger aria-expanded="false">
                        ${icon('database', { size: 16 })}
                        <span>Respaldos</span>
                        ${icon('chevronDown', { size: 15 })}
                    </button>
                    <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                        ${tournaments.length ? `<button id="btn-exportar-respaldo" type="button" class="ui-dropdown-item">${icon('download', { size: 15 })}<span>Exportar respaldo (.json)</span></button>` : '<button id="btn-exportar-respaldo" type="button" class="ui-dropdown-item" hidden>Exportar respaldo</button>'}
                        <label class="ui-dropdown-item backup-import-label" style="margin:0;cursor:pointer;">
                            ${icon('upload', { size: 15 })}
                            <span>Importar respaldo (.json)</span>
                            <input id="input-importar-respaldo" type="file" accept="application/json,.json" hidden>
                        </label>
                    </div>
                </div>
                <button id="btn-toggle-crear-torneo" type="button" class="btn-primary" ${license.disponibles < 1 ? 'disabled' : ''}>
                    ${icon('plus', { size: 17 })}
                    <span>Nuevo torneo</span>
                </button>
            </div>
        </div>

        ${tournaments.length ? `
            <div class="kpi-grid" style="margin-bottom: var(--space-5);" aria-label="Resumen general">
                <div class="kpi-card"><span class="kpi-label">Torneos activos</span><strong class="kpi-value">${tournaments.length}</strong></div>
                <div class="kpi-card"><span class="kpi-label">Categorías</span><strong class="kpi-value">${stats.categories}</strong></div>
                <div class="kpi-card"><span class="kpi-label">Equipos inscriptos</span><strong class="kpi-value">${stats.teams}</strong></div>
                <div class="kpi-card"><span class="kpi-label">Partidos jugados</span><strong class="kpi-value">${stats.finished} / ${stats.matches}</strong></div>
            </div>
        ` : ''}

        <details id="panel-crear-torneo" class="collapsible-panel" ${initialOpen ? 'open' : ''}>
            <summary>
                <span>${icon('plus', { size: 16 })} Paso 1 — Crear nuevo torneo</span>
                <span class="helper-text">Completá los datos básicos; luego podrás personalizar cada categoría</span>
            </summary>
            <div class="collapsible-body">
                <form id="form-nuevo-torneo" class="form-grid">
                    <label class="form-field">Nombre del torneo
                        <input id="torneo-nombre" type="text" required maxlength="70" placeholder="Ej.: 5.º Torneo Nacional Águilas Doradas">
                    </label>
                    <label class="form-field">Organización / Sede / Ubicación
                        <input id="torneo-organizacion" type="text" maxlength="90" placeholder="Ej.: Club Águilas Doradas · Polideportivo Municipal">
                    </label>
                    <label class="form-field">Modalidad predeterminada
                        <select id="torneo-formato">
                            ${TOURNAMENT_MODALITY_PRESETS.map(preset => `<option value="${escapeHtml(preset.key)}">${escapeHtml(preset.title)}</option>`).join('')}
                            <option value="ZONAS_ZONA_FINAL">Zonas + Zona Final única</option>
                            <option value="ELIMINACION_DIRECTA">Eliminación Directa</option>
                        </select>
                    </label>
                    <label class="form-field">Canchas disponibles
                        <input id="torneo-canchas" type="number" min="1" max="20" value="2">
                    </label>
                    <label class="form-field">Partidos garantizados base
                        <input id="torneo-partidos" type="number" required min="1" max="20" value="3">
                    </label>
                    <label class="form-field">Fecha de inicio (opcional)
                        <input id="torneo-inicio" type="date">
                    </label>
                    <label class="form-field">Fecha de finalización (opcional)
                        <input id="torneo-fin" type="date">
                    </label>
                    <div class="format-summary">
                        <strong id="torneo-formato-titulo">${escapeHtml(TOURNAMENT_MODALITY_PRESETS[0].title)}</strong>
                        <span id="torneo-formato-desc">${escapeHtml(TOURNAMENT_MODALITY_PRESETS[0].subtitle)}</span>
                        <small>Cada categoría (+40, +50, +60, +68…) puede elegir su propio formato independiente dentro del torneo.</small>
                    </div>
                    <div class="form-actions">
                        <button class="btn-primary" type="submit" ${license.disponibles < 1 ? 'disabled' : ''}>Crear torneo</button>
                    </div>
                </form>
                ${license.disponibles < 1 ? `<div class="license-credit-warning"><p>No tenés torneos disponibles. Contactá al administrador para adquirir más.</p><button id="btn-renovar-licencia" type="button" class="btn-secondary">Cambiar licencia</button></div>` : ''}
            </div>
        </details>

        <div id="torneos-list" class="grid-cards">${tournaments.length ? tournaments.map(tournament => {
            const cats = DataManager.getCategoriesByTournament(tournament.id);
            const teamsCount = cats.reduce((sum, c) => sum + DataManager.getTeamsByTournamentAndCategory(tournament.id, c.id).length, 0);
            const matches = cats.flatMap(c => DataManager.getMatchesByTournamentAndCategory(tournament.id, c.id));
            const finished = matches.filter(m => m.estado === 'finalizado').length;
            const period = tournament.startDate && tournament.endDate ? `${tournament.startDate} → ${tournament.endDate}` : 'Fechas pendientes';
            return `
            <article class="card torneo-card">
                <div class="section-card-head" style="margin-bottom: 10px;">
                    <span class="calendar-chip">${escapeHtml(tournament.organizacion || 'TORNEO')}</span>
                    <div class="ui-dropdown" data-dropdown>
                        <button type="button" class="btn-icon" data-dropdown-trigger aria-label="Opciones del torneo" aria-expanded="false">${icon('moreHorizontal', { size: 18 })}</button>
                        <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                            <button type="button" class="ui-dropdown-item is-danger eliminar-torneo" data-id="${escapeHtml(tournament.id)}">Eliminar</button>
                        </div>
                    </div>
                </div>
                <h3 style="margin-bottom: 6px;">${escapeHtml(tournament.nombre)}</h3>
                <p style="font-size: var(--text-sm); margin-bottom: 10px;">${escapeHtml(formatLabelFor(tournament.defaultFormatConfig))}</p>
                <small class="helper-text" style="display:block; margin-bottom: 14px;">
                    ${cats.length} categoría${cats.length === 1 ? '' : 's'} · ${teamsCount} equipo${teamsCount === 1 ? '' : 's'} · ${tournament.cantidadCanchas || 2} cancha${(tournament.cantidadCanchas || 2) === 1 ? '' : 's'}<br>
                    ${escapeHtml(period)}${matches.length ? ` · ${finished}/${matches.length} jugados` : ''}
                </small>
                <div class="card-actions">
                    <button class="btn-primary seleccionar-torneo" type="button" data-id="${escapeHtml(tournament.id)}">
                        <span>Abrir torneo</span>
                        ${icon('arrowRight', { size: 16 })}
                    </button>
                </div>
            </article>`;
        }).join('') : `<div class="empty-state"><span class="empty-state-icon">${icon('trophy', { size: 22 })}</span><strong>Todavía no hay torneos</strong><p>Completá los datos básicos arriba para crear el primero.</p></div>`}</div>`;

    const createPanel = view.querySelector('#panel-crear-torneo');
    view.querySelector('#btn-toggle-crear-torneo')?.addEventListener('click', () => {
        if (!createPanel) return;
        createPanel.open = true;
        createPanel.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        view.querySelector('#torneo-nombre')?.focus();
    });

    const formatSelect = view.querySelector('#torneo-formato');
    const formatTitle = view.querySelector('#torneo-formato-titulo');
    const formatDesc = view.querySelector('#torneo-formato-desc');
    formatSelect?.addEventListener('change', () => {
        const val = formatSelect.value;
        const preset = TOURNAMENT_MODALITY_PRESETS.find(item => item.key === val);
        if (preset) {
            formatTitle.textContent = preset.title;
            formatDesc.textContent = preset.subtitle;
            return;
        }
        const selected = FormatRegistry.get(val);
        if (selected) {
            formatTitle.textContent = selected.name;
            formatDesc.textContent = selected.shortDescription;
        }
    });

    view.querySelector('#form-nuevo-torneo').addEventListener('submit', async event => {
        event.preventDefault();
        const name = view.querySelector('#torneo-nombre').value.trim();
        const assured = Number(view.querySelector('#torneo-partidos').value);
        const organizacion = view.querySelector('#torneo-organizacion')?.value.trim() || '';
        const selectedVal = view.querySelector('#torneo-formato')?.value || 'GARANTIZADOS_ACTUAL';
        const cantidadCanchas = Number(view.querySelector('#torneo-canchas')?.value || 2);
        const startDate = view.querySelector('#torneo-inicio')?.value || '';
        const endDate = view.querySelector('#torneo-fin')?.value || '';
        if (!name || !Number.isInteger(assured) || assured < 1) {
            showToast('Ingresá un nombre y una cantidad válida de partidos.', { type: 'error' });
            return;
        }
        if (startDate && endDate && startDate > endDate) {
            showToast('La fecha de inicio debe ser anterior o igual a la fecha de finalización.', { type: 'error' });
            return;
        }
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const preset = TOURNAMENT_MODALITY_PRESETS.find(item => item.key === selectedVal);
            const defaultFormatConfig = preset
                ? preset.build(assured)
                : FormatRegistry.createConfig(selectedVal);
            await LicenciaRepo.consumirTorneo();
            DataManager.createTournament(name, assured, {
                organizacion,
                cantidadCanchas,
                startDate: startDate || null,
                endDate: endDate || null,
                defaultFormatConfig
            });
            AppState.clear();
            showToast(`Torneo "${name}" creado correctamente.`, { type: 'success' });
            await initTorneosVer();
        } catch (error) {
            showToast(error.message, { type: 'error' });
            button.disabled = false;
        }
    });

    view.querySelector('#btn-exportar-respaldo')?.addEventListener('click', () => {
        const snapshot = DataManager.exportBackupSnapshot();
        downloadJson(`n3com-respaldo-${new Date().toISOString().slice(0, 10)}.json`, snapshot);
        showToast('Respaldo JSON descargado.', { type: 'success' });
    });

    view.querySelector('#input-importar-respaldo')?.addEventListener('change', async event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const result = DataManager.importBackupSnapshot(text, { mode: 'merge' });
            showToast(`Importación completada: ${result.importedTournaments} torneo(s) agregado(s)${result.skippedTournaments ? ` (${result.skippedTournaments} ya existían)` : ''}.`, { type: 'success' });
            await initTorneosVer();
        } catch (error) {
            showToast(error.message || 'No se pudo importar el archivo de respaldo.', { type: 'error' });
        } finally {
            event.currentTarget.value = '';
        }
    });

    view.querySelector('#btn-renovar-licencia')?.addEventListener('click', () => {
        LicenciaRepo.cerrarActivacion();
        location.reload();
    });

    view.querySelectorAll('.seleccionar-torneo').forEach(button => button.addEventListener('click', () => {
        AppState.setTournament(button.dataset.id);
        const categories = DataManager.getCategoriesByTournament(button.dataset.id);
        if (categories.length) AppState.setCategory(categories[0].id);
        goToTournament(button.dataset.id);
    }));

    view.querySelectorAll('.eliminar-torneo').forEach(button => button.addEventListener('click', () => {
        const tournament = DataManager.getTournament(button.dataset.id);
        if (!tournament) return;
        const message = `¿Eliminar el torneo "${tournament.nombre}"?\n\nSe borran sus categorías, equipos, zonas, calendario y partidos. Esta acción no se puede deshacer.`;
        if (!window.confirm(message)) return;
        try {
            DataManager.removeTournament(tournament.id);
            let activeTournament = null;
            try { activeTournament = AppState.getTournament(); } catch { activeTournament = null; }
            if (activeTournament === tournament.id) AppState.clear();
            showToast(`Torneo "${tournament.nombre}" eliminado.`, { type: 'info' });
            void initTorneosVer();
        } catch (error) {
            showToast(error.message, { type: 'error' });
        }
    }));
};
