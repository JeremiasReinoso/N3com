import { DataManager } from '../data/dataManager.js';

export const SPECIAL_CROSS_TYPE = 'cruce_especial';
export const SPECIAL_CATEGORY_NAME = '+50 Mixto';

const normalized = value => String(value || '').trim().toLocaleUpperCase('es');
const pairKey = (left, right) => [String(left), String(right)].sort().join(':');
const isGroupMatch = match => match.phase === 'ZONAS' || !match.tipo || match.tipo === 'fase_zonas' || match.tipo === SPECIAL_CROSS_TYPE;

export const isSpecialCategory = category => category?.nombre === SPECIAL_CATEGORY_NAME;
export const specialZoneName = zone => normalized(zone?.nombre);
export const isSpecialZonePair = (left, right) => (
    ['C', 'D'].includes(normalized(left))
    && ['C', 'D'].includes(normalized(right))
    && normalized(left) !== normalized(right)
);

export const isAllowedSpecialCross = ({ match, category, teams, zones }) => {
    if (match?.tipo !== SPECIAL_CROSS_TYPE || !isSpecialCategory(category)) return false;
    const local = teams.find(team => team.id === match.equipoLocalId);
    const visitante = teams.find(team => team.id === match.equipoVisitanteId);
    const localZone = zones.find(zone => zone.id === local?.zonaId);
    const visitanteZone = zones.find(zone => zone.id === visitante?.zonaId);
    return Boolean(local && visitante && local.categoriaId === category.id && visitante.categoriaId === category.id
        && match.zonaId === local.zonaId && isSpecialZonePair(localZone?.nombre, visitanteZone?.nombre));
};

const teamMatches = (matches, teamId) => matches.filter(match => isGroupMatch(match)
    && [match.equipoLocalId, match.equipoVisitanteId].includes(teamId));

export const SpecialCrossService = {
    isAvailable(torneoId, categoriaId) {
        const category = DataManager.getCategory(categoriaId);
        if (!isSpecialCategory(category) || category.torneoId !== torneoId) return false;
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        return zones.some(zone => specialZoneName(zone) === 'C') && zones.some(zone => specialZoneName(zone) === 'D');
    },

    getCandidates(torneoId, categoriaId) {
        const category = DataManager.getCategory(categoriaId);
        if (!isSpecialCategory(category) || category.torneoId !== torneoId) return null;
        const tournament = DataManager.getTournament(torneoId);
        const required = Number(tournament?.partidos_asegurados || 0);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const zoneData = ['C', 'D'].map(name => {
            const zone = zones.find(item => specialZoneName(item) === name);
            const zoneTeams = teams.filter(team => team.zonaId === zone?.id).map(team => {
                const matchesCount = teamMatches(matches, team.id).length;
                return { ...team, matches: matchesCount, required, missing: Math.max(0, required - matchesCount), complete: matchesCount >= required };
            });
            return { name, zone, teams: zoneTeams, candidates: zoneTeams.filter(team => team.missing > 0) };
        });
        const available = zoneData.every(zone => zone.zone && zone.candidates.length > 0);
        return { category, required, zones: zoneData, available };
    },

    create(torneoId, categoriaId, localId, visitanteId) {
        const state = this.getCandidates(torneoId, categoriaId);
        if (!state || !isSpecialCategory(state.category)) throw new Error('Los cruces especiales sólo están disponibles para +50 Mixto.');
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const local = teams.find(team => team.id === localId);
        const visitante = teams.find(team => team.id === visitanteId);
        const localZone = zones.find(zone => zone.id === local?.zonaId);
        const visitanteZone = zones.find(zone => zone.id === visitante?.zonaId);
        if (!local || !visitante || !isSpecialZonePair(localZone?.nombre, visitanteZone?.nombre)) {
            console.info('[+50 MIXTO] Cruce rechazado: sólo se permiten cruces entre Zona C y Zona D.');
            throw new Error('Este cruce no está permitido. Los cruces especiales solamente pueden realizarse entre Zona C y Zona D.');
        }
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        if (matches.some(match => isGroupMatch(match) && pairKey(match.equipoLocalId, match.equipoVisitanteId) === pairKey(local.id, visitante.id))) {
            console.info('[+50 MIXTO] Cruce rechazado: los equipos ya se enfrentaron.');
            throw new Error('Estos equipos ya tienen un enfrentamiento registrado.');
        }
        const count = teamId => teamMatches(matches, teamId).length;
        if (count(local.id) >= state.required || count(visitante.id) >= state.required) {
            console.info('[+50 MIXTO] Cruce rechazado: un equipo ya alcanzó los partidos garantizados.');
            throw new Error('Este equipo ya alcanzó la cantidad de partidos garantizados.');
        }
        const match = {
            torneoId, categoriaId, zonaId: local.zonaId, zonaDestinoId: visitante.zonaId,
            tipo: SPECIAL_CROSS_TYPE, phase: 'ZONAS', nombreEtapa: 'Cruces especiales — +50 Mixto',
            equipoLocalId: local.id, equipoVisitanteId: visitante.id,
            fecha: null, hora: null, cancha: null, estado: 'borrador', confirmado: false,
            setsLocal: null, setsVisitante: null, origen: SPECIAL_CROSS_TYPE
        };
        const created = DataManager.addMatches([match])[0];
        console.info(`[+50 MIXTO] Cruce especial creado: ${local.nombre} vs ${visitante.nombre}`);
        return created;
    }
};
