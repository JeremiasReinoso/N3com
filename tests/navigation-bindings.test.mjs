import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buttonIds = [
    'btn-nav-torneos', 'btn-nav-equipos', 'btn-nav-zonas', 'btn-nav-calendario',
    'btn-nav-programacion', 'btn-nav-resultados', 'btn-nav-posiciones', 'btn-nav-eliminatorias'
];

const createElement = id => {
    const listeners = new Map();
    const classes = new Set(id === 'btn-nav-torneos' || id === 'view-torneos' ? ['active'] : []);
    return {
        id,
        disabled: false,
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value)
        },
        addEventListener: (type, callback) => {
            const callbacks = listeners.get(type) || [];
            callbacks.push(callback);
            listeners.set(type, callbacks);
        },
        listenerCount: type => (listeners.get(type) || []).length,
        click: () => (listeners.get('click') || []).forEach(callback => callback({ currentTarget: null })),
        querySelector: () => form,
        querySelectorAll: () => [],
        innerHTML: ''
    };
};

const form = {
    addEventListener: () => {},
    value: '',
    trim: () => ''
};
const buttons = Object.fromEntries(buttonIds.map(id => [id, createElement(id)]));
const views = Object.fromEntries(buttonIds.map(id => {
    const viewId = id.replace('btn-nav-', 'view-');
    return [viewId, createElement(viewId)];
}));
const domReadyListeners = [];

globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); }
};
globalThis.document = {
    addEventListener: (type, callback) => {
        if (type === 'DOMContentLoaded') domReadyListeners.push(callback);
    },
    getElementById: id => buttons[id] || views[id] || null,
    querySelectorAll: selector => {
        if (selector.includes('nav-btn')) return Object.values(buttons);
        if (selector === '.view-section') return Object.values(views);
        return [];
    }
};
globalThis.alert = () => {};

await import(`${pathToFileURL(resolve(root, 'js/main.js')).href}?navigation-test=1`);
assert.equal(domReadyListeners.length, 1, 'La aplicación debe esperar al DOM antes de inicializarse.');
domReadyListeners[0]();

for (const id of buttonIds) {
    assert.equal(buttons[id].listenerCount('click'), 2, `${id} debe tener navegación y carga de vista.`);
}

buttons['btn-nav-equipos'].click();
assert.equal(buttons['btn-nav-equipos'].classList.contains('active'), true, 'Equipos debe quedar activo al hacer clic.');
assert.equal(views['view-equipos'].classList.contains('active'), true, 'La vista Equipos debe mostrarse al hacer clic.');
assert.equal(views['view-torneos'].classList.contains('active'), false, 'La vista anterior debe ocultarse al navegar.');

console.log('Los botones de navegación se registran y cambian de vista correctamente.');
