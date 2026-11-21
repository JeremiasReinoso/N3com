// Sistema unificado de notificaciones Toast y Modales <dialog> accesibles.
// Reemplaza alert(), confirm() y prompt() nativos (prompt() no funciona en Electron).
import { escapeHtml } from '../core/escapeHtml.js';
import { icon } from './icons.js';

const TOAST_ICONS = Object.freeze({
    info: 'info',
    success: 'checkCircle',
    warning: 'alertTriangle',
    error: 'alertCircle'
});

const ensureToastRegion = () => {
    let region = document.getElementById('n3-toast-region');
    if (!region) {
        region = document.createElement('div');
        region.id = 'n3-toast-region';
        region.className = 'ui-toast-region';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'false');
        document.body.append(region);
    }
    return region;
};

export const showToast = (message, { type = 'info', duration = 4200 } = {}) => {
    const text = String(message ?? '').trim();
    if (!text) return;
    if (typeof document === 'undefined' || !document.body) return;

    const variant = TOAST_ICONS[type] ? type : 'info';
    const region = ensureToastRegion();
    const toast = document.createElement('div');
    toast.className = `ui-toast ui-toast-${variant}`;
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
        <span class="ui-toast-icon">${icon(TOAST_ICONS[variant], { size: 17 })}</span>
        <span class="ui-toast-message">${escapeHtml(text)}</span>
        <button type="button" class="ui-toast-close" aria-label="Cerrar notificación">${icon('x', { size: 15 })}</button>`;

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 160);
    };

    toast.querySelector('.ui-toast-close')?.addEventListener('click', dismiss);
    region.append(toast);

    // Mantiene un máximo de 4 toasts simultáneos para evitar ruido visual.
    while (region.children.length > 4) {
        region.firstElementChild?.remove();
    }

    if (duration > 0) setTimeout(dismiss, duration);
};

export const confirmDialog = ({
    title = 'Confirmar acción',
    message = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false
} = {}) => new Promise(resolve => {
    if (typeof document === 'undefined' || !document.body) {
        resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(message || title) : false);
        return;
    }

    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'ui-dialog';
    dialog.setAttribute('aria-labelledby', 'ui-confirm-title');
    dialog.innerHTML = `
        <div class="ui-dialog-header">
            <div><h3 id="ui-confirm-title" class="ui-dialog-title">${escapeHtml(title)}</h3></div>
            <button type="button" class="btn-icon" data-dialog-close aria-label="Cerrar">${icon('x', { size: 18 })}</button>
        </div>
        <div class="ui-dialog-body">
            <p class="ui-dialog-message">${escapeHtml(message)}</p>
        </div>
        <div class="ui-dialog-footer">
            <button type="button" class="btn-secondary" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>
            <button type="button" class="${danger ? 'btn-danger-solid' : 'btn-primary'}" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
        </div>`;

    let settled = false;
    const finish = confirmed => {
        if (settled) return;
        settled = true;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        previousFocus?.focus?.();
        resolve(confirmed);
    };

    dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => finish(false));
    dialog.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => finish(false));
    dialog.querySelector('[data-dialog-confirm]')?.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('click', event => { if (event.target === dialog) finish(false); });

    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
        dialog.querySelector('[data-dialog-confirm]')?.focus();
    } else {
        dialog.remove();
        resolve(typeof window.confirm === 'function' ? window.confirm(message || title) : false);
    }
});

export const promptDialog = ({
    title = 'Ingresar valor',
    message = '',
    label = 'Valor',
    value = '',
    placeholder = '',
    type = 'text',
    min = null,
    max = null,
    maxLength = 80,
    required = true,
    confirmLabel = 'Guardar',
    cancelLabel = 'Cancelar'
} = {}) => new Promise(resolve => {
    if (typeof document === 'undefined' || !document.body) {
        resolve(null);
        return;
    }

    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'ui-dialog';
    dialog.setAttribute('aria-labelledby', 'ui-prompt-title');
    const minAttr = min !== null && min !== undefined ? ` min="${Number(min)}"` : '';
    const maxAttr = max !== null && max !== undefined ? ` max="${Number(max)}"` : '';
    const maxLenAttr = type === 'text' && maxLength ? ` maxlength="${Number(maxLength)}"` : '';

    dialog.innerHTML = `
        <form method="dialog" id="ui-prompt-form">
            <div class="ui-dialog-header">
                <div><h3 id="ui-prompt-title" class="ui-dialog-title">${escapeHtml(title)}</h3></div>
                <button type="button" class="btn-icon" data-dialog-close aria-label="Cerrar">${icon('x', { size: 18 })}</button>
            </div>
            <div class="ui-dialog-body">
                ${message ? `<p class="ui-dialog-message">${escapeHtml(message)}</p>` : ''}
                <label class="form-field">${escapeHtml(label)}
                    <input id="ui-prompt-input" name="value" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${minAttr}${maxAttr}${maxLenAttr}${required ? ' required' : ''} autocomplete="off">
                </label>
            </div>
            <div class="ui-dialog-footer">
                <button type="button" class="btn-secondary" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>
                <button type="submit" class="btn-primary">${escapeHtml(confirmLabel)}</button>
            </div>
        </form>`;

    let settled = false;
    const finish = result => {
        if (settled) return;
        settled = true;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        previousFocus?.focus?.();
        resolve(result);
    };

    dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => finish(null));
    dialog.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    dialog.addEventListener('click', event => { if (event.target === dialog) finish(null); });
    dialog.querySelector('#ui-prompt-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = dialog.querySelector('#ui-prompt-input');
        const nextValue = String(input?.value ?? '').trim();
        if (required && !nextValue) {
            input?.focus();
            return;
        }
        finish(nextValue);
    });

    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
        const input = dialog.querySelector('#ui-prompt-input');
        input?.focus();
        input?.select?.();
    } else {
        dialog.remove();
        resolve(null);
    }
});

export const openModal = ({
    title = '',
    subtitle = '',
    bodyHtml = '',
    size = 'md',
    onMount = null,
    onClose = null
} = {}) => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = `ui-dialog${size === 'lg' ? ' ui-dialog-lg' : size === 'xl' ? ' ui-dialog-xl' : ''}`;
    dialog.setAttribute('aria-labelledby', 'ui-modal-title');
    dialog.innerHTML = `
        <div class="ui-dialog-header">
            <div>
                <h3 id="ui-modal-title" class="ui-dialog-title">${escapeHtml(title)}</h3>
                ${subtitle ? `<p class="ui-dialog-subtitle">${escapeHtml(subtitle)}</p>` : ''}
            </div>
            <button type="button" class="btn-icon" data-dialog-close aria-label="Cerrar">${icon('x', { size: 18 })}</button>
        </div>
        <div class="ui-dialog-body">${bodyHtml}</div>`;

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        previousFocus?.focus?.();
        onClose?.();
    };

    dialog.querySelector('[data-dialog-close]')?.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });

    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    onMount?.(dialog, close);
    return { dialog, close };
};
