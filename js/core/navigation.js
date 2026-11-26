import { AppContext } from './state.js';
import { icon } from '../ui/icons.js';

const SIDEBAR_STORAGE_KEY = 'n3com_sidebar_collapsed';

// Secciones de la barra lateral del torneo + subitem Planificación debajo de Programación.
export const SIDEBAR_SECTIONS = Object.freeze([
    { id: 'inicio', label: 'Inicio' },
    { id: 'equipos', label: 'Equipos' },
    { id: 'zonas', label: 'Zonas' },
    { id: 'programacion', label: 'Programación' },
    { id: 'planificacion', label: '↳ Planificación', isSubItem: true },
    { id: 'resultados', label: 'Resultados' },
    { id: 'posiciones', label: 'Posiciones' },
    { id: 'eliminatorias', label: 'Eliminatorias' },
    { id: 'exportaciones', label: 'Exportaciones' },
    { id: 'configuracion', label: 'Configuración' }
]);

export const getSidebarCollapsed = () => {
    try {
        return globalThis.localStorage?.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const setSidebarCollapsed = collapsed => {
    const isCollapsed = Boolean(collapsed);
    try {
        globalThis.localStorage?.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed));
    } catch { /* Continúa funcionando aunque el almacenamiento esté bloqueado */ }

    const root = globalThis.document?.documentElement;
    if (root) {
        root.dataset.sidebar = isCollapsed ? 'collapsed' : 'expanded';
    }
    const header = globalThis.document?.querySelector?.('.app-header');
    header?.classList?.toggle?.('is-collapsed', isCollapsed);

    const toggle = globalThis.document?.getElementById?.('sidebar-toggle');
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        toggle.setAttribute('aria-label', isCollapsed ? 'Expandir barra lateral' : 'Plegar barra lateral');
        toggle.setAttribute('data-tooltip', isCollapsed ? 'Expandir menú' : 'Plegar menú');
        const iconHost = toggle.querySelector?.('.sidebar-toggle-icon');
        if (iconHost) {
            iconHost.innerHTML = icon(isCollapsed ? 'panelLeftOpen' : 'panelLeftClose', { size: 18 });
        }
    }
    return isCollapsed;
};

export const toggleSidebarCollapsed = () => setSidebarCollapsed(!getSidebarCollapsed());

export const initSidebarControls = () => {
    setSidebarCollapsed(getSidebarCollapsed());

    const toggle = globalThis.document?.getElementById?.('sidebar-toggle');
    if (toggle && toggle.dataset?.boundSidebar !== 'true') {
        if (toggle.dataset) toggle.dataset.boundSidebar = 'true';
        toggle.addEventListener('click', () => {
            toggleSidebarCollapsed();
        });
    }

    const mobileToggle = globalThis.document?.getElementById?.('mobile-sidebar-toggle');
    const backdrop = globalThis.document?.getElementById?.('sidebar-backdrop');
    const closeMobileDrawer = () => {
        globalThis.document?.querySelector?.('.app-header')?.classList?.remove?.('is-mobile-open');
        if (backdrop) backdrop.hidden = true;
    };
    const openMobileDrawer = () => {
        globalThis.document?.querySelector?.('.app-header')?.classList?.add?.('is-mobile-open');
        if (backdrop) backdrop.hidden = false;
    };

    if (mobileToggle && mobileToggle.dataset?.boundMobile !== 'true') {
        if (mobileToggle.dataset) mobileToggle.dataset.boundMobile = 'true';
        mobileToggle.addEventListener('click', () => {
            const header = globalThis.document?.querySelector?.('.app-header');
            if (header?.classList?.contains?.('is-mobile-open')) closeMobileDrawer();
            else openMobileDrawer();
        });
    }
    if (backdrop && backdrop.dataset?.boundBackdrop !== 'true') {
        if (backdrop.dataset) backdrop.dataset.boundBackdrop = 'true';
        backdrop.addEventListener('click', closeMobileDrawer);
    }
};

const activateView = viewId => {
    globalThis.document?.querySelectorAll?.('.view-section')?.forEach(view => view.classList.remove('active'));
    globalThis.document?.getElementById?.(viewId)?.classList.add('active');
};

const renderTournamentNavigation = (section, onSectionChange, tournamentName = '') => {
    const nav = globalThis.document?.getElementById?.('main-nav');
    const listNav = globalThis.document?.getElementById?.('list-nav');
    const header = globalThis.document?.querySelector?.('.app-header');
    const shell = globalThis.document?.getElementById?.('app-shell');
    const contextBadge = globalThis.document?.getElementById?.('sidebar-tournament-context');
    const footerActions = globalThis.document?.getElementById?.('sidebar-tournament-footer');
    if (!nav) return;

    const activeSection = section === 'calendario' ? 'configuracion' : section;

    if (listNav) listNav.hidden = true;
    nav.hidden = false;
    header?.classList?.add?.('tournament-open');
    shell?.classList?.add?.('has-sidebar');
    if (contextBadge) {
        contextBadge.hidden = false;
        const nameNode = contextBadge.querySelector?.('.sidebar-tournament-name');
        if (nameNode && tournamentName) nameNode.textContent = tournamentName;
    }
    if (footerActions) footerActions.hidden = false;

    nav.innerHTML = SIDEBAR_SECTIONS.map(({ id, label, isSubItem }) => {
        const isActive = id === activeSection;
        const subClass = isSubItem ? ' nav-btn-sub' : '';
        return `<button type="button" id="btn-nav-${id}" class="nav-btn${isActive ? ' active' : ''}${subClass}" data-section="${id}" data-tooltip="${label}" aria-current="${isActive ? 'page' : 'false'}"><span class="nav-btn-label">${label}</span></button>`;
    }).join('');

    nav.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
        if (button.disabled) return;
        globalThis.document?.querySelector?.('.app-header')?.classList?.remove?.('is-mobile-open');
        const backdrop = globalThis.document?.getElementById?.('sidebar-backdrop');
        if (backdrop) backdrop.hidden = true;
        onSectionChange(button.dataset.section);
    }));
};

const renderTournamentListNavigation = () => {
    const nav = globalThis.document?.getElementById?.('main-nav');
    const listNav = globalThis.document?.getElementById?.('list-nav');
    const header = globalThis.document?.querySelector?.('.app-header');
    const shell = globalThis.document?.getElementById?.('app-shell');
    const contextBadge = globalThis.document?.getElementById?.('sidebar-tournament-context');
    const footerActions = globalThis.document?.getElementById?.('sidebar-tournament-footer');
    if (nav) {
        nav.innerHTML = '';
        nav.hidden = true;
    }
    if (listNav) listNav.hidden = false;
    header?.classList?.remove?.('tournament-open');
    header?.classList?.remove?.('is-mobile-open');
    shell?.classList?.remove?.('has-sidebar');
    if (contextBadge) contextBadge.hidden = true;
    if (footerActions) footerActions.hidden = true;
};

export const Navigation = {
    render: ({ context, section, onSectionChange, tournamentName = '' }) => {
        initSidebarControls();
        if (context === AppContext.TOURNAMENT) {
            renderTournamentNavigation(section, onSectionChange, tournamentName);
            return;
        }
        renderTournamentListNavigation();
    },
    activateView,
    habilitarMenu: () => {
        globalThis.document?.querySelectorAll?.('#main-nav .nav-btn')?.forEach(button => { button.disabled = false; });
    }
};
