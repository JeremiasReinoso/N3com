// Adaptador retrocompatible hacia StandingsEngine.
// Mantiene la firma pública histórica de PosicionesService evitando duplicar lógica.
import { StandingsEngine } from '../engine/standingsEngine.js';

export const PosicionesService = {
    calcularPosiciones(torneoId, categoriaId, options = {}) {
        return StandingsEngine.calculateGeneralTable(torneoId, categoriaId, options);
    },

    calcularPosicionesPorZona(torneoId, categoriaId, options = {}) {
        return StandingsEngine.calculateZoneTables(torneoId, categoriaId, options);
    },

    calcularZonaFinal(torneoId, categoriaId, options = {}) {
        return StandingsEngine.calculateFinalGroupTable(torneoId, categoriaId, options);
    },

    calcularClasificacionFinal(torneoId, categoriaId) {
        return StandingsEngine.calculateFinalClassification(torneoId, categoriaId);
    }
};
