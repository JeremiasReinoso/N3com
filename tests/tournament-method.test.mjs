import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); }
};

const moduleUrl = path => pathToFileURL(resolve(root, path)).href;
const { DataManager } = await import(moduleUrl('js/data/dataManager.js'));

const top16 = DataManager.createTournament('Torneo TOP 16', 3, 'sets', 'top_16');
assert.equal(top16.method, 'top_16');
assert.equal(DataManager.getTournamentMethod(top16.id), 'top_16');
assert.equal(DataManager.getTournament(top16.id).method, 'top_16');

localStorage.setItem('newcom_data', JSON.stringify({
    tournaments: [{ id: 'torneo-antiguo', nombre: 'Torneo histórico', partidos_asegurados: 3 }]
}));
assert.equal(DataManager.getTournamentMethod('torneo-antiguo'), 'standard');
assert.equal(DataManager.getTournament('torneo-antiguo').method, 'standard');

console.log('Formato de torneo: TOP 16 persiste y los torneos antiguos usan Formato actual.');
