import { AppState } from '../core/state.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { goToTournament } from '../core/tournamentRoute.js';
import { DataManager } from '../data/dataManager.js';
import { CompetitionEngine, SchedulingEngine } from '../engine/index.js';
import { formatLabelFor } from './formatConfigurator.js';

const downloadTournamentBackup = tournament => {
    const snapshot = DataManager.exportBackupSnapshot(tournament.id);
    const slug = String(tournament.nombre || 'torneo').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `n3com-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function initTournamentHomeView() {
    const view = document.getElementById('view-inicio');
    let tournamentId;
    try { tournamentId = AppState.getTournament(); } catch { tournamentId = null; }
    const tournament = tournamentId ? DataManager.getTournament(tournamentId) : null;
    if (!tournament) {
        view.innerHTML = '<h2>Inicio del torneo</h2><div class="empty-state">Seleccione un torneo para ver su resumen.</div>';
        return;
    }

    const categories = DataManager.getCategoriesByTournament(tournamentId);
    const courts = DataManager.getTournamentCourts(tournamentId);
    const dates = DataManager.getCalendarDates(tournamentId);
    const conflicts = SchedulingEngine.getConflicts(tournamentId);
    const totalTeams = categories.reduce((sum, cat) => sum + DataManager.getTeamsByTournamentAndCategory(tournamentId, cat.id).length, 0);
    const allMatches = categories.flatMap(cat => DataManager.getMatchesByTournamentAndCategory(tournamentId, cat.id));
    const finishedMatches = allMatches.filter(match => match.estado === 'finalizado').length;
    const totalSets = allMatches.reduce((sum, match) => sum + (Array.isArray(match.sets) ? match.sets.length : 0), 0);

    view.innerHTML = `
        <section class="form-card panel-control tournament-dashboard-head">
            <div class="form-title">
                <div>
                    <span class="eyebrow">${escapeHtml(tournament.organizacion || 'ORGANIZACIÓN DE TORNEO')}</span>
                    <h2>${escapeHtml(tournament.nombre)}</h2>
                    <p>Formato predeterminado: <strong>${escapeHtml(formatLabelFor(tournament.defaultFormatConfig))}</strong> · ${dates.length ? `${dates[0]} → ${dates.at(-1)} (${dates.length} jornada${dates.length === 1 ? '' : 's'})` : 'Calendario sin configurar'}</p>
                </div>
                <div class="form-actions">
                    <button id="btn-backup-torneo" type="button" class="btn-secondary">Respaldar torneo (.json)</button>
                </div>
            </div>
            <div class="tournament-home-summary" aria-label="Indicadores del torneo">
                <div><span>Categorías</span><strong>${categories.length}</strong></div>
                <div><span>Equipos</span><strong>${totalTeams}</strong></div>
                <div><span>Canchas</span><strong>${courts.length}</strong></div>
                <div><span>Partidos jugados</span><strong>${finishedMatches}/${allMatches.length}</strong></div>
                <div><span>Sets registrados</span><strong>${totalSets}</strong></div>
                <div><span>Alertas logísticas</span><strong>${conflicts.length}</strong></div>
            </div>
        </section>

        <section class="panel-control">
            <div class="form-title">
                <div><h3>Estado por categoría</h3><p>Cada categoría conserva su propio formato de competición, reglas de clasificación y descanso.</p></div>
                <button id="btn-ir-equipos" type="button" class="btn-primary">+ Administrar categorías</button>
            </div>
            <div class="grid-cards">
                ${categories.length ? categories.map(category => {
                    const status = CompetitionEngine.getCategoryStatus(tournamentId, category.id);
                    const format = CompetitionEngine.getCategoryFormat(tournamentId, category.id);
                    const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, category.id).length;
                    const zones = DataManager.getZonesByTournamentAndCategory(tournamentId, category.id).length;
                    return `<article class="card category-dashboard-card">
                        <span class="calendar-chip">FORMATO ${escapeHtml(format.definition.code || 'A')}</span>
                        <h3>${escapeHtml(category.nombre)}</h3>
                        <p>${escapeHtml(formatLabelFor(format.config))}</p>
                        <small class="helper-text">${teams} equipos · ${zones} zonas · ${status.finishedMatches}/${status.officialMatches} jugados${status.champion ? ` · Campeón: ${status.champion.nombre}` : ''}</small>
                        <div class="card-actions">
                            <button type="button" class="btn-secondary jump-cat" data-cat="${escapeHtml(category.id)}" data-section="equipos">Configurar</button>
                            <button type="button" class="btn-primary jump-cat" data-cat="${escapeHtml(category.id)}" data-section="programacion">Fixture</button>
                            <button type="button" class="btn-secondary jump-cat" data-cat="${escapeHtml(category.id)}" data-section="posiciones">Posiciones</button>
                        </div>
                    </article>`;
                }).join('') : '<div class="empty-state">Agregá la primera categoría desde la pestaña Equipos para comenzar.</div>'}
            </div>
        </section>

        <details class="panel-control schedule-editor">
            <summary>Editar datos generales e identidad del torneo</summary>
            <form id="form-editar-torneo" class="form-grid">
                <label class="form-field">Nombre del torneo<input name="nombre" type="text" required maxlength="70" value="${escapeHtml(tournament.nombre)}"></label>
                <label class="form-field">Organización / Club / Federación<input name="organizacion" type="text" maxlength="90" value="${escapeHtml(tournament.organizacion || '')}"></label>
                <label class="form-field">Partidos asegurados predeterminados<input name="partidos" type="number" min="1" max="20" required value="${Number(tournament.partidos_asegurados || 3)}"></label>
                <label class="form-field">Marca / Etiqueta en reportes PDF<input name="brandName" type="text" maxlength="60" placeholder="Opcional" value="${escapeHtml(tournament.branding?.brandName || '')}"></label>
                <label class="form-field">Edición
                    <select name="edition">
                        ${[['club', 'Club'], ['asociacion', 'Asociación'], ['federacion', 'Federación']].map(([val, lbl]) => `<option value="${val}" ${(tournament.edition || 'club') === val ? 'selected' : ''}>${lbl}</option>`).join('')}
                    </select>
                </label>
                <div class="form-actions"><button type="submit" class="btn-primary">Guardar cambios</button></div>
            </form>
        </details>`;

    view.querySelector('#btn-backup-torneo')?.addEventListener('click', () => downloadTournamentBackup(tournament));
    view.querySelector('#btn-ir-equipos')?.addEventListener('click', () => goToTournament(tournamentId, 'equipos'));
    view.querySelectorAll('.jump-cat').forEach(button => button.addEventListener('click', () => {
        AppState.setCategory(button.dataset.cat);
        goToTournament(tournamentId, button.dataset.section);
    }));
    view.querySelector('#form-editar-torneo')?.addEventListener('submit', event => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        try {
            DataManager.updateTournament(tournamentId, {
                nombre: values.get('nombre'),
                organizacion: values.get('organizacion'),
                partidos_asegurados: Number(values.get('partidos')),
                edition: values.get('edition'),
                branding: { brandName: values.get('brandName') }
            });
            initTournamentHomeView();
        } catch (error) { alert(error.message); }
    });
}
