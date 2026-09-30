// Persistencia local del flujo principal del torneo. Esta pantalla funciona de
// forma autónoma y no depende de la gestión de licencias.
const STORAGE_KEY = 'newcom_data';
const CLASSIFICATION_MODE = { SETS: 'sets', POINTS: 'points' };
const TOURNAMENT_METHOD = { STANDARD: 'standard', ALL_VS_ALL: 'all_vs_all' };
export const PLANNING_STAGES = Object.freeze({
    ZONES: 'ZONAS',
    GUARANTEED: 'GARANTIZADOS',
    ROUND_OF_16: 'TOP_16',
    QUARTERFINALS: 'TOP_8',
    TOP_4: 'TOP_4',
    SEMIFINALS: 'SEMIFINAL',
    FINAL: 'FINAL'
});
const VALID_PLANNING_STAGES = new Set(Object.values(PLANNING_STAGES));
// N3com tiene un único formato oficial: zonas, tabla general por puntos reales
// de set y llave Top 16. Los valores históricos se leen como este formato para
// que ningún torneo antiguo siga afectando la generación de partidos.
const normalizeClassificationMode = () => CLASSIFICATION_MODE.POINTS;
const normalizeTournamentMethod = () => TOURNAMENT_METHOD.STANDARD;
let sequence = 0;

const emptyData = () => ({ tournaments: [], categories: [], teams: [], zones: [], matches: [], calendar: [], schedules: [] });
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
const defaultCourts = count => Array.from({ length: Number(count || 2) }, (_, index) => ({ id: `court_${index + 1}`, name: `Cancha ${index + 1}`, active: true }));
const normalizeCourt = (court, index) => ({
    id: String(court?.id || `court_${index + 1}`),
    name: String(court?.name || court?.nombre || `Cancha ${index + 1}`).trim() || `Cancha ${index + 1}`,
    active: court?.active !== false
});
const validHours = (start, end) => /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && minutesFromTime(start) < minutesFromTime(end);
const PHASE_BY_TYPE = { fase_zonas: 'ZONAS', cruces_todos_contra_todos: 'ALL_VS_ALL', cruces: 'CROSSES', cuarto_final: 'CROSSES', top_16: 'TOP_16', top_8: 'TOP_8', semifinal: 'SEMIFINAL', tercer_puesto: 'THIRD_PLACE', final: 'FINAL' };
const TYPE_BY_PHASE = Object.fromEntries(Object.entries(PHASE_BY_TYPE).map(([type, phase]) => [phase, type]));
const phaseFor = match => match.phase || PHASE_BY_TYPE[match.tipo] || 'ZONAS';
const isZonePhaseMatch = match => phaseFor(match) === 'ZONAS';
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
const normalizeMatch = match => {
    const phase = phaseFor(match);
    return {
        ...match,
        phase,
        tipo: TYPE_BY_PHASE[phase] || match.tipo || 'fase_zonas',
        estado: match.estado || 'pendiente',
        confirmado: match.confirmado ?? match.estado !== 'borrador',
        sets: match.sets || [],
        ganadorId: match.ganadorId || null
    };
};
const normalizeSchedule = schedule => ({
    id: String(schedule?.id || `schedule_${Date.now()}_${++sequence}`),
    torneoId: schedule?.torneoId || schedule?.tournamentId || null,
    matchId: schedule?.matchId || schedule?.partidoId || null,
    courtId: schedule?.courtId || null,
    fecha: schedule?.fecha || schedule?.date || null,
    hora: schedule?.hora || schedule?.time || null,
    orden: schedule?.orden == null ? null : Number(schedule.orden),
    categoriaId: schedule?.categoriaId || null,
    phase: schedule?.phase || null,
    zonaId: schedule?.zonaId || null,
    estado: schedule?.estado || null
});
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
    match.status = 'FINALIZADO';
    match.sets = sets;
    match.setsLocal = setsLocal;
    match.setsVisitante = setsVisitante;
    match.puntosFavor = sets.reduce((total, set) => total + set.puntosLocal, 0);
    match.puntosContra = sets.reduce((total, set) => total + set.puntosVisitante, 0);
    match.diferenciaPuntos = match.puntosFavor - match.puntosContra;
    match.ganadorId = setsLocal === 2 ? match.equipoLocalId : match.equipoVisitanteId;
    match.score = `${setsLocal}-${setsVisitante}`;
};

const advanceBracketWinner = (data, source) => {
    data.matches
        .filter(match => Array.isArray(match.sourceMatchIds) && match.sourceMatchIds.includes(source.id))
        .forEach(target => {
            const slot = target.sourceMatchIds.indexOf(source.id);
            if (slot === 0) target.equipoLocalId = source.ganadorId;
            if (slot === 1) target.equipoVisitanteId = source.ganadorId;
        });
};

