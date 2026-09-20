import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sections = ['inicio', 'equipos', 'zonas', 'calendario', 'programacion', 'resultados', 'posiciones', 'eliminatorias'];

const classList = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
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

const buttons = [];
const nav = {
    hidden: true,
    _innerHTML: '',
    set innerHTML(value) {
        this._innerHTML = value;
        buttons.length = 0;
        [...value.matchAll(/id="(btn-nav-([^"]+))"[^>]*data-section="([^"]+)"/g)].forEach(([, id, , section]) => {
            const button = createButton(id, section);
            if (new RegExp(`id="${id}" class="nav-btn active"`).test(value)) button.classList.add('active');
            buttons.push(button);
        });
    },
    get innerHTML() { return this._innerHTML; },
    querySelectorAll: selector => selector === '[data-section]' ? buttons : []
};
const header = { classList: classList() };
const views = Object.fromEntries(['torneos', ...sections].map(id => [`view-${id}`, { id: `view-${id}`, classList: classList() }]));

globalThis.document = {
    getElementById: id => id === 'main-nav' ? nav : views[id] || null,
    querySelector: selector => selector === '.app-header' ? header : null,
    querySelectorAll: selector => {
        if (selector === '.view-section') return Object.values(views);
        if (selector === '#main-nav .nav-btn') return buttons;
        return [];
    }
};

const { Navigation } = await import(`${pathToFileURL(resolve(root, 'js/core/navigation.js')).href}?navigation-test=1`);
const { AppContext, AppState } = await import(`${pathToFileURL(resolve(root, 'js/core/state.js')).href}?navigation-test=1`);
globalThis.location = { hash: '#/torneo/torneo%20prueba/resultados' };
const { readTournamentRoute } = await import(`${pathToFileURL(resolve(root, 'js/core/tournamentRoute.js')).href}?navigation-test=1`);
const restoredRoute = readTournamentRoute();
assert.deepEqual(restoredRoute, { type: 'tournament', context: AppContext.TOURNAMENT, tournamentId: 'torneo prueba', section: 'resultados' }, 'La ruta debe restaurar el torneo y la sección luego de recargar.');

Navigation.render({ context: AppContext.TOURNAMENT_LIST });
assert.equal(nav.hidden, true, 'Mis torneos no debe conservar la navegación interna.');
assert.equal(nav.innerHTML, '', 'Los enlaces internos no se deben renderizar fuera de un torneo.');
assert.equal(header.classList.contains('tournament-open'), false, 'El encabezado debe salir del contexto de torneo.');

let selectedSection = null;
Navigation.render({ context: AppContext.TOURNAMENT, section: 'equipos', onSectionChange: section => { selectedSection = section; } });
assert.equal(nav.hidden, false, 'Al abrir un torneo debe aparecer la navegación interna.');
assert.equal(buttons.length, sections.length, 'La navegación interna debe contener todas las secciones del torneo.');
assert.equal(buttons.find(button => button.id === 'btn-nav-equipos').classList.contains('active'), true, 'La sección actual debe quedar activa.');
buttons.find(button => button.id === 'btn-nav-resultados').click();
assert.equal(selectedSection, 'resultados', 'Cada enlace interno debe comunicar su sección al router central.');

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

console.log('La navegación se renderiza exclusivamente según tournament-list o tournament.');
