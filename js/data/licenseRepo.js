import { supabaseFetch } from './db.js';
import { API_CONFIG } from '../core/config.js';

export const LicenciaRepo = {
    obtenerActual: async () => {
        const result = await supabaseFetch(`licencias?codigo=eq.${API_CONFIG.CURRENT_LICENSE}&select=*`);
        return result[0];
    },
    consumirCupo: async (licenciaId, cupoUtilizadoActual) => {
        const nuevoUso = cupoUtilizadoActual + 1;
        return await supabaseFetch(`licencias?id=eq.${licenciaId}`, 'PATCH', { cupo_utilizado: nuevoUso });
    },
    obtenerTodas: async () => {
        return await supabaseFetch('licencias?select=*');
    },
    ampliarCupo: async (licenciaId, cupoTotalActual, cantidadNueva) => {
        const nuevoTotal = cupoTotalActual + cantidadNueva;
        return await supabaseFetch(`licencias?id=eq.${licenciaId}`, 'PATCH', { cupo_total: nuevoTotal });
    }
};
