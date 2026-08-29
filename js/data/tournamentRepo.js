import { supabaseFetch } from './db.js';
import { API_CONFIG } from '../core/config.js';
import { LicenciaRepo } from './licenseRepo.js';

export const TorneoRepo = {
    obtenerTodos: async () => {
        const url = `torneos?licencia_id=eq.${API_CONFIG.CURRENT_LICENSE}&select=*`;
        return await supabaseFetch(url);
    },
    crear: async (nombre, partidosAsegurados) => {
        const licencia = await LicenciaRepo.obtenerActual();
        if (licencia.cupo_utilizado >= licencia.cupo_total) {
            throw new Error("No quedan torneos disponibles. Contacte al administrador.");
        }

        const nuevoTorneo = {
            licencia_id: API_CONFIG.CURRENT_LICENSE,
            nombre,
            partidos_asegurados: partidosAsegurados,
            estado: 'activo'
        };

        await supabaseFetch('torneos', 'POST', nuevoTorneo);
        await LicenciaRepo.consumirCupo(licencia.id, licencia.cupo_utilizado);
    }
};
