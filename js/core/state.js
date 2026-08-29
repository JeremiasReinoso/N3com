// Estado global de la aplicación (Store)
const state = {
    currentTournamentId: null,
    currentCategoryId: null,
    licenseId: null
};

export const AppState = {
    setTournament: (id) => {
        state.currentTournamentId = id;
        state.currentCategoryId = null;
        console.log(`[State] Torneo activo: ${id}`);
    },
    getTournament: () => {
        if (!state.currentTournamentId) {
            throw new Error("No hay torneo activo seleccionado.");
        }
        return state.currentTournamentId;
    },
    setCategory: (id) => {
        state.currentCategoryId = id;
        console.log(`[State] Categoría activa: ${id}`);
    },
    getCategory: () => state.currentCategoryId,
    clear: () => {
        state.currentTournamentId = null;
        state.currentCategoryId = null;
        console.log("[State] Estado limpiado");
    }
};
