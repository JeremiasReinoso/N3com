import { LicenciaRepo } from './licenseRepo.js';
import { DataManager } from './dataManager.js';

export const TorneoRepo = {
    obtenerTodos: async () => {
        return DataManager.getTournaments();
    },
    crear: async (nombre, partidosAsegurados) => {
        await LicenciaRepo.consumirTorneo();
        return DataManager.createTournament(nombre, partidosAsegurados);
    }
};
