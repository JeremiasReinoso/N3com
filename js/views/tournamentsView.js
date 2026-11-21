import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { DataManager } from '../data/dataManager.js';
import { LicenciaRepo } from '../data/licenseRepo.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { FormatRegistry } from '../engine/index.js';
import { formatLabelFor } from './formatConfigurator.js';

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
    const formats = FormatRegistry.list().filter(item => ['A', 'B', 'C', 'D', 'E', 'F'].includes(item.code));

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

    view.innerHTML = `
        <div class="form-card panel-control">
            <div class="form-title"><div><h2>Mis torneos</h2><p>Creá un torneo con su formato de competición y luego organizá sus categorías, equipos y fixture.</p></div><span class="calendar-chip">${license.disponibles} DISPONIBLES</span></div>
            <form id="form-nuevo-torneo" class="form-grid">
                <label class="form-field">Nombre del torneo<input id="torneo-nombre" type="text" required maxlength="70" placeholder="Ej.: Copa Primavera"></label>
                <label class="form-field">Organización / Club<input id="torneo-organizacion" type="text" maxlength="90" placeholder="Ej.: Asociación Regional de Newcom"></label>
                <label class="form-field">Formato predeterminado
                    <select id="torneo-formato">
                        ${formats.map(item => `<option value="${escapeHtml(item.id)}">Formato ${escapeHtml(item.code)} — ${escapeHtml(item.name)}</option>`).join('')}
                    </select>
                </label>
                <label class="form-field">Partidos por equipo<input id="torneo-partidos" type="number" required min="1" value="3"></label>
                <label class="form-field">Canchas disponibles<input id="torneo-canchas" type="number" min="1" max="20" value="2"></label>
                <label class="form-field">Fecha de inicio (opcional)<input id="torneo-inicio" type="date"></label>
                <label class="form-field">Fecha de fin (opcional)<input id="torneo-fin" type="date"></label>
                <div class="format-summary"><strong id="torneo-formato-titulo">Formato A — Zonas + Eliminatorias</strong><span id="torneo-formato-desc">${escapeHtml(formats[0].shortDescription)}</span><small>Cada categoría podrá personalizar su propio formato y reglas de clasificación. Todos los resultados usan sets reales.</small></div>
                <div class="form-actions"><button class="btn-primary" type="submit" ${license.disponibles < 1 ? 'disabled' : ''}>Crear torneo</button></div>
            </form>${license.disponibles < 1 ? '<div class="license-credit-warning"><p>No tenés torneos disponibles. Contactá al administrador para adquirir más.</p><button id="btn-renovar-licencia" type="button" class="btn-secondary">Renovar licencia</button></div>' : ''}
        </div>
        ${tournaments.length ? `<section class="panel-control tournaments-overview-bar" aria-label="Resumen e historial">
            <div class="tournament-home-summary">
                <div><span>Torneos</span><strong>${tournaments.length}</strong></div>
                <div><span>Categorías</span><strong>${stats.categories}</strong></div>
                <div><span>Equipos</span><strong>${stats.teams}</strong></div>
                <div><span>Partidos jugados</span><strong>${stats.finished}/${stats.matches}</strong></div>
            </div>
            <div class="form-actions">
                <button id="btn-exportar-respaldo" type="button" class="btn-secondary">Exportar respaldo (.json)</button>
                <label class="btn-secondary backup-import-label">Importar respaldo (.json)<input id="input-importar-respaldo" type="file" accept="application/json,.json" hidden></label>
            </div>
        </section>` : `<div class="panel-control tournaments-backup-empty"><button id="btn-exportar-respaldo" type="button" class="btn-secondary" hidden>Exportar respaldo</button><label class="btn-secondary backup-import-label">Importar respaldo (.json)<input id="input-importar-respaldo" type="file" accept="application/json,.json" hidden></label></div>`}
        <div id="torneos-list" class="grid-cards">${tournaments.length ? tournaments.map(tournament => {
            const catCount = DataManager.getCategoriesByTournament(tournament.id).length;
            const period = tournament.startDate && tournament.endDate ? `${tournament.startDate} → ${tournament.endDate}` : 'Fechas pendientes';
            return `
            <article class="card torneo-card">
                <span class="calendar-chip">${escapeHtml(tournament.organizacion || 'TORNEO')}</span>
                <h3>${escapeHtml(tournament.nombre)}</h3>
                <p>${escapeHtml(formatLabelFor(tournament.defaultFormatConfig))}</p>
                <small class="helper-text">${catCount} categoría${catCount === 1 ? '' : 's'} · ${tournament.cantidadCanchas || 2} cancha${(tournament.cantidadCanchas || 2) === 1 ? '' : 's'} · ${escapeHtml(period)}</small>
                <div class="card-actions"><button class="btn-primary seleccionar-torneo" data-id="${escapeHtml(tournament.id)}">Abrir torneo</button><button class="btn-danger eliminar-torneo" data-id="${escapeHtml(tournament.id)}">Eliminar</button></div>
            </article>`;
        }).join('') : '<div class="empty-state">Todavía no hay torneos. Completá el formulario para crear el primero.</div>'}</div>`;

    const formatSelect = view.querySelector('#torneo-formato');
    const formatTitle = view.querySelector('#torneo-formato-titulo');
    const formatDesc = view.querySelector('#torneo-formato-desc');
    formatSelect?.addEventListener('change', () => {
        const selected = FormatRegistry.get(formatSelect.value);
        if (!selected) return;
        formatTitle.textContent = `Formato ${selected.code} — ${selected.name}`;
        formatDesc.textContent = selected.shortDescription;
    });

    view.querySelector('#form-nuevo-torneo').addEventListener('submit', async event => {
        event.preventDefault();
        const name = view.querySelector('#torneo-nombre').value.trim();
        const assured = Number(view.querySelector('#torneo-partidos').value);
        const organizacion = view.querySelector('#torneo-organizacion')?.value.trim() || '';
        const formatId = view.querySelector('#torneo-formato')?.value || 'ZONAS_ELIMINATORIAS';
        const cantidadCanchas = Number(view.querySelector('#torneo-canchas')?.value || 2);
        const startDate = view.querySelector('#torneo-inicio')?.value || '';
        const endDate = view.querySelector('#torneo-fin')?.value || '';
        if (!name || !Number.isInteger(assured) || assured < 1) return alert('Ingrese un nombre y una cantidad válida de partidos.');
        if (startDate && endDate && startDate > endDate) return alert('La fecha de inicio debe ser anterior o igual a la fecha de finalización.');
        const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
        try {
            const defaultFormatConfig = FormatRegistry.createConfig(formatId, formatId === 'ZONAS_ELIMINATORIAS' ? { guaranteedMatches: assured } : {});
            await LicenciaRepo.consumirTorneo();
            DataManager.createTournament(name, assured, {
                organizacion,
                cantidadCanchas,
                startDate: startDate || null,
                endDate: endDate || null,
                defaultFormatConfig
            });
            AppState.clear();
            await initTorneosVer();
        } catch (error) { alert(error.message); button.disabled = false; }
    });
    view.querySelector('#btn-exportar-respaldo')?.addEventListener('click', () => {
        const snapshot = DataManager.exportBackupSnapshot();
        downloadJson(`n3com-respaldo-${new Date().toISOString().slice(0, 10)}.json`, snapshot);
    });
    view.querySelector('#input-importar-respaldo')?.addEventListener('change', async event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const result = DataManager.importBackupSnapshot(text, { mode: 'merge' });
            alert(`Importación completada: ${result.importedTournaments} torneo(s) agregado(s)${result.skippedTournaments ? ` (${result.skippedTournaments} ya existían)` : ''}.`);
            await initTorneosVer();
        } catch (error) {
            alert(error.message || 'No se pudo importar el archivo de respaldo.');
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
        if (!confirm(message)) return;
        try {
            DataManager.removeTournament(tournament.id);
            let activeTournament = null;
            try { activeTournament = AppState.getTournament(); } catch { activeTournament = null; }
            if (activeTournament === tournament.id) AppState.clear();
            void initTorneosVer();
        } catch (error) { alert(error.message); }
    }));
};
