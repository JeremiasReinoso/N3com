// Estado global de la aplicación. La ruta es la fuente persistente del
// contexto; este store representa ese contexto durante la sesión actual.
export const AppContext = Object.freeze({
    TOURNAMENT_LIST: 'tournament-list',
    TOURNAMENT: 'tournament'
});

const state = {
    context: AppContext.TOURNAMENT_LIST,
    currentTournamentId: null,
    currentCategoryId: null,
    licenseId: null
};

export const AppState = {
    setTournament: (id) => {
        if (!id) throw new Error('No se puede abrir un torneo sin identificador.');
        state.currentTournamentId = id;
        state.currentCategoryId = null;
        state.context = AppContext.TOURNAMENT;
        console.log(`[State] Torneo activo: ${id}`);
    },
    getContext: () => state.context,
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
        state.context = AppContext.TOURNAMENT_LIST;
        state.currentTournamentId = null;
        state.currentCategoryId = null;
        console.log("[State] Estado limpiado");
    }
};
