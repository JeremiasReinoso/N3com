import { DataManager } from '../data/dataManager.js';

const isGroupStandingMatch = match => match.phase === 'ZONAS' || !match.tipo || match.tipo === 'fase_zonas';
const hasSetResult = match => match.estado === 'finalizado' && Array.isArray(match.sets) && match.sets.length >= 2 && match.ganadorId;

// Los criterios de desempate se mantienen explícitos y aislados aquí:
// partidos ganados → diferencia de sets → diferencia de puntos → puntos a favor.
const compareRows = (left, right) => (
    right.puntos - left.puntos
    || right.ganados - left.ganados
    || right.diferenciaSets - left.diferenciaSets
    || right.diferenciaPuntos - left.diferenciaPuntos
    || right.puntosFavor - left.puntosFavor
);

export const PosicionesService = {
    calcularPosiciones(torneoId, categoriaId) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const rows = new Map(teams.map(team => [team.id, {
            ...team,
            jugados: 0,
            puntos: 0,
            ganados: 0,
            perdidos: 0,
            setsFavor: 0,
            setsContra: 0,
            puntosFavor: 0,
            puntosContra: 0,
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
                local.puntos += Number(match.puntosLocal || 0);
                visitante.puntos += Number(match.puntosVisitante || 0);
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
                diferenciaPuntos: row.puntosFavor - row.puntosContra
            }))
            .sort(compareRows);
    },

    calcularClasificacionFinal(torneoId, categoriaId) {
        const general = this.calcularPosiciones(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const final = matches.find(match => match.phase === 'FINAL' && hasSetResult(match));
        if (!final) return null;

        const runnerUpId = final.ganadorId === final.equipoLocalId ? final.equipoVisitanteId : final.equipoLocalId;
        const generalIndex = new Map(general.map((team, index) => [team.id, index]));
        const scheduledThirdPlace = matches.find(match => match.phase === 'THIRD_PLACE');
        // Si se habilitó el partido por el tercer puesto, la tabla final no
        // inventa ese resultado: espera su marcador real para publicar 1.º–3.º.
        if (scheduledThirdPlace && !hasSetResult(scheduledThirdPlace)) return null;
        const thirdPlace = scheduledThirdPlace && hasSetResult(scheduledThirdPlace) ? scheduledThirdPlace : null;
        const thirdIds = thirdPlace ? [thirdPlace.ganadorId, thirdPlace.ganadorId === thirdPlace.equipoLocalId ? thirdPlace.equipoVisitanteId : thirdPlace.equipoLocalId] : matches
            .filter(match => match.phase === 'SEMIFINAL' && hasSetResult(match))
            .map(match => match.ganadorId === match.equipoLocalId ? match.equipoVisitanteId : match.equipoLocalId)
            .sort((left, right) => (generalIndex.get(left) ?? Infinity) - (generalIndex.get(right) ?? Infinity));
        const orderedIds = [...new Set([final.ganadorId, runnerUpId, ...thirdIds])];
        return [
            ...orderedIds.map(id => general.find(team => team.id === id)).filter(Boolean),
            ...general.filter(team => !orderedIds.includes(team.id))
        ];
    }
};
