import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sidebarSections = [
    'inicio',
    'equipos',
    'zonas',
    'programacion',
    'planificacion',
    'resultados',
    'posiciones',
    'eliminatorias',
    'exportaciones',
    'configuracion'
];
const routeSections = [...sidebarSections, 'calendario'];

const classList = () => {
    const values = new Set();
    return {
        add: value => values.add(value),
        remove: value => values.delete(value),
        toggle: (value, force) => {
            const shouldAdd = force === undefined ? !values.has(value) : Boolean(force);
            if (shouldAdd) values.add(value);
            else values.delete(value);
            return shouldAdd;
        },
        contains: value => values.has(value)
    };
};

const createButton = (id, section) => {
    const listeners = [];
    return {
        id,
        dataset: { section },
        disabled: false,
        classList: classList(),
        addEventListener: (type, callback) => { if (type === 'click') listeners.push(callback); },
        click: () => listeners.forEach(callback => callback()),
    };
};

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
};

const buttons = [];
const nav = {
    hidden: true,
    _innerHTML: '',
    set innerHTML(value) {
        this._innerHTML = value;
        buttons.length = 0;
        [...value.matchAll(/id="(btn-nav-([^"]+))"[^>]*data-section="([^"]+)"/g)].forEach(([, id, , section]) => {
            const button = createButton(id, section);
            if (new RegExp(`id="${id}" class="nav-btn active`).test(value)) button.classList.add('active');
            buttons.push(button);
        });
    },
    get innerHTML() { return this._innerHTML; },
    querySelectorAll: selector => selector === '[data-section]' ? buttons : []
};
const header = { classList: classList() };
const shell = { classList: classList() };
const views = Object.fromEntries(['torneos', ...routeSections].map(id => [`view-${id}`, { id: `view-${id}`, classList: classList() }]));

globalThis.document = {
    documentElement: { dataset: {} },
    getElementById: id => {
        if (id === 'main-nav') return nav;
        if (id === 'app-shell') return shell;
        return views[id] || null;
    },
    querySelector: selector => selector === '.app-header' ? header : null,
    querySelectorAll: selector => {
        if (selector === '.view-section') return Object.values(views);
        if (selector === '#main-nav .nav-btn') return buttons;
        return [];
    }
};

const {
    Navigation,
    getSidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed
} = await import(`${pathToFileURL(resolve(root, 'js/core/navigation.js')).href}?navigation-test=1`);
const { AppContext, AppState } = await import(`${pathToFileURL(resolve(root, 'js/core/state.js')).href}?navigation-test=1`);
globalThis.location = { hash: '#/torneo/torneo%20prueba/resultados' };
const { readTournamentRoute } = await import(`${pathToFileURL(resolve(root, 'js/core/tournamentRoute.js')).href}?navigation-test=1`);
const restoredRoute = readTournamentRoute();
assert.deepEqual(restoredRoute, { type: 'tournament', context: AppContext.TOURNAMENT, tournamentId: 'torneo prueba', section: 'resultados' }, 'La ruta debe restaurar el torneo y la sección luego de recargar.');

// Verificación de nuevas rutas y preservación de Planificación y Calendario
for (const sec of ['exportaciones', 'configuracion', 'planificacion', 'calendario']) {
    globalThis.location = { hash: `#/torneo/t1/${sec}` };
    assert.equal(readTournamentRoute().section, sec, `La ruta debe resolver la sección ${sec}.`);
}

Navigation.render({ context: AppContext.TOURNAMENT_LIST });
assert.equal(nav.hidden, true, 'Mis torneos no debe conservar la navegación interna.');
assert.equal(nav.innerHTML, '', 'Los enlaces internos no se deben renderizar fuera de un torneo.');
assert.equal(header.classList.contains('tournament-open'), false, 'El encabezado debe salir del contexto de torneo.');

let selectedSection = null;
Navigation.render({ context: AppContext.TOURNAMENT, section: 'equipos', onSectionChange: section => { selectedSection = section; } });
assert.equal(nav.hidden, false, 'Al abrir un torneo debe aparecer la navegación interna.');
assert.equal(buttons.length, sidebarSections.length, 'La barra lateral debe contener las 9 secciones más el acceso directo a Planificación.');
assert.equal(buttons.find(button => button.id === 'btn-nav-equipos').classList.contains('active'), true, 'La sección actual debe quedar activa.');
buttons.find(button => button.id === 'btn-nav-resultados').click();
assert.equal(selectedSection, 'resultados', 'Cada enlace interno debe comunicar su sección al router central.');
buttons.find(button => button.id === 'btn-nav-planificacion').click();
assert.equal(selectedSection, 'planificacion', 'Planificación debe permanecer accesible a 1 clic.');

// Verificación de estado plegable persistente de la sidebar entre sesiones
assert.equal(getSidebarCollapsed(), false, 'Por defecto la sidebar inicia expandida.');
setSidebarCollapsed(true);
assert.equal(getSidebarCollapsed(), true, 'El estado plegado debe guardarse en localStorage.');
assert.equal(globalThis.document.documentElement.dataset.sidebar, 'collapsed', 'El dataset global debe reflejar sidebar plegada.');
toggleSidebarCollapsed();
assert.equal(getSidebarCollapsed(), false, 'Alternar debe volver a expandir la sidebar.');

Navigation.activateView('view-equipos');
assert.equal(views['view-equipos'].classList.contains('active'), true, 'La vista solicitada debe activarse.');
assert.equal(views['view-torneos'].classList.contains('active'), false, 'La lista no debe permanecer activa dentro del torneo.');

buttons.forEach(button => { button.disabled = true; });
Navigation.habilitarMenu();
assert.equal(buttons.every(button => !button.disabled), true, 'La habilitación del menú debe limitarse a sus enlaces renderizados.');

AppState.clear();
assert.equal(AppState.getContext(), AppContext.TOURNAMENT_LIST, 'Al salir no debe conservarse el contexto interno.');
AppState.setTournament('torneo-prueba');
assert.equal(AppState.getContext(), AppContext.TOURNAMENT, 'Al abrir debe establecerse el contexto tournament.');
assert.equal(AppState.getTournament(), 'torneo-prueba', 'El ID del torneo abierto debe conservarse en el estado actual.');
AppState.clear();
assert.equal(AppState.getContext(), AppContext.TOURNAMENT_LIST, 'Al volver al listado debe limpiarse el torneo actual.');

console.log('La navegación con sidebar plegable se renderiza y persiste correctamente según el contexto.');
