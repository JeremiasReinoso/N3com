import { supabaseFetch } from './db.js';
import { AppState } from '../core/state.js';

export const MatchRepo = {
    obtenerPorTorneo: async () => {
        const torneoId = AppState.getTournament();
        return await supabaseFetch(`partidos?torneo_id=eq.${torneoId}&order=fecha,hora`);
    },
    guardarMultiples: async (partidos) => {
        const torneoId = AppState.getTournament();
        await supabaseFetch(`partidos?torneo_id=eq.${torneoId}`, 'DELETE');
        return await supabaseFetch('partidos', 'POST', partidos);
    },
    actualizarResultado: async (partidoId, setsLocal, setsVisitante) => {
        const payload = {
            sets_local: setsLocal,
            sets_visitante: setsVisitante,
            estado: 'finalizado'
        };
        return await supabaseFetch(`partidos?id=eq.${partidoId}`, 'PATCH', payload);
    },
    agregarMultiples: async (partidos) => {
        return await supabaseFetch('partidos', 'POST', partidos);
    }
};
