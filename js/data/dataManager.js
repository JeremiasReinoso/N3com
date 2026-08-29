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
// El marcador es el único dato que ingresa la interfaz. A partir de él se
// construye el resultado interno que usan tabla y eliminatorias.
const scoreFromMarker = (setsLocal, setsVisitante) => {
    const local = Number(setsLocal);
    const visitante = Number(setsVisitante);
    if (local === 2 && visitante === 0) return { setsLocal: local, setsVisitante: visitante, puntosLocal: 3, puntosVisitante: 1, ganaLocal: true };
    if (local === 2 && visitante === 1) return { setsLocal: local, setsVisitante: visitante, puntosLocal: 2, puntosVisitante: 1, ganaLocal: true };
    if (visitante === 2 && local === 0) return { setsLocal: local, setsVisitante: visitante, puntosLocal: 1, puntosVisitante: 3, ganaLocal: false };
    if (visitante === 2 && local === 1) return { setsLocal: local, setsVisitante: visitante, puntosLocal: 1, puntosVisitante: 2, ganaLocal: false };
    return null;
};
const applyInternalResult = (match, setsLocal, setsVisitante) => {
    const score = scoreFromMarker(setsLocal, setsVisitante);
    if (!score) throw new Error('Los únicos resultados válidos son 2-0 o 2-1.');
    match.estado = 'finalizado';
    match.setsLocal = score.setsLocal;
    match.setsVisitante = score.setsVisitante;
    match.puntosLocal = score.puntosLocal;
    match.puntosVisitante = score.puntosVisitante;
    match.ganadorId = score.ganaLocal ? match.equipoLocalId : match.equipoVisitanteId;
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
            // Migra resultados anteriores al mismo modelo interno, sin depender
            // de valores de puntos que hubiera podido mostrar una vista antigua.
            data.matches = data.matches.map(match => {
                if (match.estado !== 'finalizado') return match;
                const score = scoreFromMarker(match.setsLocal, match.setsVisitante);
                return score ? {
                    ...match,
                    puntosLocal: score.puntosLocal,
                    puntosVisitante: score.puntosVisitante,
                    ganadorId: score.ganaLocal ? match.equipoLocalId : match.equipoVisitanteId
                } : match;
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
        const data = this._getStorage();
        const category = { id: makeId('categoria'), nombre: nombre.trim(), torneoId };
        data.categories.push(category);
        this._setStorage(data);
        return category;
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
        team.zonaId = zonaId;
        this._setStorage(data);
    },

    getZonesByTournamentAndCategory(torneoId, categoriaId) { return this._getStorage().zones.filter(zone => zone.torneoId === torneoId && zone.categoriaId === categoriaId); },
    getZonesByCategory(categoriaId) { return this._getStorage().zones.filter(zone => zone.categoriaId === categoriaId); },
    createZone(nombre, categoriaId, torneoId) {
        const data = this._getStorage();
        const zone = { id: makeId('zona'), nombre: nombre.trim(), categoriaId, torneoId };
        data.zones.push(zone);
        this._setStorage(data);
        return zone;
    },
    drawZones(torneoId, categoriaId) {
        const data = this._getStorage();
        const zones = data.zones.filter(zone => zone.torneoId === torneoId && zone.categoriaId === categoriaId);
        const teams = data.teams.filter(team => team.torneoId === torneoId && team.categoriaId === categoriaId).slice().sort(() => Math.random() - 0.5);
        if (!zones.length) throw new Error('Cree al menos una zona antes del sorteo.');
        teams.forEach((team, index) => { team.zonaId = zones[index % zones.length].id; });
        this._setStorage(data);
    },

    getMatchesByTournamentAndCategory(torneoId, categoriaId) { return this._getStorage().matches.filter(match => match.torneoId === torneoId && match.categoriaId === categoriaId); },
    getMatchesByScope(torneoId, categoriaId, zonaId) { return this.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(match => !zonaId || match.zonaId === zonaId); },
    addMatches(matches) {
        const data = this._getStorage();
        matches.forEach(match => { this._validateMatchPair(match); this._validateMatchDate(match); });
        data.matches.push(...matches.map(match => ({
            id: makeId('partido'), ...match,
            puntosLocal: null,
            puntosVisitante: null,
            ganadorId: null
        })));
        this._setStorage(data);
    },
    updateMatches(matches) {
        const data = this._getStorage();
        matches.forEach(match => { this._validateMatchPair(match); this._validateMatchDate(match); });
        const byId = new Map(matches.map(match => [match.id, match]));
        data.matches = data.matches.map(match => byId.get(match.id) || match);
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
    updateMatchResult(matchId, setsLocal, setsVisitante) {
        const data = this._getStorage();
        const match = data.matches.find(item => item.id === matchId);
        if (!match) throw new Error('No se encontró el partido.');
        if (!match.confirmado && match.estado !== 'programado' && match.estado !== 'finalizado') throw new Error('El partido debe confirmarse antes de cargar un resultado.');
        applyInternalResult(match, setsLocal, setsVisitante);
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
