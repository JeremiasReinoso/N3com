import { icon } from '../ui/icons.js';

const THEME_STORAGE_KEY = 'newcom_theme';
const DARK_THEME = 'dark';
const LIGHT_THEME = 'light';

export const getPreferredTheme = () => {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY) === LIGHT_THEME ? LIGHT_THEME : DARK_THEME;
    } catch {
        return DARK_THEME;
    }
};

export const applyTheme = theme => {
    const selectedTheme = theme === LIGHT_THEME ? LIGHT_THEME : DARK_THEME;
    const root = globalThis.document?.documentElement;
    if (!root) return selectedTheme;

    root.dataset.theme = selectedTheme;
    try { localStorage.setItem(THEME_STORAGE_KEY, selectedTheme); } catch { /* Continúa aunque el almacenamiento esté bloqueado */ }

    const isDark = selectedTheme === DARK_THEME;
    globalThis.document?.querySelectorAll?.('#theme-toggle, [data-theme-toggle]')?.forEach(toggle => {
        const label = isDark ? 'Tema claro' : 'Tema oscuro';
        toggle.innerHTML = `<span class="nav-btn-icon">${icon(isDark ? 'sun' : 'moon', { size: 16 })}</span><span class="nav-btn-label">${label}</span>`;
        toggle.setAttribute('aria-pressed', String(isDark));
        toggle.setAttribute('aria-label', isDark ? 'Activar tema claro' : 'Activar tema oscuro');
        toggle.setAttribute('data-tooltip', isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    });
    return selectedTheme;
};

export const initThemeToggle = () => {
    applyTheme(getPreferredTheme());
    globalThis.document?.querySelectorAll?.('#theme-toggle, [data-theme-toggle]')?.forEach(toggle => {
        if (toggle.dataset.boundTheme === 'true') return;
        toggle.dataset.boundTheme = 'true';
        toggle.addEventListener('click', () => {
            const activeTheme = document.documentElement.dataset.theme;
            applyTheme(activeTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME);
        });
    });
};
