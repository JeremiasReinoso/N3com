import { supabaseFetch } from './db.js';

export const TeamRepo = {
    obtenerPorCategoria: async (categoriaId) => {
        return await supabaseFetch(`equipos?categoria_id=eq.${categoriaId}&select=*`);
    },
    crear: async (nombre, categoriaId) => {
        const nuevoEquipo = {
            categoria_id: categoriaId,
            nombre,
            zona_id: null
        };
        return await supabaseFetch('equipos', 'POST', nuevoEquipo);
    }
};
