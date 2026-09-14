// La versión actual funciona enteramente en el equipo local, mediante
// server.js y private/licenses.json. Se reserva este objeto para que módulos
// heredados puedan coexistir sin introducir servicios externos.
export const API_CONFIG = { storage: 'local-file' };

export const TOURNAMENT_RULES = {
    POINTS_WIN_2_0: 3,
    POINTS_WIN_2_1: 2,
    POINTS_LOSS: 1
};
