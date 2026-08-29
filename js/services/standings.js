import { DataManager } from '../data/dataManager.js';

export const PosicionesService = {
    calcularPosiciones(torneoId, categoriaId) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const rows = new Map(teams.map(team => [team.id, { ...team, jugados: 0, ganados: 0, perdidos: 0, puntos: 0, setsFavor: 0, setsContra: 0, diferenciaSets: 0 }]));
        DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => match.estado === 'finalizado' && (!match.tipo || match.tipo === 'fase_zonas') && Number.isFinite(match.puntosLocal) && Number.isFinite(match.puntosVisitante) && match.ganadorId)
            .forEach(match => {
                const local = rows.get(match.equipoLocalId); const visitante = rows.get(match.equipoVisitanteId);
                if (!local || !visitante) return;
                local.jugados += 1; visitante.jugados += 1;
                local.setsFavor += match.setsLocal; local.setsContra += match.setsVisitante;
                visitante.setsFavor += match.setsVisitante; visitante.setsContra += match.setsLocal;
                const winner = match.ganadorId === local.id ? local : visitante;
                const loser = match.ganadorId === local.id ? visitante : local;
                winner.ganados += 1; loser.perdidos += 1;
                local.puntos += match.puntosLocal;
                visitante.puntos += match.puntosVisitante;
            });
        return [...rows.values()]
            .map(row => ({ ...row, diferenciaSets: row.setsFavor - row.setsContra }))
            .sort((a, b) => b.puntos - a.puntos || b.ganados - a.ganados || b.diferenciaSets - a.diferenciaSets || a.nombre.localeCompare(b.nombre));
    },

    calcularClasificacionFinal(torneoId, categoriaId) {
        const general = this.calcularPosiciones(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const final = matches.find(match => match.tipo === 'final' && match.estado === 'finalizado' && match.ganadorId);
        if (!final) return null;

        const runnerUpId = final.ganadorId === final.equipoLocalId ? final.equipoVisitanteId : final.equipoLocalId;
        const generalIndex = new Map(general.map((team, index) => [team.id, index]));
        const semifinalLosers = matches
            .filter(match => match.tipo === 'semifinal' && match.estado === 'finalizado' && match.ganadorId)
            .map(match => match.ganadorId === match.equipoLocalId ? match.equipoVisitanteId : match.equipoLocalId)
            .sort((left, right) => (generalIndex.get(left) ?? Infinity) - (generalIndex.get(right) ?? Infinity));
        const finalOrder = [final.ganadorId, runnerUpId, ...semifinalLosers];
        const orderedIds = [...new Set(finalOrder)];
        return [
            ...orderedIds.map(id => general.find(team => team.id === id)).filter(Boolean),
            ...general.filter(team => !orderedIds.includes(team.id))
        ];
    }
};
