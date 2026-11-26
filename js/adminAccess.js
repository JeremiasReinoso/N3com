import { configurarAdminInicial, iniciarSesionAdmin, obtenerSesionAdmin } from './core/adminAuth.js';

const header = document.getElementById('admin-header');
const container = document.getElementById('admin-container');
const gate = document.createElement('main');

const showAdmin = async () => {
    gate.remove();
    header.hidden = false;
    container.hidden = false;
    await import('./views/adminView.js');
};

// PANTALLA 12 — ACCESO ADMINISTRADOR
const renderGate = setupMode => {
    gate.className = 'license-gate admin-access-gate';
    gate.innerHTML = `
        <div class="gate-top-brand n3-brand">
            <span class="n3-brand-mark" aria-hidden="true">N</span>
            <span class="n3-brand-text">
                <span class="n3-brand-name">NEWCOM</span>
                <span class="n3-brand-sub">ADMINISTRACIÓN</span>
            </span>
        </div>
        <section class="license-gate-card" aria-labelledby="admin-access-title">
            <h1 id="admin-access-title">${setupMode ? 'Configurar administrador' : 'Iniciar sesión'}</h1>
            <p>${setupMode ? 'Definí tu usuario y contraseña de administración.' : 'Ingresá con tu cuenta de administrador.'}</p>
            <form id="admin-access-form">
                <div class="license-gate-field">
                    <label for="admin-username">Usuario</label>
                    <input id="admin-username" name="username" type="text" autocomplete="username" minlength="3" maxlength="64" placeholder="Usuario" required autofocus>
                </div>
                <div class="license-gate-field">
                    <label for="admin-password">Contraseña</label>
                    <input id="admin-password" name="password" type="password" autocomplete="${setupMode ? 'new-password' : 'current-password'}" ${setupMode ? 'minlength="8"' : ''} placeholder="Mínimo 8 caracteres" required aria-describedby="admin-access-error">
                </div>
                <p id="admin-access-error" class="license-error" aria-live="polite"></p>
                <button class="btn-primary license-gate-submit" type="submit">${setupMode ? 'Crear cuenta e ingresar' : 'Ingresar'}</button>
            </form>
            <p class="license-gate-note">Las credenciales se guardan con hash seguro en el servidor.</p>
        </section>`;
    document.body.append(gate);
    gate.querySelector('#admin-username')?.focus();

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