export const DataManager = {
    _getStorage() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            const data = { ...emptyData(), ...(parsed || {}) };
            // Los torneos creados antes de esta opción conservan el formato
            // histórico basado en sets ganados.
            data.tournaments = data.tournaments.map(tournament => ({
                ...tournament,
                classificationMode: CLASSIFICATION_MODE.POINTS,
                method: TOURNAMENT_METHOD.STANDARD,
                courts: Array.isArray(tournament.courts) && tournament.courts.length
                    ? tournament.courts.map(normalizeCourt)
                    : defaultCourts(tournament.cantidadCanchas || 2)
            }));
            data.categories = data.categories.map(category => ({
                ...category,
                minimumRestBlocks: Math.max(0, Number(category.minimumRestBlocks || 0))
            }));
            // Compatibilidad con las zonas locales creadas por la versión
            // anterior, que guardaba sólo la categoría.
            data.zones = data.zones.map(zone => ({
                ...zone,
                torneoId: zone.torneoId || data.categories.find(category => category.id === zone.categoriaId)?.torneoId || null
            }));
            // Los resultados de versiones anteriores no contienen los puntos
            // de cada set y ya no sirven para la nueva clasificación. Quedan
            // pendientes para que se vuelvan a cargar con el detalle real.
            data.matches = data.matches.filter(match => !['ALL_VS_ALL', 'CROSSES', 'QUARTERFINAL', 'THIRD_PLACE'].includes(match.phase || PHASE_BY_TYPE[match.tipo])).map(match => {
                // Se descarta la puntuación fija de versiones anteriores. La
                // clasificación sólo se deriva de los sets reales guardados.
                const { puntosLocal, puntosVisitante, ...normalizedMatch } = match;
                const hasDetailedSets = Array.isArray(normalizedMatch.sets) && normalizedMatch.sets.length >= 2;
                if (normalizedMatch.estado !== 'finalizado') return normalizeMatch(normalizedMatch);
                if (hasDetailedSets) {
                    const restored = normalizeMatch(normalizedMatch);
                    applyInternalResult(restored, restored.sets);
                    return restored;
                }
                return normalizeMatch({ ...normalizedMatch, estado: 'pendiente', confirmado: true, sets: [], setsLocal: null, setsVisitante: null, ganadorId: null });
            });
            data.matches = data.matches.map(match => {
                const tournament = data.tournaments.find(item => item.id === match.torneoId);
                const court = tournament?.courts?.find(item => item.id === match.courtId || item.name === match.cancha);
                return { ...match, courtId: court?.id || match.courtId || null, cancha: court?.name || match.cancha || null };
            });
            // La programación es una relación propia. Los partidos históricos
            // se migran una sola vez desde sus campos legacy sin duplicar el
            // partido ni sus resultados.
            const existingSchedules = Array.isArray(data.schedules) ? data.schedules.map(normalizeSchedule) : [];
            const byMatch = new Map(existingSchedules.filter(item => item.matchId).map(item => [item.matchId, item]));
            data.matches.forEach(match => {
                if (!match.fecha || !match.hora || !match.courtId) return;
                const current = byMatch.get(match.id) || normalizeSchedule({
                    id: `schedule_${match.id}`,
                    torneoId: match.torneoId,
                    matchId: match.id,
                    courtId: match.courtId,
                    fecha: match.fecha,
                    hora: match.hora,
                    orden: match.orden, categoriaId: match.categoriaId, phase: match.phase, zonaId: match.zonaId, estado: match.estado
                });
                byMatch.set(match.id, { ...current, torneoId: match.torneoId, matchId: match.id, categoriaId: match.categoriaId, phase: match.phase, zonaId: match.zonaId, estado: match.estado });
            });
            data.schedules = [...byMatch.values()].filter(schedule => data.matches.some(match => match.id === schedule.matchId));
            // Si existe una programación nueva, sus datos mandan sobre la
            // copia legacy del partido; ésta se conserva sólo como adaptador.
            data.schedules.forEach(schedule => {
                const match = data.matches.find(item => item.id === schedule.matchId);
                const court = data.tournaments.find(item => item.id === schedule.torneoId)?.courts?.find(item => item.id === schedule.courtId);
                if (match) Object.assign(match, { courtId: schedule.courtId, cancha: court?.name || match.cancha || null, fecha: schedule.fecha, hora: schedule.hora, orden: schedule.orden });
            });
            if (!Array.isArray(parsed?.schedules) || data.schedules.length !== parsed.schedules.length) this._setStorage(data);
            return data;
        } catch {
            return emptyData();
        }
    },
    _setStorage(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); },

    getTournaments() { return this._getStorage().tournaments; },
    getTournament(id) { return this.getTournaments().find(tournament => tournament.id === id) || null; },
    getTournamentClassificationMode() { return CLASSIFICATION_MODE.POINTS; },
    getTournamentMethod() { return TOURNAMENT_METHOD.STANDARD; },
    createTournament(nombre, partidosAsegurados) {
        const data = this._getStorage();
        const tournament = { id: makeId('torneo'), nombre: nombre.trim(), partidos_asegurados: Number(partidosAsegurados), classificationMode: CLASSIFICATION_MODE.POINTS, method: TOURNAMENT_METHOD.STANDARD, courts: defaultCourts(2), cantidadCanchas: 2, blockDuration: 30, duracionPartido: 30, intervaloPartidos: 0, creado: new Date().toISOString() };
        data.tournaments.push(tournament);
        this._setStorage(data);
        return tournament;
    },

    // Borra el torneo junto con todo lo que le pertenece: categorías, equipos,
    // zonas, calendario y partidos. Los demás torneos quedan intactos.
    removeTournament(torneoId) {
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo seleccionado.');
        const categoryIds = new Set(data.categories.filter(category => category.torneoId === torneoId).map(category => category.id));
        const belongsToTournament = item => item.torneoId === torneoId || categoryIds.has(item.categoriaId);
        data.tournaments = data.tournaments.filter(item => item.id !== torneoId);
        data.categories = data.categories.filter(category => category.torneoId !== torneoId);
        data.teams = data.teams.filter(team => !belongsToTournament(team));
        data.zones = data.zones.filter(zone => !belongsToTournament(zone));
        data.matches = data.matches.filter(match => !belongsToTournament(match));
        data.schedules = data.schedules.filter(schedule => schedule.torneoId !== torneoId && !data.matches.some(match => match.id === schedule.matchId));
        data.calendar = data.calendar.filter(entry => entry.torneoId !== torneoId);
        this._setStorage(data);
        return tournament;
    },

    getCategoriesByTournament(torneoId) { return this._getStorage().categories.filter(category => category.torneoId === torneoId); },
    getCategory(id) { return this._getStorage().categories.find(category => category.id === id) || null; },
    getCategoryRestBlocks(id) { return Math.max(0, Number(this.getCategory(id)?.minimumRestBlocks || 0)); },
    setCategoryRestBlocks(torneoId, categoriaId, blocks) {
        const value = Number(blocks);
        if (!Number.isInteger(value) || value < 0 || value > 20) throw new Error('El descanso mínimo debe ser una cantidad de bloques entre 0 y 20.');
        const data = this._getStorage();
        const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category) throw new Error('La categoría no pertenece al torneo seleccionado.');
        category.minimumRestBlocks = value;
        this._setStorage(data);
    },
    setPlayoffConfig(torneoId, categoriaId, config = {}) {
        const zones = Number(config.zones || 4); const qualifiersPerZone = Number(config.qualifiersPerZone || 2);
        if (!Number.isInteger(zones) || !Number.isInteger(qualifiersPerZone) || zones < 1 || qualifiersPerZone < 1) throw new Error('La configuración de cruces no es válida.');
        const data = this._getStorage(); const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category) throw new Error('La categoría no pertenece al torneo seleccionado.');
        category.playoffConfig = { zones, qualifiersPerZone, totalTeams: zones * qualifiersPerZone, format: config.format || 'single_elimination' };
        this._setStorage(data); return category.playoffConfig;
    },
    getCategoryPlanning(torneoId, categoriaId) {
        const category = this._getStorage().categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category?.planning || !Array.isArray(category.planning.days)) return null;
        return {
            ...category.planning,
            days: category.planning.days.map(day => ({
                date: day.date,
                stages: [...new Set((day.stages || []).filter(stage => VALID_PLANNING_STAGES.has(stage)))]
            })).sort((left, right) => left.date.localeCompare(right.date))
        };
    },
    setCategoryPlanning(torneoId, categoriaId, days) {
        const data = this._getStorage();
        const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category) throw new Error('La categoría no pertenece al torneo seleccionado.');
        const calendarDates = new Set(this.getCalendarDates(torneoId));
        const previousByDate = new Map((category.planning?.days || []).map(day => [day.date, JSON.stringify(day.stages || [])]));
        const seenDates = new Set();
        const normalizedDays = (days || []).map(day => {
            const date = String(day?.date || '');
            if (!calendarDates.has(date) && previousByDate.get(date) !== JSON.stringify(day.stages || [])) throw new Error('Esta fecha no está habilitada en el calendario del torneo.');
            if (seenDates.has(date)) throw new Error('Una jornada no puede aparecer dos veces en la planificación.');
            seenDates.add(date);
            const stages = [...new Set(day?.stages || [])];
            if (stages.some(stage => !VALID_PLANNING_STAGES.has(stage))) throw new Error('La planificación contiene una etapa no válida.');
            return { date, stages };
        }).sort((left, right) => left.date.localeCompare(right.date));
        category.planning = { days: normalizedDays, updatedAt: new Date().toISOString() };
        this._setStorage(data);
        return category.planning;
    },
    getPlanningDatesForStage(torneoId, categoriaId, phase) {
        const planning = this.getCategoryPlanning(torneoId, categoriaId);
        if (!planning) return [];
        const accepted = phase === 'ZONAS' ? new Set(['ZONAS', 'GARANTIZADOS']) : new Set([phase]);
        return planning.days.filter(day => day.stages.some(stage => accepted.has(stage))).map(day => day.date);
    },
    setAllVsAllCrossesClosed(torneoId, categoriaId, closed = true) {
        const data = this._getStorage();
        const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category) throw new Error('La categoría no pertenece al torneo seleccionado.');
        category.allVsAllCrossesClosed = Boolean(closed);
        this._setStorage(data);
    },
    createCategory(nombre, torneoId) {
        return this.createCategories([nombre], torneoId)[0];
    },
    createCategories(nombres, torneoId) {
        const data = this._getStorage();
        const names = [...new Set((nombres || []).map(name => String(name).trim()).filter(Boolean))];
        if (!names.length) throw new Error('Seleccione al menos una categoría válida.');
        const existing = new Set(data.categories.filter(category => category.torneoId === torneoId).map(category => category.nombre.trim().toLocaleLowerCase('es')));
        if (names.some(name => existing.has(name.toLocaleLowerCase('es')))) throw new Error('Una de las categorías seleccionadas ya fue agregada al torneo.');
        const categories = names.map(nombre => ({ id: makeId('categoria'), nombre, torneoId, minimumRestBlocks: 0 }));
        data.categories.push(...categories);
        this._setStorage(data);
        return categories;
    },

    getTeamsByCategory(categoriaId) { return this._getStorage().teams.filter(team => team.categoriaId === categoriaId); },
    getTeamsByTournamentAndCategory(torneoId, categoriaId) { return this._getStorage().teams.filter(team => team.torneoId === torneoId && team.categoriaId === categoriaId); },
    createTeam(nombre, categoriaId, torneoId) {
        const data = this._getStorage();
        const name = String(nombre || '').trim();
        const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category) throw new Error('La categoría seleccionada no pertenece al torneo.');
        if (!name) throw new Error('Ingrese un nombre de equipo válido.');
        if (data.teams.some(team => team.torneoId === torneoId && team.categoriaId === categoriaId && team.nombre.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) throw new Error('Ya existe un equipo con ese nombre en esta categoría.');
        const team = { id: makeId('equipo'), nombre: name, categoriaId, torneoId, zonaId: null };
        data.teams.push(team);
        this._setStorage(data);
        return team;
    },
    assignTeamToZone(equipoId, zonaId) {
        const data = this._getStorage();
        const team = data.teams.find(item => item.id === equipoId);
        const zone = data.zones.find(item => item.id === zonaId);
        if (!team || !zone || team.categoriaId !== zone.categoriaId || team.torneoId !== zone.torneoId) throw new Error('El equipo y la zona deben pertenecer a la misma categoría del torneo.');
        const leaderZone = data.zones.find(item => item.liderEquipoId === team.id);
        if (leaderZone && leaderZone.id !== zone.id) throw new Error('La cabeza de serie está fija en su zona y no se puede mover.');
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

        // Un líder ya confirmado es una asignación fija: ningún sorteo puede
        // cambiar su zona ni reemplazarlo por otro equipo.
        const lockedLeaders = zones.filter(zone => zone.liderEquipoId);
        lockedLeaders.forEach(zone => {
            const leader = teams.find(team => team.id === zone.liderEquipoId);
            if (!leader || leader.zonaId !== zone.id) throw new Error(`La cabeza de serie de ${zone.nombre} no coincide con su zona.`);
        });
        leaders.forEach(([zoneId, teamId]) => {
            const zone = zones.find(item => item.id === zoneId);
            const team = teams.find(item => item.id === teamId);
            if (!zone || !team) throw new Error('La cabeza de serie debe pertenecer a esta categoría y a una de sus zonas.');
            if (zone.liderEquipoId && zone.liderEquipoId !== team.id) throw new Error(`La cabeza de serie de ${zone.nombre} está fija y no se puede reemplazar en el sorteo.`);
            if (!zone.liderEquipoId && team.zonaId) throw new Error('Sólo se puede elegir como nueva cabeza de serie un equipo sin zona.');
            const lockedZone = lockedLeaders.find(item => item.liderEquipoId === team.id);
            if (lockedZone && lockedZone.id !== zone.id) throw new Error('La cabeza de serie ya está fija en otra zona.');
        });

        // Las nuevas cabezas sólo pueden salir del conjunto libre. Las ya
        // asignadas (líderes o no) se conservan exactamente como están.
        leaders.forEach(([zoneId, teamId]) => {
            const zone = zones.find(item => item.id === zoneId);
            const team = teams.find(item => item.id === teamId);
            if (!zone.liderEquipoId) {
                zone.liderEquipoId = team.id;
                team.zonaId = zone.id;
            }
        });

        // El sorteo opera exclusivamente sobre los equipos sin zona. Cada
        // vuelta usa la zona menos poblada, por lo que sólo llena los cupos
        // disponibles y deja la distribución tan equilibrada como permitan
        // las asignaciones ya fijas.
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
    /** Devuelve la programación de una cancha, no una copia de los partidos. */
    getScheduleByCourt(torneoId, courtId, filters = {}) {
        const data = this._getStorage();
        return data.schedules
            .filter(schedule => schedule.torneoId === torneoId && schedule.courtId === courtId)
            .filter(schedule => !filters.fecha || schedule.fecha === filters.fecha)
            .map(schedule => ({ ...schedule, match: data.matches.find(match => match.id === schedule.matchId) || null }))
            .sort((left, right) => `${left.fecha || ''}T${left.hora || ''}`.localeCompare(`${right.fecha || ''}T${right.hora || ''}`) || (left.orden || 0) - (right.orden || 0));
    },
    getTournamentSchedule(torneoId, filters = {}) {
        const data = this._getStorage();
        return data.schedules
            .filter(schedule => schedule.torneoId === torneoId)
            .filter(schedule => !filters.courtId || schedule.courtId === filters.courtId)
            .filter(schedule => !filters.fecha || schedule.fecha === filters.fecha)
            .map(schedule => ({ ...schedule, match: data.matches.find(match => match.id === schedule.matchId) || null }))
            .sort((left, right) => `${left.fecha || ''}T${left.hora || ''}`.localeCompare(`${right.fecha || ''}T${right.hora || ''}`) || (left.orden || 0) - (right.orden || 0));
    },
    validateTournamentSchedule(torneoId) {
        const data = this._getStorage();
        const schedules = data.schedules.filter(schedule => schedule.torneoId === torneoId);
        const matches = data.matches.filter(match => match.torneoId === torneoId);
        const errors = [], warnings = [];
        const seenMatches = new Set();
        const seenSlots = new Set();
        schedules.forEach(schedule => {
            const match = matches.find(item => item.id === schedule.matchId);
            if (!match) errors.push(`La programación ${schedule.id} apunta a un partido inexistente.`);
            if (seenMatches.has(schedule.matchId)) errors.push(`El partido ${schedule.matchId} tiene más de una programación.`);
            seenMatches.add(schedule.matchId);
            if (!schedule.courtId || !schedule.fecha || !schedule.hora) errors.push(`El partido ${schedule.matchId} tiene una programación incompleta.`);
            const slot = `${schedule.fecha}|${schedule.hora}|${schedule.courtId}`;
            if (seenSlots.has(slot)) errors.push(`${schedule.courtId} — ${schedule.hora}: conflicto de horario.`);
            seenSlots.add(slot);
        });
        matches.filter(match => match.confirmado || match.estado !== 'borrador').forEach(match => {
            if (!schedules.some(schedule => schedule.matchId === match.id)) errors.push(`El partido ${match.id} no tiene cancha, fecha u horario asignado.`);
        });
        const teamSlots = new Map();
        schedules.forEach(schedule => {
            const match = matches.find(item => item.id === schedule.matchId);
            if (!match) return;
            [match.equipoLocalId, match.equipoVisitanteId].filter(Boolean).forEach(teamId => {
                const key = `${schedule.fecha}|${schedule.hora}|${teamId}`;
                if (teamSlots.has(key)) errors.push(`El equipo ${teamId} tiene dos partidos programados simultáneamente.`);
                teamSlots.set(key, schedule.matchId);
            });
        });
        const byTeam = new Map();
        schedules.forEach(schedule => {
            const match = matches.find(item => item.id === schedule.matchId);
            [match?.equipoLocalId, match?.equipoVisitanteId].filter(Boolean).forEach(teamId => {
                const list = byTeam.get(teamId) || []; list.push(schedule); byTeam.set(teamId, list);
            });
        });
        byTeam.forEach(list => {
            list.sort((a, b) => `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`));
            list.forEach((schedule, index) => {
                const next = list[index + 1];
                if (!next || schedule.fecha !== next.fecha) return;
                const category = matches.find(match => match.id === schedule.matchId)?.categoriaId;
                const rest = this.getCategoryRestBlocks(category);
                if (minutesFromTime(next.hora) - minutesFromTime(schedule.hora) < this.getTournamentSchedulingSettings(torneoId).blockDuration * (rest + 1)) {
                    const teamId = [...byTeam.entries()].find(([, entries]) => entries.includes(schedule))?.[0];
                    const team = data.teams.find(item => item.id === teamId);
                    warnings.push(`El equipo ${team?.nombre || 'desconocido'} tiene descanso insuficiente.`);
                }
            });
        });
        return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
    },
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
        const prepared = matches.map(normalizeMatch);
        prepared.forEach(match => this._validateMatch(match, data));
        assertUniqueGroupPairs([...data.matches, ...prepared]);
        const created = prepared.map(match => normalizeMatch({ id: makeId('partido'), ...match, sets: [], ganadorId: null }));
        data.matches.push(...created);
        data.schedules.push(...created.filter(match => match.fecha && match.hora && match.courtId).map(match => normalizeSchedule({
            id: `schedule_${match.id}`, torneoId: match.torneoId, matchId: match.id,
            courtId: match.courtId, fecha: match.fecha, hora: match.hora, orden: match.orden,
            categoriaId: match.categoriaId, phase: match.phase, zonaId: match.zonaId, estado: match.estado
        })));
        this._validateScheduleConflicts(data.matches);
        this._setStorage(data);
        return created;
    },
    updateMatches(matches) {
        const data = this._getStorage();
        const byId = new Map(matches.map(match => [match.id, normalizeMatch(match)]));
        byId.forEach((match, id) => {
            const original = data.matches.find(item => item.id === id);
            if (!original) throw new Error('No se encontró el partido a modificar.');
            if (original?.estado === 'finalizado' && JSON.stringify(normalizeMatch(original)) !== JSON.stringify(match)) throw new Error('No se puede modificar un partido finalizado.');
            this._validateMatch(match, data);
        });
        const updated = data.matches.map(match => byId.get(match.id) || match);
        assertUniqueGroupPairs(updated);
        this._validateScheduleConflicts(updated);
        data.matches = updated;
        const changedIds = new Set(byId.keys());
        data.schedules = data.schedules
            .filter(schedule => !changedIds.has(schedule.matchId))
            .concat(updated.filter(match => changedIds.has(match.id) && match.fecha && match.hora && match.courtId).map(match => normalizeSchedule({
                id: data.schedules.find(schedule => schedule.matchId === match.id)?.id || `schedule_${match.id}`,
                torneoId: match.torneoId, matchId: match.id, courtId: match.courtId,
                fecha: match.fecha, hora: match.hora, orden: match.orden,
                categoriaId: match.categoriaId, phase: match.phase, zonaId: match.zonaId, estado: match.estado
            })));
        this._setStorage(data);
    },
    createManualMatch(match) {
        const planning = this.getCategoryPlanning(match.torneoId, match.categoriaId);
        if (planning && match.fecha) {
            const planningPhase = phaseFor(match) === 'THIRD_PLACE' ? 'FINAL' : phaseFor(match);
            if (!this.getPlanningDatesForStage(match.torneoId, match.categoriaId, planningPhase).includes(match.fecha)) throw new Error('La etapa de este partido no está configurada para la jornada seleccionada.');
        }
        return this.addMatches([{ ...match, estado: 'pendiente', confirmado: true }]);
    },
    _validateMatchDate(match) {
        if (!match.fecha) return;
        const dates = this.getCalendarDates(match.torneoId);
        if (!dates.includes(match.fecha)) throw new Error('Esta fecha no está habilitada en el calendario del torneo.');
    },
    _validateMatchPair(match) {
        if (match.equipoLocalId && match.equipoLocalId === match.equipoVisitanteId) throw new Error('Un equipo no puede jugar contra sí mismo.');
    },
    _validateMatch(match, data) {
        this._validateMatchPair(match); this._validateMatchDate(match);
        const category = data.categories.find(item => item.id === match.categoriaId && item.torneoId === match.torneoId);
        if (!category) throw new Error('La categoría del partido no existe en este torneo.');
        const bracketPhase = ['TOP_16', 'TOP_8', 'SEMIFINAL', 'FINAL'].includes(phaseFor(match));
        if ((!match.equipoLocalId || !match.equipoVisitanteId) && !bracketPhase) throw new Error('El partido debe tener dos equipos asignados.');
        if (match.orden !== undefined && match.orden !== null && (!Number.isInteger(Number(match.orden)) || Number(match.orden) < 1)) throw new Error('El orden del partido debe ser un número entero mayor que cero.');
        if (match.hora && (!/^\d{2}:\d{2}$/.test(match.hora) || minutesFromTime(match.hora) >= 1440)) throw new Error('El horario del partido no es válido.');
        if (match.fecha && match.hora) {
            const day = this.getDaySchedules(match.torneoId).find(item => item.fecha === match.fecha);
            const block = this.getTournamentSchedulingSettings(match.torneoId).blockDuration;
            const start = minutesFromTime(match.hora);
            if (!day || start < minutesFromTime(day.inicio) || start + block > minutesFromTime(day.fin) || (start - minutesFromTime(day.inicio)) % block !== 0) {
                throw new Error('El horario debe coincidir con un bloque válido dentro de la jornada.');
            }
        }
        if (match.cancha || match.courtId) {
            const courts = this.getTournamentCourts(match.torneoId);
            const court = courts.find(item => item.id === match.courtId || item.name === match.cancha);
            if (!court) throw new Error('La cancha seleccionada no existe en este torneo.');
            match.courtId = court.id;
            match.cancha = court.name;
        }
        const local = match.equipoLocalId ? data.teams.find(team => team.id === match.equipoLocalId) : null;
        const visitante = match.equipoVisitanteId ? data.teams.find(team => team.id === match.equipoVisitanteId) : null;
        if ((match.equipoLocalId && !local) || (match.equipoVisitanteId && !visitante) || (local && (local.torneoId !== match.torneoId || local.categoriaId !== match.categoriaId)) || (visitante && (visitante.torneoId !== match.torneoId || visitante.categoriaId !== match.categoriaId))) throw new Error('Los equipos deben pertenecer a la categoría del partido.');
        if (phaseFor(match) === 'ZONAS' && (!local || !visitante || local.zonaId !== visitante.zonaId || !local.zonaId || match.zonaId !== local.zonaId)) throw new Error('No se pueden enfrentar equipos de zonas diferentes durante esta fase.');
        if (match.fecha && category.planning?.days) {
            const planningPhase = phaseFor(match) === 'THIRD_PLACE' ? 'FINAL' : phaseFor(match);
            const day = category.planning.days.find(item => item.date === match.fecha);
            const accepted = planningPhase === 'ZONAS' ? ['ZONAS', 'GARANTIZADOS'] : [planningPhase];
            if (!day?.stages?.some(stage => accepted.includes(stage))) throw new Error('La etapa de este partido no está permitida en la jornada elegida para su categoría.');
        }
    },
    _validateScheduleConflicts(matches) {
        const scheduledMatches = matches.filter(match => match.fecha && match.hora);
        scheduledMatches.forEach((match, index, scheduled) => {
            scheduled.slice(index + 1).forEach(other => {
                if (match.torneoId !== other.torneoId) return;
                if (match.fecha !== other.fecha || match.hora !== other.hora) return;
                if (match.cancha && other.cancha && (match.courtId && other.courtId ? match.courtId === other.courtId : match.cancha === other.cancha)) throw new Error(`${match.cancha} ya está ocupada a las ${match.hora} (conflicto de cancha y horario).`);
                const busyTeamId = [match.equipoLocalId, match.equipoVisitanteId].find(id => [other.equipoLocalId, other.equipoVisitanteId].includes(id));
                if (busyTeamId) {
                    const name = this._getStorage().teams.find(team => team.id === busyTeamId)?.nombre || 'El equipo';
                    throw new Error(`${name} ya tiene un partido programado a las ${match.hora}.`);
                }
            });
        });
        // No alcanza con comparar horas iguales: cada partido ocupa toda su
        // duración configurada. Se bloquean superposiciones de cancha y equipo.
        matches.filter(match => match.fecha && match.hora).forEach((match, index, scheduled) => {
            scheduled.slice(index + 1).forEach(other => {
                if (match.torneoId !== other.torneoId) return;
                if (match.fecha !== other.fecha || !other.hora) return;
                const matchStart = minutesFromTime(match.hora);
                const otherStart = minutesFromTime(other.hora);
                const matchEnd = matchStart + this.getTournamentSchedulingSettings(match.torneoId).blockDuration;
                const otherEnd = otherStart + this.getTournamentSchedulingSettings(other.torneoId).blockDuration;
                if (matchStart >= otherEnd || otherStart >= matchEnd) return;
                if (match.cancha && other.cancha && (match.courtId && other.courtId ? match.courtId === other.courtId : match.cancha === other.cancha)) throw new Error(`${match.cancha} ya está ocupada durante ese bloque (conflicto de cancha y horario).`);
                if ([match.equipoLocalId, match.equipoVisitanteId].some(id => [other.equipoLocalId, other.equipoVisitanteId].includes(id))) throw new Error('Un equipo no puede tener partidos con horarios superpuestos.');
            });
        });
        const data = this._getStorage();
        const byTeam = new Map();
        scheduledMatches.forEach(match => [match.equipoLocalId, match.equipoVisitanteId].forEach(teamId => {
            const list = byTeam.get(teamId) || [];
            list.push(match);
            byTeam.set(teamId, list);
        }));
        byTeam.forEach((teamMatches, teamId) => {
            teamMatches.sort((left, right) => `${left.fecha}T${left.hora}`.localeCompare(`${right.fecha}T${right.hora}`));
            teamMatches.forEach((match, index) => {
                const other = teamMatches[index + 1];
                if (!other || match.torneoId !== other.torneoId || match.fecha !== other.fecha) return;
                const restBlocks = Math.max(this.getCategoryRestBlocks(match.categoriaId), this.getCategoryRestBlocks(other.categoriaId));
                const block = this.getTournamentSchedulingSettings(match.torneoId).blockDuration;
                if (minutesFromTime(other.hora) - minutesFromTime(match.hora) < block * (restBlocks + 1)) {
                    const teamName = data.teams.find(team => team.id === teamId)?.nombre || 'El equipo';
                    throw new Error(`${teamName} no cumple el descanso mínimo de ${restBlocks} bloque${restBlocks === 1 ? '' : 's'}.`);
                }
            });
        });
    },
    removeMatch(matchId) {
        const data = this._getStorage();
        const match = data.matches.find(item => item.id === matchId);
        if (!match) throw new Error('No se encontró el partido.');
        if (match.estado === 'finalizado') throw new Error('No se puede eliminar un partido finalizado.');
        data.matches = data.matches.filter(item => item.id !== matchId);
        data.schedules = data.schedules.filter(schedule => schedule.matchId !== matchId);
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
        const schedule = data.schedules.find(item => item.matchId === matchId);
        if (schedule) schedule.estado = match.estado;
        advanceBracketWinner(data, match);
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
        return this.getTournamentCourts(torneoId).filter(court => court.active).length;
    },
    getTournamentCourts(torneoId) {
        const tournament = this.getTournament(torneoId);
        return Array.isArray(tournament?.courts) && tournament.courts.length ? tournament.courts.map(normalizeCourt) : defaultCourts(tournament?.cantidadCanchas || 2);
    },
    getActiveTournamentCourts(torneoId) {
        return this.getTournamentCourts(torneoId).filter(court => court.active);
    },
    getTournamentSchedulingSettings(torneoId) {
        const tournament = this.getTournament(torneoId);
        const duration = Number(tournament?.duracionPartido || 60);
        const interval = Number(tournament?.intervaloPartidos || 0);
        return { duracionPartido: duration, intervaloPartidos: interval, blockDuration: Number(tournament?.blockDuration || duration + interval) };
    },
    setTournamentSchedulingSettings(torneoId, duracionPartido, intervaloPartidos, blockDuration = null) {
        const duration = Number(duracionPartido); const interval = Number(intervaloPartidos);
        if (!Number.isInteger(duration) || duration < 1 || duration > 240 || !Number.isInteger(interval) || interval < 0 || interval > 120) throw new Error('La duración y el intervalo deben ser valores válidos en minutos.');
        const block = blockDuration === null ? duration + interval : Number(blockDuration);
        if (!Number.isInteger(block) || block < 5 || block > 240) throw new Error('La duración del bloque debe ser un valor entre 5 y 240 minutos.');
        const data = this._getStorage(); const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        tournament.duracionPartido = duration; tournament.intervaloPartidos = interval; tournament.blockDuration = block; this._setStorage(data);
    },
    setTournamentCourtCount(torneoId, cantidadCanchas) {
        const count = Number(cantidadCanchas);
        if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Ingrese entre 1 y 20 canchas disponibles.');
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        const current = Array.isArray(tournament.courts) ? tournament.courts.map(normalizeCourt) : defaultCourts(tournament.cantidadCanchas || 2);
        if (count < current.length) {
            const removed = current.slice(count);
            const used = data.matches.find(match => match.torneoId === torneoId && removed.some(court => court.id === match.courtId || court.name === match.cancha));
            if (used) throw new Error('No se puede eliminar una cancha que está siendo utilizada por partidos.');
        }
        tournament.courts = Array.from({ length: count }, (_, index) => current[index] || normalizeCourt(null, index));
        tournament.cantidadCanchas = count;
        this._setStorage(data);
    },
    setTournamentCourts(torneoId, courts) {
        const normalized = (courts || []).map(normalizeCourt);
        if (!normalized.length || normalized.length > 20) throw new Error('El torneo debe tener entre 1 y 20 canchas.');
        if (!normalized.some(court => court.active)) throw new Error('El torneo debe conservar al menos una cancha activa.');
        if (new Set(normalized.map(court => court.name.toLocaleLowerCase('es'))).size !== normalized.length) throw new Error('Los nombres de las canchas no pueden repetirse.');
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        const previous = Array.isArray(tournament.courts) ? tournament.courts.map(normalizeCourt) : defaultCourts(tournament.cantidadCanchas || 2);
        const removed = previous.filter(court => !normalized.some(item => item.id === court.id));
        const used = data.matches.find(match => match.torneoId === torneoId && removed.some(court => match.courtId === court.id || match.cancha === court.name));
        if (used) throw new Error('No se puede eliminar una cancha que está siendo utilizada por partidos.');
        data.matches.forEach(match => {
            if (match.torneoId !== torneoId) return;
            const court = normalized.find(item => item.id === match.courtId) || normalized.find(item => item.name === match.cancha);
            if (court) { match.courtId = court.id; match.cancha = court.name; }
        });
        tournament.courts = normalized;
        tournament.cantidadCanchas = normalized.length;
        this._setStorage(data);
        return normalized;
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
    getCalendarDateUsage(torneoId, dates) {
        const targets = new Set(dates || []);
        const data = this._getStorage();
        const categories = data.categories.filter(category => category.torneoId === torneoId);
        return [...targets].map(date => {
            const plannedCategories = categories.filter(category => category.planning?.days?.some(day => day.date === date && day.stages?.length));
            const matches = data.matches.filter(match => match.torneoId === torneoId && match.fecha === date);
            return {
                date,
                categoryIds: [...new Set([...plannedCategories.map(category => category.id), ...matches.map(match => match.categoriaId)])],
                categoryNames: [...new Set([...plannedCategories.map(category => category.nombre), ...matches.map(match => categories.find(category => category.id === match.categoriaId)?.nombre).filter(Boolean)])],
                planningCount: plannedCategories.length,
                matchCount: matches.length
            };
        }).filter(usage => usage.planningCount || usage.matchCount);
    },
    setTournamentCalendar(torneoId, startDate, endDate, defaultStart, defaultEnd, schedules, options = {}) {
        if (!startDate || !endDate || startDate > endDate) throw new Error('La fecha de inicio debe ser anterior o igual a la fecha final.');
        if (!validHours(defaultStart, defaultEnd)) throw new Error('El horario predeterminado debe tener una hora de inicio anterior a la finalización.');
        const dates = datesBetween(startDate, endDate);
        const removedDates = this.getCalendarDates(torneoId).filter(date => !dates.includes(date));
        const removedUsage = this.getCalendarDateUsage(torneoId, removedDates);
        // Las llamadas históricas del servicio siguen siendo compatibles. La
        // interfaz de Calendario solicita explícitamente la validación previa.
        if (removedUsage.length && options.allowUsedDateRemoval === false) {
            const error = new Error('Esta fecha está siendo utilizada por partidos o planificación de categorías.');
            error.code = 'CALENDAR_DATE_IN_USE';
            error.usage = removedUsage;
            throw error;
        }
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
