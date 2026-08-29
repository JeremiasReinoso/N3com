import { supabaseFetch } from './db.js';

export const ZoneRepo = {
    obtenerPorCategoria: async (categoriaId) => {
        return await supabaseFetch(
            `zonas?categoria_id=eq.${categoriaId}&select=*&order=nombre`
        );
    },

    crear: async (nombre, categoriaId) => {
        return await supabaseFetch('zonas', 'POST', {
            categoria_id: categoriaId,
            nombre
        });
    },

    asignarEquipo: async (equipoId, zonaId) => {
        return await supabaseFetch(
            `equipos?id=eq.${equipoId}`,
            'PATCH',
            { zona_id: zonaId }
        );
    },

    removerEquipo: async (equipoId) => {
        return await supabaseFetch(
            `equipos?id=eq.${equipoId}`,
            'PATCH',
            { zona_id: null }
        );
    }
};
