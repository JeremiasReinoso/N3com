// Persistencia local del flujo principal del torneo. La capa de Supabase queda
// sin usar por ahora: esta pantalla debe funcionar de forma autónoma.
const STORAGE_KEY = 'newcom_data';
let sequence = 0;

const emptyData = () => ({ tournaments: [], categories: [], teams: [], zones: [], matches: [], calendar: [] });
const makeId = (prefix) => `${prefix}_${Date.now()}_${++sequence}`;
const datesBetween = (startDate, endDate) => {
    const dates = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (cursor <= end) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
};
const minutesFromTime = time => {
    const [hour, minute] = String(time).split(':').map(Number);
    return hour * 60 + minute;
};
const validHours = (start, end) => /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && minutesFromTime(start) < minutesFromTime(end);
const isZonePhaseMatch = match => !match.tipo || match.tipo === 'fase_zonas';
const groupPairKey = match => [
    match.torneoId,
    match.categoriaId,
    match.zonaId,
    ...[String(match.equipoLocalId), String(match.equipoVisitanteId)].sort()
].join(':');
const assertUniqueGroupPairs = matches => {
    const seen = new Set();
    matches.filter(match => isZonePhaseMatch(match) && match.equipoLocalId && match.equipoVisitanteId).forEach(match => {
        const key = groupPairKey(match);
        if (seen.has(key)) throw new Error('No se puede repetir un enfrentamiento dentro de la misma zona.');
        seen.add(key);
    });
};
const matchPriority = match => (match.estado === 'finalizado' ? 3 : (match.confirmado ? 2 : 1));
// Compatibilidad con fixtures creados por versiones anteriores: conserva un
// único partido por cruce y da prioridad al que ya tiene un resultado cargado.
const deduplicateGroupPairs = matches => {
    const result = [];
    const positions = new Map();
    matches.forEach(match => {
        if (!isZonePhaseMatch(match) || !match.equipoLocalId || !match.equipoVisitanteId) {
            result.push(match);
            return;
        }
        const key = groupPairKey(match);
        const existingPosition = positions.get(key);
        if (existingPosition === undefined) {
            positions.set(key, result.length);
            result.push(match);
        } else if (matchPriority(match) > matchPriority(result[existingPosition])) {
            result[existingPosition] = match;
        }
    });
    return result;
};
const normalizeSets = sets => {
    if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) throw new Error('Ingrese los puntos de 2 o 3 sets.');
    return sets.map((set, index) => {
        const puntosLocal = Number(set?.puntosLocal);
        const puntosVisitante = Number(set?.puntosVisitante);
        if (!Number.isInteger(puntosLocal) || !Number.isInteger(puntosVisitante) || puntosLocal < 0 || puntosVisitante < 0) throw new Error(`El set ${index + 1} debe tener puntos enteros iguales o mayores a cero.`);
        if (puntosLocal === puntosVisitante) throw new Error(`El set ${index + 1} no puede terminar empatado.`);
        return { puntosLocal, puntosVisitante };
    });
};
// La única fuente del resultado son los puntos de cada set. El marcador 2-0 o
// 2-1 se calcula aquí y nunca se recibe manualmente desde la interfaz.
const applyInternalResult = (match, rawSets) => {
    const sets = normalizeSets(rawSets);
    const setsLocal = sets.filter(set => set.puntosLocal > set.puntosVisitante).length;
    const setsVisitante = sets.length - setsLocal;
    const firstTwoAreSplit = sets.length === 3
        && (sets[0].puntosLocal > sets[0].puntosVisitante) !== (sets[1].puntosLocal > sets[1].puntosVisitante);
    const isTwoSetFinish = sets.length === 2 && (setsLocal === 2 || setsVisitante === 2);
    const isThreeSetFinish = sets.length === 3 && firstTwoAreSplit && (setsLocal === 2 || setsVisitante === 2);
    if (!isTwoSetFinish && !isThreeSetFinish) {
        throw new Error('El resultado debe finalizar 2-0 o 2-1. Si los primeros dos sets quedan 1-1, cargue el tercer set.');
    }
    match.estado = 'finalizado';
    match.sets = sets;
    match.setsLocal = setsLocal;
    match.setsVisitante = setsVisitante;
    match.ganadorId = setsLocal === 2 ? match.equipoLocalId : match.equipoVisitanteId;
    delete match.puntosLocal;
    delete match.puntosVisitante;
};

