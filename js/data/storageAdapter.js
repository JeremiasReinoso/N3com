// Puerto de almacenamiento desacoplado.
// Hoy opera sobre localStorage (compatible con escritorio Electron offline y web local)
// y deja preparada la frontera para enchufar un backend centralizado con autenticación
// y multi-organización sin modificar el motor de competición.

const DEFAULT_STORAGE_KEY = 'newcom_data';

export const createLocalStorageAdapter = (storageKey = DEFAULT_STORAGE_KEY) => ({
    name: 'localStorage',
    readRaw() {
        return localStorage.getItem(storageKey);
    },
    writeRaw(serialized) {
        localStorage.setItem(storageKey, serialized);
    },
    backupCorrupt(raw) {
        try { localStorage.setItem(`${storageKey}_corrupt_backup`, raw); } catch { /* sin cuota */ }
    }
});

let activeAdapter = createLocalStorageAdapter();

export const StorageAdapter = {
    getActive() { return activeAdapter; },
    use(adapter) {
        if (!adapter || typeof adapter.readRaw !== 'function' || typeof adapter.writeRaw !== 'function') {
            throw new Error('El adaptador de almacenamiento debe implementar readRaw y writeRaw.');
        }
        activeAdapter = adapter;
        return activeAdapter;
    },
    resetToLocal() {
        activeAdapter = createLocalStorageAdapter();
        return activeAdapter;
    }
};
