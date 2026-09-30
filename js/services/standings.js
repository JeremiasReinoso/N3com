import { DataManager } from '../data/dataManager.js';

// Sólo los partidos de zonas alimentan la tabla que clasifica al Top 16.
const isGroupStandingMatch = match => match.phase === 'ZONAS' || (!match.phase && match.tipo === 'fase_zonas');
const hasSetResult = match => match.estado === 'finalizado' && Array.isArray(match.sets) && match.sets.length >= 2 && match.ganadorId;

const compareBySetPoints = (matches) => (left, right) => {
    const direct = matches.find(match => [match.equipoLocalId, match.equipoVisitanteId].includes(left.id)
        && [match.equipoLocalId, match.equipoVisitanteId].includes(right.id)
        && hasSetResult(match));
    const directWinner = direct?.ganadorId === left.id ? -1 : (direct?.ganadorId === right.id ? 1 : 0);
    return right.puntosFavor - left.puntosFavor
        || right.diferenciaPuntos - left.diferenciaPuntos
        || right.puntosFavor - left.puntosFavor
        || directWinner
        || right.ganados - left.ganados
        || String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
        || String(left.id).localeCompare(String(right.id));
};

export const PosicionesService = {
    calcularPosiciones(torneoId, categoriaId) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const rows = new Map(teams.map(team => [team.id, {
            ...team,
            jugados: 0,
            ganados: 0,
            perdidos: 0,
            setsFavor: 0,
            setsContra: 0,
            puntosFavor: 0,
            puntosContra: 0,
            puntosClasificacion: 0,
            diferenciaSets: 0,
            diferenciaPuntos: 0
        }]));

        DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupStandingMatch(match) && hasSetResult(match))
            .forEach(match => {
                const local = rows.get(match.equipoLocalId);
                const visitante = rows.get(match.equipoVisitanteId);
                if (!local || !visitante) return;
                local.jugados += 1;
                visitante.jugados += 1;
                local.setsFavor += match.setsLocal;
                local.setsContra += match.setsVisitante;
                visitante.setsFavor += match.setsVisitante;
                visitante.setsContra += match.setsLocal;
                match.sets.forEach(set => {
                    local.puntosFavor += set.puntosLocal;
                    local.puntosContra += set.puntosVisitante;
                    visitante.puntosFavor += set.puntosVisitante;
                    visitante.puntosContra += set.puntosLocal;
                });
                if (match.ganadorId === local.id) {
                    local.ganados += 1;
                    visitante.perdidos += 1;
                } else {
                    visitante.ganados += 1;
                    local.perdidos += 1;
                }
            });

        return [...rows.values()]
            .map(row => ({
                ...row,
                diferenciaSets: row.setsFavor - row.setsContra,
                diferenciaPuntos: row.puntosFavor - row.puntosContra,
                // La clasificación de N3com se deriva de los puntos reales de
                // todos los sets cargados, nunca de un marcador ficticio.
                puntosClasificacion: row.puntosFavor
            }))
            .sort(compareBySetPoints(DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)));
    },

    calcularClasificacionFinal(torneoId, categoriaId) {
        const general = this.calcularPosiciones(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const final = matches.find(match => match.phase === 'FINAL' && hasSetResult(match));
        if (!final) return null;

        const runnerUpId = final.ganadorId === final.equipoLocalId ? final.equipoVisitanteId : final.equipoLocalId;
        const orderedIds = [...new Set([final.ganadorId, runnerUpId])];
        return [
            ...orderedIds.map(id => general.find(team => team.id === id)).filter(Boolean),
            ...general.filter(team => !orderedIds.includes(team.id))
        ];
    }
};
