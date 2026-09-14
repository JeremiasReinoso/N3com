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
    try { localStorage.setItem(THEME_STORAGE_KEY, selectedTheme); } catch { /* El tema sigue funcionando aunque el navegador bloquee el almacenamiento. */ }

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        const isDark = selectedTheme === DARK_THEME;
        toggle.textContent = isDark ? '☀ Tema claro' : '◐ Tema oscuro';
        toggle.setAttribute('aria-pressed', String(isDark));
        toggle.setAttribute('aria-label', isDark ? 'Activar tema claro' : 'Activar tema oscuro');
    }
    return selectedTheme;
};

export const initThemeToggle = () => {
    const toggle = globalThis.document?.getElementById?.('theme-toggle');
    applyTheme(getPreferredTheme());
    if (!toggle || toggle.dataset.boundTheme === 'true') return;

    toggle.dataset.boundTheme = 'true';
    toggle.addEventListener('click', () => {
        const activeTheme = document.documentElement.dataset.theme;
        applyTheme(activeTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME);
    });
};
