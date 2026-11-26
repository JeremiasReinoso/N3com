import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { LicenciaRepo } from '../data/licenseRepo.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { FormatRegistry } from '../engine/index.js';
import { formatLabelFor, TOURNAMENT_MODALITY_PRESETS } from './formatConfigurator.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/feedback.js';

const formatShortRange = (startIso, endIso) => {
    if (!startIso || !endIso) return 'Fechas a definir';
    try {
        const s = new Date(`${startIso}T12:00:00`);
        const e = new Date(`${endIso}T12:00:00`);
        const fmtShort = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
        const year = e.getFullYear();
        const clean = str => str.replace('.', '');
        if (startIso === endIso) return `${clean(fmtShort.format(s))} ${year}`;
        return `${clean(fmtShort.format(s))} – ${clean(fmtShort.format(e))} ${year}`;
    } catch {
        return `${startIso} – ${endIso}`;
    }
};

export const initTorneosVer = async () => {
    const view = document.getElementById('view-torneos');
    const license = await LicenciaRepo.obtenerActiva();
    if (!license) { location.reload(); return; }
    const tournaments = DataManager.getTournaments();

    const stats = tournaments.reduce((acc, tournament) => {
        const categories = DataManager.getCategoriesByTournament(tournament.id);
        categories.forEach(category => {
            acc.teams += DataManager.getTeamsByTournamentAndCategory(tournament.id, category.id).length;
            const matches = DataManager.getMatchesByTournamentAndCategory(tournament.id, category.id)
                .filter(m => m.confirmado || m.estado !== 'borrador');
            acc.matches += matches.length;
            acc.finished += matches.filter(match => match.estado === 'finalizado').length;
        });
        return acc;
    }, { teams: 0, matches: 0, finished: 0 });

    let primaryAssigned = false;

    view.innerHTML = `
        <div class="page-header">
            <div class="page-header-main">
                <span class="page-eyebrow">PANEL PRINCIPAL</span>
                <h1>Mis torneos</h1>
                <p>Elegí un torneo para cargar equipos, zonas, fixture y resultados.</p>
            </div>
            <div class="page-header-actions">
                <button id="btn-toggle-crear-torneo" type="button" class="btn-primary" ${license.disponibles < 1 ? 'disabled' : ''}>+ Nuevo torneo</button>
            </div>
        </div>

        <div class="kpi-grid" aria-label="Resumen general">
            <div class="kpi-card">
                <span class="kpi-label">Torneos activos</span>
                <strong class="kpi-value">${tournaments.length}</strong>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Equipos inscriptos</span>
                <strong class="kpi-value">${stats.teams}</strong>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Partidos jugados</span>
                <strong class="kpi-value">${stats.finished}<span class="kpi-inline-sub">de ${stats.matches}</span></strong>
            </div>
        </div>

        ${license.disponibles < 1 ? `
            <div class="license-credit-warning">
                <p>No tenés torneos disponibles. Contactá al administrador para adquirir más.</p>
                <button id="btn-renovar-licencia" type="button" class="btn-secondary">Cambiar licencia</button>
            </div>
        ` : ''}

        <details id="panel-crear-torneo" class="collapsible-panel" ${tournaments.length === 0 && license.disponibles >= 1 ? 'open' : 'hidden'}>
            <summary>
                <span>Nuevo torneo</span>
                <div class="form-title" style="margin:0;">
                    <span class="calendar-chip">${license.disponibles} DISPONIBLES</span>
                </div>
            </summary>
            <div class="collapsible-body">
                <form id="form-nuevo-torneo" class="form-grid">
                    <label class="form-field">Nombre del torneo
                        <input id="torneo-nombre" type="text" required maxlength="70" placeholder="Ej.: 5.º Torneo Nacional Copa Patagónica">
                    </label>
                    <label class="form-field">Club / Asociación / Sede
                        <input id="torneo-organizacion" type="text" maxlength="90" placeholder="Ej.: Club Los Pioneros · S. C. de Bariloche">
                    </label>
                    <label class="form-field">Modalidad predeterminada
                        <select id="torneo-formato">
                            ${TOURNAMENT_MODALITY_PRESETS.map(preset => `<option value="${escapeHtml(preset.key)}">${escapeHtml(preset.title)}</option>`).join('')}
                            <option value="ZONAS_ZONA_FINAL">Zonas + Zona final</option>
                            <option value="ELIMINACION_DIRECTA">Eliminación directa</option>
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
                        <small>Cada categoría (+40, +50, +60, +68…) puede definir su propia modalidad independiente.</small>
                    </div>
                    <div class="form-actions">
                        <button class="btn-primary" type="submit" ${license.disponibles < 1 ? 'disabled' : ''}>Crear torneo</button>
                        <button class="btn-secondary" type="button" id="btn-cancelar-crear-torneo">Cancelar</button>
                    </div>
                </form>
            </div>
        </details>

        <div id="torneos-list" class="grid-cards">${tournaments.length ? tournaments.map(tournament => {
            const cats = DataManager.getCategoriesByTournament(tournament.id);
            const teamsCount = cats.reduce((sum, c) => sum + DataManager.getTeamsByTournamentAndCategory(tournament.id, c.id).length, 0);
            const matches = cats.flatMap(c => DataManager.getMatchesByTournamentAndCategory(tournament.id, c.id))
                .filter(m => m.confirmado || m.estado !== 'borrador');
            const finished = matches.filter(m => m.estado === 'finalizado').length;
            const courtsCount = DataManager.getTournamentCourts(tournament.id).length || tournament.cantidadCanchas || 2;
            const period = DataManager.getTournamentPeriod(tournament.id);
            const startIso = period?.startDate || tournament.startDate || '';
            const endIso = period?.endDate || tournament.endDate || '';
            const pct = matches.length ? Math.round((finished / matches.length) * 100) : 0;
            const isInProgress = matches.length > 0;
            const statusText = isInProgress ? 'En curso' : 'Próximo';
            const statusClass = isInProgress ? 'is-green' : 'is-yellow';
            const usePrimaryCta = !primaryAssigned && (isInProgress || tournaments.length === 1);
            if (usePrimaryCta) primaryAssigned = true;

            return `
            <article class="torneo-card">
                <div class="torneo-card-head">
                    <span class="chip-pill chip-blue">${escapeHtml(tournament.organizacion || 'Club / Asociación')}</span>
                    <div class="torneo-card-status-group">
                        <span class="status-dot-label ${statusClass}">${statusText}</span>
                        <div class="ui-dropdown" data-dropdown>
                            <button type="button" class="btn-icon" data-dropdown-trigger aria-label="Opciones de ${escapeHtml(tournament.nombre)}" aria-expanded="false">${icon('moreHorizontal', { size: 17 })}</button>
                            <div class="ui-dropdown-menu" data-dropdown-menu hidden>
                                <button type="button" class="ui-dropdown-item is-danger eliminar-torneo" data-id="${escapeHtml(tournament.id)}">Eliminar</button>
                            </div>
                        </div>
                    </div>
                </div>

                <h3 class="torneo-card-title">${escapeHtml(tournament.nombre)}</h3>

                <p class="torneo-card-desc">
                    ${escapeHtml(formatLabelFor(tournament.defaultFormatConfig))} ·
                    ${cats.length} categoría${cats.length === 1 ? '' : 's'} ·
                    ${teamsCount} equipo${teamsCount === 1 ? '' : 's'} ·
                    ${courtsCount} cancha${courtsCount === 1 ? '' : 's'}
                </p>

                <div class="torneo-card-progress">
                    <div class="torneo-card-progress-meta">
                        <span>${matches.length ? `${finished} de ${matches.length} partidos jugados` : 'Sin partidos cargados'}</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="progress-track" aria-hidden="true">
                        <div class="progress-fill" style="width: ${pct}%;"></div>
                    </div>
                </div>

                <p class="torneo-card-dates">${escapeHtml(formatShortRange(startIso, endIso))}</p>

                <div class="torneo-card-cta">
                    <button class="${usePrimaryCta ? 'btn-primary' : 'btn-secondary'} seleccionar-torneo" type="button" data-id="${escapeHtml(tournament.id)}">Abrir torneo →</button>
                </div>
            </article>`;
        }).join('') : `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <strong>Todavía no hay torneos</strong>
                <p>Elegí "+ Nuevo torneo" para cargar los datos básicos y empezar a armar el fixture.</p>
                ${license.disponibles >= 1 ? '<button type="button" class="btn-primary" id="btn-empty-nuevo-torneo">+ Nuevo torneo</button>' : ''}
            </div>
        `}</div>`;

    const createPanel = view.querySelector('#panel-crear-torneo');
    const openCreatePanel = () => {
        if (!createPanel) return;
        createPanel.hidden = false;
        createPanel.open = true;
        createPanel.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        view.querySelector('#torneo-nombre')?.focus();
    };
    view.querySelector('#btn-toggle-crear-torneo')?.addEventListener('click', openCreatePanel);
    view.querySelector('#btn-empty-nuevo-torneo')?.addEventListener('click', openCreatePanel);
    view.querySelector('#btn-cancelar-crear-torneo')?.addEventListener('click', () => {
        if (!createPanel) return;
        createPanel.open = false;
        if (tournaments.length > 0) createPanel.hidden = true;
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

    view.querySelector('#form-nuevo-torneo')?.addEventListener('submit', async event => {
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
            showToast('La fecha de inicio debe ser anterior o igual a la de finalización.', { type: 'error' });
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
