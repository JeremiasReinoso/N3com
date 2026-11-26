import { LicenciaRepo } from '../data/licenseRepo.js';
import { escapeHtml } from '../core/escapeHtml.js';
import { cerrarSesionAdmin } from '../core/adminAuth.js';
import { promptDialog, showToast } from '../ui/feedback.js';

const container = document.getElementById('admin-list');
const panel = document.getElementById('admin-license-form');
const summaryNode = document.getElementById('admin-summary');

// Enmascara códigos de licencia (ej.: NWC-PAAB-····). Nunca muestra códigos ni tokens completos.
const formatMaskedLicenseCode = rawCode => {
    const clean = String(rawCode || '').trim().toUpperCase();
    if (!clean) return 'NWC - · · · ·';
    const parts = clean.split('-').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} - ${parts[1]} - · · · ·`;
    return `${clean.slice(0, Math.min(8, clean.length))} - · · · ·`;
};

const formatEditionLabel = edition => {
    const key = String(edition || 'club').toLowerCase();
    if (key === 'asociacion') return 'Asociación';
    if (key === 'federacion') return 'Federación';
    return 'Club';
};

const confirmLicenseDeletion = license => new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'license-delete-dialog';
    dialog.innerHTML = `<section aria-labelledby="delete-license-title"><h3 id="delete-license-title">¿Eliminar la licencia de ${escapeHtml(license.cliente)}?</h3><p>Se borrará esta licencia y sus datos asociados. Esta acción no se puede deshacer.</p><div class="form-actions" style="justify-content:flex-end;"><button class="btn-secondary" type="button" data-action="cancel">Cancelar</button><button class="btn-danger" type="button" data-action="delete">Eliminar</button></div></section>`;
    const close = confirmed => { dialog.close(); resolve(confirmed); };
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
    dialog.querySelector('[data-action="delete"]').addEventListener('click', () => close(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
        const confirmed = confirm(`¿Eliminar la licencia de ${license.cliente}?\n\nEsta acción no se puede deshacer.`);
        dialog.remove();
        resolve(confirmed);
    }
});

const renderCreateForm = () => {
    panel.innerHTML = `
        <form id="form-crear-licencia" class="form-card panel-control">
            <div class="form-title">
                <div>
                    <h3>Nuevo cliente</h3>
                    <p>Definí los datos comerciales y los torneos iniciales habilitados.</p>
                </div>
            </div>
            <div class="form-grid">
                <label class="form-field">Nombre del cliente
                    <input name="cliente" type="text" required maxlength="90" placeholder="Ej.: Club Deportivo Los Pioneros">
                </label>
                <label class="form-field">Organización
                    <input name="organizacion" type="text" maxlength="120" placeholder="Ej.: Asociación Patagónica de Newcom">
                </label>
                <label class="form-field">Teléfono (opcional)
                    <input name="telefono" type="text" maxlength="40" placeholder="Ej.: +54 294 400-0000">
                </label>
                <label class="form-field">Tipo de entidad
                    <select name="edicion">
                        <option value="club">Club</option>
                        <option value="asociacion">Asociación</option>
                        <option value="federacion">Federación</option>
                    </select>
                </label>
                <label class="form-field">Torneos comprados
                    <input name="creditos" type="number" min="1" max="10000" value="1" required>
                </label>
            </div>
            <div class="form-actions" style="margin-top: 16px;">
                <button class="btn-primary" type="submit">Crear cliente</button>
                <button class="btn-secondary" type="button" id="cancelar-licencia">Cancelar</button>
            </div>
            <p class="license-error" aria-live="polite" style="margin-top: 8px;"></p>
        </form>`;
    panel.querySelector('input[name="cliente"]')?.focus();
    panel.querySelector('#cancelar-licencia').addEventListener('click', () => { panel.innerHTML = ''; });
    panel.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const error = form.querySelector('.license-error');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        error.textContent = '';
        try {
            const values = new FormData(form);
            const license = await LicenciaRepo.crear({
                cliente: values.get('cliente'),
                organization: values.get('organizacion'),
                phone: values.get('telefono'),
                edition: values.get('edicion'),
                cupoTotal: values.get('creditos')
            });
            const secretCodeInMemory = license.codigo;
            panel.innerHTML = `
                <div class="form-card panel-control">
                    <div class="form-title" style="margin-bottom:8px;">
                        <div>
                            <h3>Cliente registrado</h3>
                            <p>Licencia generada: <strong class="license-masked-code">${escapeHtml(formatMaskedLicenseCode(license.codigo))}</strong>. Copiala desde el botón seguro para enviársela al cliente.</p>
                        </div>
                        <div class="form-actions">
                            <button class="btn-primary" type="button" id="copiar-licencia-creada">Copiar código</button>
                            <button class="btn-secondary" type="button" id="cerrar-licencia-creada">Cerrar</button>
                        </div>
                    </div>
                </div>`;
            panel.querySelector('#copiar-licencia-creada')?.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(secretCodeInMemory);
                    showToast('Código copiado al portapapeles.', { type: 'success' });
                } catch {
                    showToast('No se pudo copiar automáticamente en este navegador.', { type: 'warning' });
                }
            });
            panel.querySelector('#cerrar-licencia-creada').addEventListener('click', () => { panel.innerHTML = ''; });
            await loadLicenses();
        } catch (exception) {
            error.textContent = exception.message;
            button.disabled = false;
        }
    });
};

// PANTALLA 13 — GESTIÓN DE CLIENTES Y LICENCIAS
const renderLicenses = licenses => {
    const totalAvailable = licenses.reduce((acc, lic) => acc + (lic.activa ? LicenciaRepo.disponible(lic) : 0), 0);
    if (summaryNode) {
        summaryNode.textContent = `${licenses.length} cliente${licenses.length === 1 ? '' : 's'} · ${totalAvailable} torneo${totalAvailable === 1 ? '' : 's'} disponible${totalAvailable === 1 ? '' : 's'} en total`;
    }

    if (!licenses.length) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <strong>Todavía no hay clientes registrados</strong>
                <p>Elegí "+ Nuevo cliente" arriba a la derecha para emitir la primera licencia.</p>
            </div>`;
        return;
    }

    container.innerHTML = licenses.map(license => {
        const available = LicenciaRepo.disponible(license);
        const safeId = escapeHtml(license.id);
        const orgText = license.organizacion || license.telefono || 'Sin organización informada';
        const editionText = formatEditionLabel(license.edicion);
        const isActive = Boolean(license.activa);

        return `
            <article class="license-card ${isActive ? '' : 'is-disabled'}">
                <div class="license-card-head">
                    <span class="chip-pill ${isActive ? 'chip-green' : 'chip-amber'}">${isActive ? 'Activa' : 'Deshabilitada'}</span>
                    <span class="license-masked-code">${escapeHtml(formatMaskedLicenseCode(license.codigo))}</span>
                </div>

                <div class="license-card-title-block">
                    <h3>${escapeHtml(license.cliente)}</h3>
                    <p>${escapeHtml(orgText)} · ${escapeHtml(editionText)}</p>
                </div>

                <dl class="license-balance">
                    <div>
                        <dt>Comprados</dt>
                        <dd>${Number(license.cupo_total || 0)}</dd>
                    </div>
                    <div>
                        <dt>Usados</dt>
                        <dd>${Number(license.cupo_utilizado || 0)}</dd>
                    </div>
                    <div>
                        <dt>Disponibles</dt>
                        <dd class="${isActive && available > 0 ? 'is-available' : ''}">${available}</dd>
                    </div>
                </dl>

                <div class="license-card-actions">
                    <button class="${isActive ? 'btn-primary' : 'btn-secondary'} add-credits" type="button" data-id="${safeId}" data-client="${escapeHtml(license.cliente)}">Agregar torneos</button>
                    <button class="btn-secondary edit-license" type="button" data-id="${safeId}">Editar</button>
                </div>

                <div class="license-editor" hidden>
                    <form class="edit-license-form" data-id="${safeId}">
                        <label class="form-field">Cliente
                            <input name="cliente" type="text" value="${escapeHtml(license.cliente)}" required>
                        </label>
                        <label class="form-field">Organización
                            <input name="organizacion" type="text" value="${escapeHtml(license.organizacion || '')}">
                        </label>
                        <label class="form-field">Teléfono
                            <input name="telefono" type="text" value="${escapeHtml(license.telefono || '')}">
                        </label>
                        <label class="license-toggle">
                            <input name="activa" type="checkbox" ${isActive ? 'checked' : ''}> Licencia activa
                        </label>
                        <div class="form-actions" style="justify-content:space-between;margin-top:4px;">
                            <button class="delete-license" type="button" data-id="${safeId}" data-client="${escapeHtml(license.cliente)}">Eliminar licencia</button>
                            <button class="btn-primary btn-sm" type="submit">Guardar datos</button>
                        </div>
                        <p class="license-error" aria-live="polite"></p>
                    </form>
                </div>
            </article>`;
    }).join('');

    container.querySelectorAll('.add-credits').forEach(button => button.addEventListener('click', async () => {
        const amount = await promptDialog({
            title: `Agregar torneos a ${button.dataset.client || 'cliente'}`,
            label: 'Cantidad de torneos a sumar',
            type: 'number',
            value: '1',
            min: 1,
            max: 10000,
            confirmLabel: 'Sumar torneos'
        });
        if (amount === null) return;
        try {
            button.disabled = true;
            await LicenciaRepo.agregarTorneos(button.dataset.id, amount);
            showToast('Torneos acreditados correctamente.', { type: 'success' });
            await loadLicenses();
        } catch (error) {
            showToast(error.message, { type: 'error' });
            button.disabled = false;
        }
    }));

    container.querySelectorAll('.edit-license').forEach(button => button.addEventListener('click', () => {
        const editor = button.closest('.license-card')?.querySelector('.license-editor');
        if (!editor) return;
        const willOpen = editor.hidden;
        editor.hidden = !willOpen;
        if (willOpen) editor.querySelector('input[name="cliente"]')?.focus();
    }));

    container.querySelectorAll('.delete-license').forEach(button => button.addEventListener('click', async () => {
        const license = { id: button.dataset.id, cliente: button.dataset.client };
        if (!await confirmLicenseDeletion(license)) return;
        try {
            button.disabled = true;
            await LicenciaRepo.eliminar(license.id);
            showToast('Licencia eliminada.', { type: 'info' });
            await loadLicenses();
        } catch (error) {
            showToast(error.message || 'No se pudo eliminar la licencia.', { type: 'error' });
            button.disabled = false;
        }
    }));

    container.querySelectorAll('.edit-license-form').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const values = new FormData(form);
        const error = form.querySelector('.license-error');
        error.textContent = '';
        try {
            await LicenciaRepo.actualizar(form.dataset.id, {
                cliente: values.get('cliente'),
                organizacion: values.get('organizacion'),
                telefono: values.get('telefono'),
                activa: values.get('activa') === 'on'
            });
            showToast('Datos del cliente guardados.', { type: 'success' });
            await loadLicenses();
        } catch (exception) {
            error.textContent = exception.message;
        }
    }));
};

async function loadLicenses() {
    container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">Cargando clientes y licencias…</div>';
    try {
        renderLicenses(await LicenciaRepo.obtenerTodas());
    } catch {
        container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><strong>No se pudieron cargar las licencias</strong><p>Presioná "Actualizar licencias" para reintentar.</p></div>';
    }
}

document.getElementById('btn-nuevo-cliente')?.addEventListener('click', renderCreateForm);
document.getElementById('btn-actualizar-licencias')?.addEventListener('click', () => { void loadLicenses(); });

const actionsHost = document.querySelector('.admin-topbar-actions');
if (actionsHost && !document.getElementById('btn-cerrar-sesion-admin')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'btn-cerrar-sesion-admin';
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn-ghost btn-sm';
    logoutBtn.textContent = 'Salir';
    logoutBtn.addEventListener('click', async () => {
        await cerrarSesionAdmin();
        location.reload();
    });
    actionsHost.append(logoutBtn);
}

void loadLicenses();