export const DataManager = {
    _getStorage() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            const data = { ...emptyData(), ...(parsed || {}) };
            // Compatibilidad con las zonas locales creadas por la versión
            // anterior, que guardaba sólo la categoría.
            data.zones = data.zones.map(zone => ({
                ...zone,
                torneoId: zone.torneoId || data.categories.find(category => category.id === zone.categoriaId)?.torneoId || null
            }));
            // Los resultados de versiones anteriores no contienen los puntos
            // de cada set y ya no sirven para la nueva clasificación. Quedan
            // pendientes para que se vuelvan a cargar con el detalle real.
            data.matches = data.matches.map(match => {
                const { puntosLocal, puntosVisitante, ...normalizedMatch } = match;
                const hasDetailedSets = Array.isArray(normalizedMatch.sets) && normalizedMatch.sets.length >= 2;
                if (normalizedMatch.estado !== 'finalizado' || hasDetailedSets) return { ...normalizedMatch, sets: normalizedMatch.sets || [] };
                return { ...normalizedMatch, estado: 'pendiente', confirmado: true, sets: [], setsLocal: null, setsVisitante: null, ganadorId: null };
            });
            return data;
        } catch {
            return emptyData();
        }
    },
    _setStorage(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); },

    getTournaments() { return this._getStorage().tournaments; },
    getTournament(id) { return this.getTournaments().find(tournament => tournament.id === id) || null; },
    createTournament(nombre, partidosAsegurados) {
        const data = this._getStorage();
        const tournament = { id: makeId('torneo'), nombre: nombre.trim(), partidos_asegurados: Number(partidosAsegurados), creado: new Date().toISOString() };
        data.tournaments.push(tournament);
        this._setStorage(data);
        return tournament;
    },

    getCategoriesByTournament(torneoId) { return this._getStorage().categories.filter(category => category.torneoId === torneoId); },
    getCategory(id) { return this._getStorage().categories.find(category => category.id === id) || null; },
    createCategory(nombre, torneoId) {
        return this.createCategories([nombre], torneoId)[0];
    },
    createCategories(nombres, torneoId) {
        const data = this._getStorage();
        const names = [...new Set((nombres || []).map(name => String(name).trim()).filter(Boolean))];
        if (!names.length) throw new Error('Seleccione al menos una categoría válida.');
        const existing = new Set(data.categories.filter(category => category.torneoId === torneoId).map(category => category.nombre.trim().toLocaleLowerCase('es')));
        if (names.some(name => existing.has(name.toLocaleLowerCase('es')))) throw new Error('Una de las categorías seleccionadas ya fue agregada al torneo.');
        const categories = names.map(nombre => ({ id: makeId('categoria'), nombre, torneoId }));
        data.categories.push(...categories);
        this._setStorage(data);
        return categories;
    },

    getTeamsByCategory(categoriaId) { return this._getStorage().teams.filter(team => team.categoriaId === categoriaId); },
    getTeamsByTournamentAndCategory(torneoId, categoriaId) { return this._getStorage().teams.filter(team => team.torneoId === torneoId && team.categoriaId === categoriaId); },
    createTeam(nombre, categoriaId, torneoId) {
        const data = this._getStorage();
        const team = { id: makeId('equipo'), nombre: nombre.trim(), categoriaId, torneoId, zonaId: null };
        data.teams.push(team);
        this._setStorage(data);
        return team;
    },
    assignTeamToZone(equipoId, zonaId) {
        const data = this._getStorage();
        const team = data.teams.find(item => item.id === equipoId);
        const zone = data.zones.find(item => item.id === zonaId);
        if (!team || !zone || team.categoriaId !== zone.categoriaId || team.torneoId !== zone.torneoId) throw new Error('El equipo y la zona deben pertenecer a la misma categoría del torneo.');
        data.zones.forEach(item => {
            if (item.liderEquipoId === team.id && item.id !== zone.id) item.liderEquipoId = null;
        });
        team.zonaId = zonaId;
        this._setStorage(data);
    },

    getZonesByTournamentAndCategory(torneoId, categoriaId) { return this._getStorage().zones.filter(zone => zone.torneoId === torneoId && zone.categoriaId === categoriaId); },
    getZonesByCategory(categoriaId) { return this._getStorage().zones.filter(zone => zone.categoriaId === categoriaId); },
    createZone(nombre, categoriaId, torneoId) {
        const data = this._getStorage();
        const zone = { id: makeId('zona'), nombre: nombre.trim(), categoriaId, torneoId, liderEquipoId: null };
        data.zones.push(zone);
        this._setStorage(data);
        return zone;
    },
    drawZones(torneoId, categoriaId, leadersByZone = {}) {
        const data = this._getStorage();
        const zones = data.zones.filter(zone => zone.torneoId === torneoId && zone.categoriaId === categoriaId);
        const teams = data.teams.filter(team => team.torneoId === torneoId && team.categoriaId === categoriaId);
        if (!zones.length) throw new Error('Cree al menos una zona antes del sorteo.');
        const leaders = Object.entries(leadersByZone || {}).filter(([, teamId]) => teamId);
        const selectedTeamIds = leaders.map(([, teamId]) => teamId);
        if (new Set(selectedTeamIds).size !== selectedTeamIds.length) throw new Error('Un equipo sólo puede ser cabeza de serie de una zona.');
        leaders.forEach(([zoneId, teamId]) => {
            const zone = zones.find(item => item.id === zoneId);
            const team = teams.find(item => item.id === teamId);
            if (!zone || !team) throw new Error('La cabeza de serie debe pertenecer a esta categoría y a una de sus zonas.');
        });

        zones.forEach(zone => { zone.liderEquipoId = null; });
        teams.forEach(team => { team.zonaId = null; });
        leaders.forEach(([zoneId, teamId]) => {
            const zone = zones.find(item => item.id === zoneId);
            const team = teams.find(item => item.id === teamId);
            zone.liderEquipoId = team.id;
            team.zonaId = zone.id;
        });

        const remaining = teams.filter(team => !team.zonaId);
        for (let index = remaining.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
        }
        remaining.forEach(team => {
            const sizes = zones.map(zone => ({ zone, count: teams.filter(item => item.zonaId === zone.id).length }));
            const minimum = Math.min(...sizes.map(item => item.count));
            const candidates = sizes.filter(item => item.count === minimum);
            team.zonaId = candidates[Math.floor(Math.random() * candidates.length)].zone.id;
        });
        this._setStorage(data);
    },

    getMatchesByTournamentAndCategory(torneoId, categoriaId) { return this._getStorage().matches.filter(match => match.torneoId === torneoId && match.categoriaId === categoriaId); },
    getMatchesByScope(torneoId, categoriaId, zonaId) { return this.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(match => !zonaId || match.zonaId === zonaId); },
    deduplicateGroupMatches(torneoId, categoriaId) {
        const data = this._getStorage();
        const normalized = deduplicateGroupPairs(data.matches);
        const removed = data.matches.length - normalized.length;
        if (removed) {
            data.matches = normalized;
            this._setStorage(data);
        }
        return removed;
    },
    addMatches(matches) {
        const data = this._getStorage();
        matches.forEach(match => { this._validateMatchPair(match); this._validateMatchDate(match); });
        data.matches = deduplicateGroupPairs(data.matches);
        assertUniqueGroupPairs([...data.matches, ...matches]);
        data.matches.push(...matches.map(match => ({
            id: makeId('partido'), ...match,
            sets: [],
            ganadorId: null
        })));
        this._setStorage(data);
    },
    updateMatches(matches) {
        const data = this._getStorage();
        matches.forEach(match => { this._validateMatchPair(match); this._validateMatchDate(match); });
        const byId = new Map(matches.map(match => [match.id, match]));
        const updated = deduplicateGroupPairs(data.matches.map(match => byId.get(match.id) || match));
        assertUniqueGroupPairs(updated);
        data.matches = updated;
        this._setStorage(data);
    },
    _validateMatchDate(match) {
        if (!match.fecha) return;
        const dates = this.getCalendarDates(match.torneoId);
        if (!dates.includes(match.fecha)) throw new Error('La fecha del partido debe estar dentro del período del torneo.');
    },
    _validateMatchPair(match) {
        if (match.equipoLocalId && match.equipoLocalId === match.equipoVisitanteId) throw new Error('Un equipo no puede jugar contra sí mismo.');
    },
    removeMatch(matchId) {
        const data = this._getStorage();
        const match = data.matches.find(item => item.id === matchId);
        if (!match) throw new Error('No se encontró el partido.');
        if (match.confirmado || match.estado !== 'borrador') throw new Error('Sólo se pueden eliminar emparejamientos en borrador.');
        data.matches = data.matches.filter(item => item.id !== matchId);
        this._setStorage(data);
    },
    removeDraftGroupMatches(torneoId, categoriaId) {
        const data = this._getStorage();
        data.matches = data.matches.filter(match => !(
            match.torneoId === torneoId
            && match.categoriaId === categoriaId
            && isZonePhaseMatch(match)
            && !match.confirmado
            && match.estado === 'borrador'
        ));
        this._setStorage(data);
    },
    updateMatchResult(matchId, sets) {
        const data = this._getStorage();
        const match = data.matches.find(item => item.id === matchId);
        if (!match) throw new Error('No se encontró el partido.');
        if (!match.confirmado && match.estado !== 'programado' && match.estado !== 'finalizado') throw new Error('El partido debe confirmarse antes de cargar un resultado.');
        applyInternalResult(match, sets);
        this._setStorage(data);
    },

    getTournamentPeriod(torneoId) {
        const tournament = this.getTournament(torneoId);
        return tournament?.startDate && tournament?.endDate ? { startDate: tournament.startDate, endDate: tournament.endDate } : null;
    },
    setTournamentPeriod(torneoId, startDate, endDate) {
        if (!startDate || !endDate || startDate > endDate) throw new Error('La fecha de inicio debe ser anterior o igual a la fecha final.');
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        tournament.startDate = startDate;
        tournament.endDate = endDate;
        this._setStorage(data);
    },
    getTournamentCourtCount(torneoId) {
        return this.getTournament(torneoId)?.cantidadCanchas || 2;
    },
    setTournamentCourtCount(torneoId, cantidadCanchas) {
        const count = Number(cantidadCanchas);
        if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Ingrese entre 1 y 20 canchas disponibles.');
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        tournament.cantidadCanchas = count;
        this._setStorage(data);
    },
    getDaySchedules(torneoId) {
        const tournament = this.getTournament(torneoId);
        const defaultStart = tournament?.horaInicio || '09:00';
        const defaultEnd = tournament?.horaFin || '21:00';
        const saved = tournament?.horariosPorDia || {};
        return this.getCalendarDates(torneoId).map(fecha => ({
            fecha,
            inicio: saved[fecha]?.inicio || defaultStart,
            fin: saved[fecha]?.fin || defaultEnd
        }));
    },
    setTournamentCalendar(torneoId, startDate, endDate, defaultStart, defaultEnd, schedules) {
        if (!startDate || !endDate || startDate > endDate) throw new Error('La fecha de inicio debe ser anterior o igual a la fecha final.');
        if (!validHours(defaultStart, defaultEnd)) throw new Error('El horario predeterminado debe tener una hora de inicio anterior a la finalización.');
        const dates = datesBetween(startDate, endDate);
        const byDate = Object.fromEntries((schedules || []).map(schedule => [schedule.fecha, schedule]));
        const horariosPorDia = {};
        dates.forEach(fecha => {
            const schedule = byDate[fecha] || { inicio: defaultStart, fin: defaultEnd };
            if (!validHours(schedule.inicio, schedule.fin)) throw new Error(`El horario de ${fecha} no es válido.`);
            horariosPorDia[fecha] = { inicio: schedule.inicio, fin: schedule.fin };
        });
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        tournament.startDate = startDate;
        tournament.endDate = endDate;
        tournament.horaInicio = defaultStart;
        tournament.horaFin = defaultEnd;
        tournament.horariosPorDia = horariosPorDia;
        this._setStorage(data);
    },
    getCalendarDates(torneoId) {
        const period = this.getTournamentPeriod(torneoId);
        return period ? datesBetween(period.startDate, period.endDate) : this._getStorage().calendar.filter(item => item.torneoId === torneoId).map(item => item.fecha).sort();
    },
    setCalendarDates(torneoId, fechas) {
        const data = this._getStorage();
        data.calendar = data.calendar.filter(item => item.torneoId !== torneoId);
        data.calendar.push(...fechas.map(fecha => ({ torneoId, fecha })));
        this._setStorage(data);
    }
};
