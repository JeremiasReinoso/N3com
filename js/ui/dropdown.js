// Controlador delegado de menús contextuales (.ui-dropdown).
// Usa un único listener global para evitar fugas al re-renderizar vistas.

let initialized = false;

const closeAllDropdowns = (except = null) => {
    document.querySelectorAll('[data-dropdown]').forEach(dropdown => {
        if (dropdown === except) return;
        const trigger = dropdown.querySelector('[data-dropdown-trigger]');
        const menu = dropdown.querySelector('[data-dropdown-menu]');
        if (menu) menu.hidden = true;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
};

const adjustMenuAlignment = menu => {
    if (!menu) return;
    menu.classList.remove('align-left');
    const rect = menu.getBoundingClientRect();
    if (rect.left < 12) {
        menu.classList.add('align-left');
    }
};

export const initDropdownController = () => {
    if (initialized || typeof document === 'undefined') return;
    initialized = true;

    document.addEventListener('click', event => {
        const trigger = event.target.closest?.('[data-dropdown-trigger]');
        if (trigger) {
            const dropdown = trigger.closest('[data-dropdown]');
            const menu = dropdown?.querySelector('[data-dropdown-menu]');
            if (!menu) return;
            const willOpen = menu.hidden;
            closeAllDropdowns(willOpen ? dropdown : null);
            menu.hidden = !willOpen;
            trigger.setAttribute('aria-expanded', String(willOpen));
            if (willOpen) {
                adjustMenuAlignment(menu);
                menu.querySelector('button:not(:disabled)')?.focus?.();
            }
            return;
        }

        const menuItem = event.target.closest?.('[data-dropdown-menu] .ui-dropdown-item');
        if (menuItem) {
            closeAllDropdowns();
            return;
        }

        if (!event.target.closest?.('[data-dropdown]')) {
            closeAllDropdowns();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const openMenu = document.querySelector('[data-dropdown-menu]:not([hidden])');
            if (!openMenu) return;
            const trigger = openMenu.closest('[data-dropdown]')?.querySelector('[data-dropdown-trigger]');
            closeAllDropdowns();
            trigger?.focus?.();
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const openMenu = document.querySelector('[data-dropdown-menu]:not([hidden])');
            if (!openMenu || !openMenu.contains(document.activeElement)) return;
            event.preventDefault();
            const items = [...openMenu.querySelectorAll('button:not(:disabled)')];
            if (!items.length) return;
            const currentIndex = items.indexOf(document.activeElement);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (currentIndex + delta + items.length) % items.length;
            items[nextIndex]?.focus?.();
        }
    });
};

export const closeDropdowns = () => closeAllDropdowns();
