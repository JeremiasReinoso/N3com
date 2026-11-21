import { DataManager } from '../data/dataManager.js';

// Sólo los partidos de zonas alimentan la tabla clasificatoria base.
const isGroupStandingMatch = match => match.phase === 'ZONAS' || (!match.phase && ['fase_zonas', 'cruce_especial'].includes(match.tipo));
const hasSetResult = match => match.estado === 'finalizado' && Array.isArray(match.sets) && match.sets.length >= 2 && match.ganadorId;

const directHeadToHead = (matches, leftId, rightId) => {
    const directMatches = matches.filter(match => hasSetResult(match)
        && [match.equipoLocalId, match.equipoVisitanteId].includes(leftId)
        && [match.equipoLocalId, match.equipoVisitanteId].includes(rightId));
    if (!directMatches.length) return 0;
    let leftWins = 0;
    let rightWins = 0;
    let leftSetDiff = 0;
    let leftPointDiff = 0;
    directMatches.forEach(match => {
        if (match.ganadorId === leftId) leftWins += 1;
        else if (match.ganadorId === rightId) rightWins += 1;
        const isLeftLocal = match.equipoLocalId === leftId;
        const localSets = Number(match.setsLocal || 0);
        const awaySets = Number(match.setsVisitante || 0);
        leftSetDiff += isLeftLocal ? (localSets - awaySets) : (awaySets - localSets);
        match.sets.forEach(set => {
            leftPointDiff += isLeftLocal
                ? (set.puntosLocal - set.puntosVisitante)
                : (set.puntosVisitante - set.puntosLocal);
        });
    });
    if (leftWins !== rightWins) return rightWins - leftWins;
    if (leftSetDiff !== 0) return -leftSetDiff;
    if (leftPointDiff !== 0) return -leftPointDiff;
    return 0;
};

const compareStandings = (groupMatches, mode = 'wins') => (left, right) => {
    if (mode === 'legacy_pf') {
        return right.puntosFavor - left.puntosFavor
            || right.diferenciaPuntos - left.diferenciaPuntos
            || right.diferenciaSets - left.diferenciaSets
            || right.ganados - left.ganados
            || directHeadToHead(groupMatches, left.id, right.id)
            || String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
            || String(left.id).localeCompare(String(right.id));
    }
    return right.ganados - left.ganados
        || right.diferenciaSets - left.diferenciaSets
        || right.diferenciaPuntos - left.diferenciaPuntos
        || right.puntosFavor - left.puntosFavor
        || directHeadToHead(groupMatches, left.id, right.id)
        || String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
        || String(left.id).localeCompare(String(right.id));
};

export const PosicionesService = {
    calcularPosiciones(torneoId, categoriaId, options = {}) {
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const category = DataManager.getCategory(categoriaId);
        const mode = options.mode || category?.standingsMode || 'wins';
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

        const groupMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupStandingMatch(match) && hasSetResult(match));

        groupMatches.forEach(match => {
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
                puntosClasificacion: mode === 'legacy_pf' ? row.puntosFavor : row.ganados
            }))
            .sort(compareStandings(groupMatches, mode));
    },

    calcularClasificacionFinal(torneoId, categoriaId) {
        const general = this.calcularPosiciones(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const final = matches.find(match => match.phase === 'FINAL' && hasSetResult(match));
        if (!final) return null;

        const loserOf = match => (match.ganadorId === match.equipoLocalId ? match.equipoVisitanteId : match.equipoLocalId);
        const generalRank = new Map(general.map((team, index) => [team.id, index]));
        const sortByGeneralRank = ids => [...new Set(ids.filter(Boolean))]
            .sort((left, right) => (generalRank.get(left) ?? Number.MAX_SAFE_INTEGER) - (generalRank.get(right) ?? Number.MAX_SAFE_INTEGER));

        const orderedIds = [];
        const append = id => { if (id && !orderedIds.includes(id)) orderedIds.push(id); };

        append(final.ganadorId);
        append(loserOf(final));

        const thirdPlace = matches.find(match => match.phase === 'THIRD_PLACE' && hasSetResult(match));
        if (thirdPlace) {
            append(thirdPlace.ganadorId);
            append(loserOf(thirdPlace));
        }

        const semifinalLosers = matches
            .filter(match => match.phase === 'SEMIFINAL' && hasSetResult(match))
            .map(loserOf);
        sortByGeneralRank(semifinalLosers).forEach(append);

        for (const phase of ['TOP_8', 'TOP_16']) {
            const losers = matches
                .filter(match => match.phase === phase && hasSetResult(match))
                .map(loserOf);
            sortByGeneralRank(losers).forEach(append);
        }

        const byId = new Map(general.map(team => [team.id, team]));
        return [
            ...orderedIds.map(id => byId.get(id)).filter(Boolean),
            ...general.filter(team => !orderedIds.includes(team.id))
        ];
    }
};
