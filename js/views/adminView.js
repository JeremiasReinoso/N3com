import { LicenciaRepo } from '../data/licenseRepo.js';

const container = document.getElementById('admin-list');
const panel = document.getElementById('admin-license-form');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

const renderCreateForm = () => {
    panel.innerHTML = `<form id="form-crear-licencia" class="form-card panel-control"><div class="form-title"><div><h3>Nueva licencia</h3><p>El sistema generará un código único y permanente. Los créditos se pueden ampliar después sin cambiarlo.</p></div></div><div class="form-grid"><label class="form-field">Cliente<input name="cliente" required maxlength="90"></label><label class="form-field">Organización<input name="organizacion" maxlength="120"></label><label class="form-field">Email<input name="email" type="email" maxlength="120"></label><label class="form-field">Teléfono<input name="telefono" maxlength="40"></label><label class="form-field">Torneos iniciales<input name="creditos" type="number" min="1" max="10000" value="1" required></label></div><div class="form-actions"><button class="btn-primary" type="submit">Crear licencia</button><button class="btn-secondary" type="button" id="cancelar-licencia">Cancelar</button></div><p class="license-error" aria-live="polite"></p></form>`;
    panel.querySelector('#cancelar-licencia').addEventListener('click', () => { panel.innerHTML = ''; });
    panel.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault(); const form = event.currentTarget; const error = form.querySelector('.license-error'); const button = form.querySelector('button[type="submit"]');
        button.disabled = true; error.textContent = '';
        try {
            const values = new FormData(form);
            const license = await LicenciaRepo.crear({ cliente: values.get('cliente'), organization: values.get('organizacion'), email: values.get('email'), phone: values.get('telefono'), cupoTotal: values.get('creditos') });
            panel.innerHTML = `<div class="form-card panel-control"><h3>Licencia creada</h3><p>Entregá este código al cliente:</p><p><strong>${escapeHtml(license.codigo)}</strong></p><button class="btn-secondary" type="button" id="cerrar-licencia-creada">Cerrar</button></div>`;
            panel.querySelector('#cerrar-licencia-creada').addEventListener('click', () => { panel.innerHTML = ''; });
            await loadLicenses();
        }
        catch (exception) { error.textContent = exception.message; button.disabled = false; }
    });
};

const renderLicenses = licenses => {
    if (!licenses.length) { container.innerHTML = '<div class="empty-state">No hay licencias registradas. Cree el primer cliente para comenzar.</div>'; return; }
    container.innerHTML = licenses.map(license => {
        const available = LicenciaRepo.disponible(license);
        return `<article class="card license-card"><div class="license-card-head"><span class="match-status ${license.activa ? 'finished' : 'pending'}">${license.activa ? 'ACTIVA' : 'DESHABILITADA'}</span><strong>${escapeHtml(license.codigo)}</strong></div><h3>${escapeHtml(license.cliente)}</h3><p>${escapeHtml(license.organizacion || license.email || 'Sin datos de contacto')}</p><dl class="license-balance"><div><dt>Comprados</dt><dd>${license.cupo_total}</dd></div><div><dt>Usados</dt><dd>${license.cupo_utilizado}</dd></div><div><dt>Disponibles</dt><dd>${available}</dd></div></dl><div class="form-actions"><button class="btn-primary add-credits" type="button" data-id="${license.id}">Agregar torneos</button><button class="btn-secondary edit-license" type="button" data-id="${license.id}">Editar</button></div><details class="license-editor"><summary>Administrar licencia</summary><form class="edit-license-form" data-id="${license.id}"><label class="form-field">Cliente<input name="cliente" value="${escapeHtml(license.cliente)}" required></label><label class="form-field">Organización<input name="organizacion" value="${escapeHtml(license.organizacion)}"></label><label class="form-field">Email<input name="email" type="email" value="${escapeHtml(license.email)}"></label><label class="form-field">Teléfono<input name="telefono" value="${escapeHtml(license.telefono)}"></label><label class="license-toggle"><input name="activa" type="checkbox" ${license.activa ? 'checked' : ''}> Licencia activa</label><button class="btn-secondary" type="submit">Guardar datos</button><p class="license-error" aria-live="polite"></p></form></details></article>`;
    }).join('');
    container.querySelectorAll('.add-credits').forEach(button => button.addEventListener('click', async () => {
        const amount = prompt('¿Cuántos torneos desea agregar a esta licencia?'); if (amount === null) return;
        try { button.disabled = true; await LicenciaRepo.agregarTorneos(button.dataset.id, amount); await loadLicenses(); } catch (error) { alert(error.message); button.disabled = false; }
    }));
    container.querySelectorAll('.edit-license').forEach(button => button.addEventListener('click', () => { const editor = button.closest('.license-card').querySelector('details'); editor.open = true; editor.querySelector('input[name="cliente"]').focus(); }));
    container.querySelectorAll('.edit-license-form').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault(); const values = new FormData(form); const error = form.querySelector('.license-error'); error.textContent = '';
        try { await LicenciaRepo.actualizar(form.dataset.id, { cliente: values.get('cliente'), organizacion: values.get('organizacion'), email: values.get('email'), telefono: values.get('telefono'), activa: values.get('activa') === 'on' }); await loadLicenses(); } catch (exception) { error.textContent = exception.message; }
    }));
};

async function loadLicenses() {
    container.innerHTML = '<p>Cargando licencias...</p>';
    try { renderLicenses(await LicenciaRepo.obtenerTodas()); }
    catch { container.innerHTML = '<div class="empty-state">No se pudieron cargar las licencias. Revise la conexión de la fuente configurada.</div>'; }
}

document.getElementById('btn-nuevo-cliente').addEventListener('click', renderCreateForm);
document.getElementById('btn-actualizar-licencias').addEventListener('click', () => { void loadLicenses(); });
void loadLicenses();
