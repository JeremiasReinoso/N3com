import { configurarAdminInicial, iniciarSesionAdmin, obtenerSesionAdmin } from './core/adminAuth.js';
import { initThemeToggle } from './core/theme.js';

initThemeToggle();

const header = document.getElementById('admin-header');
const container = document.getElementById('admin-container');
const gate = document.createElement('main');

const showAdmin = async () => {
    gate.remove();
    header.hidden = false;
    container.hidden = false;
    await import('./views/adminView.js');
};

const renderGate = setupMode => {
    gate.className = 'license-gate admin-access-gate';
    gate.innerHTML = `<section class="license-gate-card" aria-labelledby="admin-access-title">
        <span class="calendar-chip">NEWCOM</span>
        <p class="license-gate-product">Panel administrativo</p>
        <h1 id="admin-access-title">${setupMode ? 'Configuración inicial de administrador' : 'Acceso de administración'}</h1>
        <p>${setupMode ? 'Creá las credenciales administrativas locales (se almacenan con hash seguro scrypt en el servidor).' : 'Ingresá tus credenciales para gestionar licencias.'}</p>
        <form id="admin-access-form">
            <label for="admin-username">Usuario</label>
            <input id="admin-username" name="username" type="text" autocomplete="username" minlength="3" maxlength="64" required autofocus>
            <label for="admin-password">Contraseña${setupMode ? ' (mínimo 8 caracteres)' : ''}</label>
            <input id="admin-password" name="password" type="password" autocomplete="${setupMode ? 'new-password' : 'current-password'}" ${setupMode ? 'minlength="8"' : ''} required aria-describedby="admin-access-error">
            <p id="admin-access-error" class="license-error" aria-live="polite"></p>
            <button class="btn-primary" type="submit">${setupMode ? 'Crear administrador e ingresar' : 'Ingresar al panel'}</button>
        </form>
    </section>`;
    document.body.append(gate);
    gate.querySelector('#admin-username').focus();

    gate.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const error = gate.querySelector('#admin-access-error');
        const button = form.querySelector('button[type="submit"]');
        const values = new FormData(form);
        error.textContent = '';
        button.disabled = true;
        try {
            if (setupMode) await configurarAdminInicial(values.get('username'), values.get('password'));
            else await iniciarSesionAdmin(values.get('username'), values.get('password'));
            await showAdmin();
        } catch (exception) {
            error.textContent = exception?.message || 'Usuario o contraseña incorrectos.';
            gate.querySelector('#admin-password').value = '';
            gate.querySelector('#admin-password').focus();
            button.disabled = false;
        }
    });
};

const bootstrap = async () => {
    try {
        const session = await obtenerSesionAdmin();
        if (session.authenticated) {
            await showAdmin();
            return;
        }
        renderGate(!session.configured);
    } catch {
        renderGate(false);
    }
};

void bootstrap();
