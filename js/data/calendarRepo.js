import { supabaseFetch } from './db.js';
import { AppState } from '../core/state.js';

export const CalendarRepo = {
    obtenerPorTorneo: async () => {
        const torneoId = AppState.getTournament();
        return await supabaseFetch(
            `calendario?torneo_id=eq.${torneoId}&select=*&order=fecha`
        );
    },

    guardarFechas: async (fechas) => {
        const torneoId = AppState.getTournament();
        await supabaseFetch(`calendario?torneo_id=eq.${torneoId}`, 'DELETE');

        if (!fechas.length) return [];

        const registros = fechas.map(fecha => ({
            torneo_id: torneoId,
            fecha
        }));
        return await supabaseFetch('calendario', 'POST', registros);
    }
};
