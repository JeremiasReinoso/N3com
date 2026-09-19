const homeHash = '#/torneos';
const sections = new Set(['inicio', 'equipos', 'zonas', 'calendario', 'programacion', 'resultados', 'posiciones', 'eliminatorias']);

export const readTournamentRoute = () => {
    const hash = globalThis.location?.hash || '';
    const match = hash.match(/^#\/torneo\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) return { type: 'home' };
    const tournamentId = decodeURIComponent(match[1]);
    const section = sections.has(match[2]) ? match[2] : 'inicio';
    return tournamentId ? { type: 'tournament', tournamentId, section } : { type: 'home' };
};

const setHash = hash => {
    if (!globalThis.location) return false;
    if (location.hash === hash) return false;
    location.hash = hash;
    return true;
};

export const goToTournament = (tournamentId, section = 'inicio') => setHash(`#/torneo/${encodeURIComponent(tournamentId)}/${sections.has(section) ? section : 'inicio'}`);
export const goToTournamentList = () => setHash(homeHash);
