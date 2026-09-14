import { validarAccesoAdmin } from './core/adminAuth.js';

const header = document.getElementById('admin-header');
const container = document.getElementById('admin-container');
const gate = document.createElement('main');

const showAdmin = async () => {
    gate.remove();
    header.hidden = false;
    container.hidden = false;
    await import('./views/adminView.js');
};

gate.className = 'license-gate admin-access-gate';
gate.innerHTML = `<section class="license-gate-card" aria-labelledby="admin-access-title"><span class="calendar-chip">NEWCOM</span><p class="license-gate-product">Panel administrativo</p><h1 id="admin-access-title">Acceso de administración</h1><p>Ingresá tus credenciales para gestionar licencias.</p><form id="admin-access-form"><label for="admin-username">Usuario</label><input id="admin-username" name="username" type="text" autocomplete="username" required autofocus><label for="admin-password">Contraseña</label><input id="admin-password" name="password" type="password" autocomplete="current-password" required aria-describedby="admin-access-error"><p id="admin-access-error" class="license-error" aria-live="polite"></p><button class="btn-primary" type="submit">Ingresar al panel</button></form></section>`;
document.body.append(gate);
gate.querySelector('#admin-username').focus();

gate.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = gate.querySelector('#admin-access-error');
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    if (!validarAccesoAdmin(values.get('username'), values.get('password'))) {
        error.textContent = 'Usuario o contraseña incorrectos.';
        gate.querySelector('#admin-password').value = '';
        gate.querySelector('#admin-password').focus();
        return;
    }
    button.disabled = true;
    try { await showAdmin(); }
    catch { error.textContent = 'No se pudo abrir el panel administrativo.'; button.disabled = false; }
});
