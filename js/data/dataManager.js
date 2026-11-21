// Persistencia local del flujo principal del torneo. Esta pantalla funciona de
// forma autónoma y no depende de la gestión de licencias.
import { PLANNING_STAGES, isValidPlanningStage, normalizeTournamentStage } from '../domain/tournamentStages.js';
import { applyMatchSets } from '../engine/resultsEngine.js';

export { PLANNING_STAGES };

const STORAGE_KEY = 'newcom_data';
const CLASSIFICATION_MODE = { SETS: 'sets', POINTS: 'points' };
// N3com tiene un único formato oficial: zonas, tabla general por puntos reales
// de set y llave Top 16. Los valores históricos se leen como este formato para
// que ningún torneo antiguo siga afectando la generación de partidos.
const normalizeClassificationMode = () => CLASSIFICATION_MODE.POINTS;
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
// Unifica la semántica de intervalo entre partidos y duración de bloque:
// si el intervalo es menor que el bloque se interpreta como pausa entre partidos
// (bloque + pausa); si es mayor o igual, conserva la compatibilidad legacy como
// paso directo entre horarios de inicio consecutivos.
export const resolveSlotInterval = (blockDuration, intervaloPartidos) => {
    const block = Number(blockDuration || 60);
    const interval = Number(intervaloPartidos || 0);
    if (interval <= 0) return block;
    return interval < block ? block + interval : interval;
};
const defaultCourts = count => Array.from({ length: Number(count || 2) }, (_, index) => ({ id: `court_${index + 1}`, name: `Cancha ${index + 1}` }));
const normalizeCourt = (court, index) => ({
    id: String(court?.id || `court_${index + 1}`),
    name: String(court?.name || court?.nombre || `Cancha ${index + 1}`).trim() || `Cancha ${index + 1}`
});
const validHours = (start, end) => /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && minutesFromTime(start) < minutesFromTime(end);
const validPlanningDate = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const PHASE_BY_TYPE = {
    fase_zonas: 'ZONAS',
    liga: 'LIGA',
    todos_contra_todos: 'LIGA',
    zona_final: 'ZONA_FINAL',
    cruces: 'TOP_16',
    top_32: 'TOP_32',
    cuarto_final: 'TOP_8',
    top_16: 'TOP_16',
    top_8: 'TOP_8',
    top_4: 'TOP_4',
    semifinal: 'SEMIFINAL',
    tercer_puesto: 'THIRD_PLACE',
    final: 'FINAL'
};
const LEGACY_PHASES = {};
const TYPE_BY_PHASE = {
    ZONAS: 'fase_zonas',
    LIGA: 'liga',
    ZONA_FINAL: 'zona_final',
    TOP_32: 'top_32',
    TOP_16: 'top_16',
    TOP_8: 'top_8',
    TOP_4: 'top_4',
    SEMIFINAL: 'semifinal',
    THIRD_PLACE: 'tercer_puesto',
    FINAL: 'final'
};
const phaseFor = match => LEGACY_PHASES[match.phase] ?? (match.phase || PHASE_BY_TYPE[match.tipo] || 'ZONAS');
const normalizePlanningStage = stage => normalizeTournamentStage(LEGACY_PHASES[stage] ?? stage);
const acceptedPlanningStagesForPhase = phase => {
    const normalized = normalizePlanningStage(phase);
    if (normalized === 'ZONAS' || normalized === 'LIGA') return ['ZONAS', 'GARANTIZADOS'];
    if (normalized === 'ZONA_FINAL') return ['FINAL', 'SEMIFINAL', 'ZONAS', 'GARANTIZADOS'];
    if (normalized === 'TOP_32') return ['TOP_16', 'ZONAS'];
    if (normalized === 'THIRD_PLACE') return ['FINAL'];
    return [normalized];
};
const isZonePhaseMatch = match => phaseFor(match) === 'ZONAS';
const isTablePhaseMatch = match => ['ZONAS', 'LIGA', 'ZONA_FINAL'].includes(phaseFor(match));
const isAllowedSpecialCross = (match, category, local, visitante, zones) => {
    if (match.tipo !== 'cruce_especial' || category?.nombre !== '+50 Mixto' || !local || !visitante) return false;
    const localZone = zones.find(zone => zone.id === local.zonaId)?.nombre?.trim().toLocaleUpperCase('es');
    const visitanteZone = zones.find(zone => zone.id === visitante.zonaId)?.nombre?.trim().toLocaleUpperCase('es');
    return match.zonaId === local.zonaId && ['C', 'D'].includes(localZone) && ['C', 'D'].includes(visitanteZone) && localZone !== visitanteZone;
};
const groupPairKey = match => [
    match.torneoId,
    match.categoriaId,
    phaseFor(match),
    match.zonaId || '',
    ...[String(match.equipoLocalId), String(match.equipoVisitanteId)].sort()
].join(':');
const assertUniqueGroupPairs = matches => {
    const seen = new Set();
    matches.filter(match => isTablePhaseMatch(match) && match.equipoLocalId && match.equipoVisitanteId).forEach(match => {
        const key = groupPairKey(match);
        if (seen.has(key) && !match.revancha) {
            const previous = matches.find(item => isTablePhaseMatch(item) && groupPairKey(item) === key);
            if (!previous?.revancha) throw new Error('No se puede repetir un enfrentamiento dentro de la misma zona salvo cuando sea necesario para cumplir los partidos garantizados.');
        }
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
        if (match.revancha) {
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
        tipo: match.tipo === 'cruce_especial' ? match.tipo : (TYPE_BY_PHASE[phase] || match.tipo || 'fase_zonas'),
        estado: match.estado || 'pendiente',
        confirmado: match.confirmado ?? match.estado !== 'borrador',
        sets: match.sets || [],
        ganadorId: match.ganadorId || null
    };
};
// La única fuente del resultado son los puntos reales de cada set.
// Delega en ResultsEngine para mantener una única regla en escritorio y web.
const applyInternalResult = (match, rawSets) => applyMatchSets(match, rawSets);

const advanceBracketWinner = (data, source) => {
    const loserId = source.ganadorId === source.equipoLocalId ? source.equipoVisitanteId : source.equipoLocalId;
    const propagate = (target, slot, teamId) => {
        const currentId = slot === 0 ? target.equipoLocalId : (slot === 1 ? target.equipoVisitanteId : null);
        if (target.estado === 'finalizado' && currentId && currentId !== teamId) {
            throw new Error('No se puede cambiar el ganador de este partido porque la instancia siguiente ya fue finalizada.');
        }
        if (slot === 0) target.equipoLocalId = teamId;
        if (slot === 1) target.equipoVisitanteId = teamId;
    };

    data.matches
        .filter(match => Array.isArray(match.sourceMatchIds) && match.sourceMatchIds.includes(source.id))
        .forEach(target => propagate(target, target.sourceMatchIds.indexOf(source.id), source.ganadorId));

    data.matches
        .filter(match => Array.isArray(match.sourceLoserMatchIds) && match.sourceLoserMatchIds.includes(source.id))
        .forEach(target => propagate(target, target.sourceLoserMatchIds.indexOf(source.id), loserId));
};

export const DataManager = {
    _getStorage() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyData();
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            console.error('[DataManager] Error al leer almacenamiento local; se conserva respaldo de seguridad.', error);
            try { localStorage.setItem(`${STORAGE_KEY}_corrupt_backup`, raw); } catch { /* sin cuota */ }
            return emptyData();
        }
        const data = {
            tournaments: Array.isArray(parsed?.tournaments) ? parsed.tournaments : [],
            categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
            teams: Array.isArray(parsed?.teams) ? parsed.teams : [],
            zones: Array.isArray(parsed?.zones) ? parsed.zones : [],
            matches: Array.isArray(parsed?.matches) ? parsed.matches : [],
            calendar: Array.isArray(parsed?.calendar) ? parsed.calendar : []
        };
        // Los torneos creados antes de esta opción conservan el formato
        // histórico basado en sets ganados.
        data.tournaments = data.tournaments.map(tournament => ({
            ...tournament,
            classificationMode: CLASSIFICATION_MODE.POINTS,
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
        data.matches = data.matches.map(match => {
            // Se descarta la puntuación fija de versiones anteriores. La
            // clasificación sólo se deriva de los sets reales guardados.
            const { puntosLocal, puntosVisitante, ...normalizedMatch } = match;
            const hasDetailedSets = Array.isArray(normalizedMatch.sets) && normalizedMatch.sets.length >= 2;
            if (normalizedMatch.estado !== 'finalizado') return normalizeMatch(normalizedMatch);
            if (hasDetailedSets) {
                const restored = normalizeMatch(normalizedMatch);
                try {
                    applyInternalResult(restored, restored.sets);
                    return restored;
                } catch (error) {
                    console.warn(`[DataManager] Partido ${restored.id} con sets inválidos restaurado como pendiente.`, error?.message);
                }
            }
            return normalizeMatch({ ...normalizedMatch, estado: 'pendiente', confirmado: true, sets: [], setsLocal: null, setsVisitante: null, ganadorId: null });
        });
        data.matches = data.matches.map(match => {
            const tournament = data.tournaments.find(item => item.id === match.torneoId);
            const court = tournament?.courts?.find(item => item.id === match.courtId || item.name === match.cancha);
            return { ...match, courtId: court?.id || match.courtId || null, cancha: court?.name || match.cancha || null };
        });
        return data;
    },
    _setStorage(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); },

    getTournaments() { return this._getStorage().tournaments; },
    getTournament(id) { return this.getTournaments().find(tournament => tournament.id === id) || null; },
    getTournamentClassificationMode() { return CLASSIFICATION_MODE.POINTS; },
    createTournament(nombre, partidosAsegurados, options = {}) {
        const cleanName = String(nombre || '').trim();
        const assured = Number(partidosAsegurados);
        if (!cleanName) throw new Error('Ingrese un nombre de torneo válido.');
        if (!Number.isInteger(assured) || assured < 1) throw new Error('Ingrese una cantidad válida de partidos asegurados.');
        const data = this._getStorage();
        const courtCount = Number.isInteger(Number(options.cantidadCanchas)) && Number(options.cantidadCanchas) >= 1
            ? Number(options.cantidadCanchas)
            : 2;
        const tournament = {
            id: makeId('torneo'),
            nombre: cleanName,
            organizacion: String(options.organizacion || '').trim(),
            partidos_asegurados: assured,
            classificationMode: CLASSIFICATION_MODE.POINTS,
            defaultFormatConfig: options.defaultFormatConfig ? structuredClone(options.defaultFormatConfig) : null,
            edition: String(options.edition || 'club').trim(),
            branding: options.branding ? {
                brandName: String(options.branding.brandName || '').trim(),
                accentColor: String(options.branding.accentColor || '').trim()
            } : null,
            courts: defaultCourts(courtCount),
            cantidadCanchas: courtCount,
            blockDuration: Number(options.blockDuration || 30),
            duracionPartido: Number(options.duracionPartido || 30),
            intervaloPartidos: Number(options.intervaloPartidos || 0),
            creado: new Date().toISOString()
        };
        if (options.startDate && options.endDate && validPlanningDate(options.startDate) && validPlanningDate(options.endDate) && options.startDate <= options.endDate) {
            const defaultStart = options.horaInicio && /^\d{2}:\d{2}$/.test(options.horaInicio) ? options.horaInicio : '09:00';
            const defaultEnd = options.horaFin && /^\d{2}:\d{2}$/.test(options.horaFin) ? options.horaFin : '21:00';
            if (validHours(defaultStart, defaultEnd)) {
                tournament.startDate = options.startDate;
                tournament.endDate = options.endDate;
                tournament.horaInicio = defaultStart;
                tournament.horaFin = defaultEnd;
                tournament.horariosPorDia = Object.fromEntries(
                    datesBetween(options.startDate, options.endDate).map(date => [date, { inicio: defaultStart, fin: defaultEnd }])
                );
            }
        }
        data.tournaments.push(tournament);
        this._setStorage(data);
        return tournament;
    },
    updateTournament(torneoId, patch = {}) {
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo seleccionado.');
        if (patch.nombre !== undefined) {
            const cleanName = String(patch.nombre || '').trim();
            if (!cleanName) throw new Error('Ingrese un nombre de torneo válido.');
            tournament.nombre = cleanName;
        }
        if (patch.organizacion !== undefined) tournament.organizacion = String(patch.organizacion || '').trim();
        if (patch.partidos_asegurados !== undefined) {
            const assured = Number(patch.partidos_asegurados);
            if (!Number.isInteger(assured) || assured < 1) throw new Error('Ingrese una cantidad válida de partidos asegurados.');
            tournament.partidos_asegurados = assured;
        }
        if (patch.edition !== undefined) tournament.edition = String(patch.edition || 'club').trim();
        if (patch.branding !== undefined) {
            tournament.branding = patch.branding ? {
                brandName: String(patch.branding.brandName || '').trim(),
                accentColor: String(patch.branding.accentColor || '').trim()
            } : null;
        }
        if (patch.defaultFormatConfig !== undefined) {
            tournament.defaultFormatConfig = patch.defaultFormatConfig ? structuredClone(patch.defaultFormatConfig) : null;
        }
        tournament.updatedAt = new Date().toISOString();
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
    getCategoryFormatConfig(torneoId, categoriaId) {
        const data = this._getStorage();
        const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        const tournament = data.tournaments.find(item => item.id === torneoId);
        return category?.formatConfig || tournament?.defaultFormatConfig || null;
    },
    setCategoryFormatConfig(torneoId, categoriaId, formatConfig) {
        const data = this._getStorage();
        const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category) throw new Error('La categoría no pertenece al torneo seleccionado.');
        category.formatConfig = formatConfig ? structuredClone(formatConfig) : null;
        if (formatConfig?.standingsMode) category.standingsMode = formatConfig.standingsMode;
        this._setStorage(data);
        return category.formatConfig;
    },
    setTournamentDefaultFormat(torneoId, formatConfig) {
        const data = this._getStorage();
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        tournament.defaultFormatConfig = formatConfig ? structuredClone(formatConfig) : null;
        this._setStorage(data);
        return tournament.defaultFormatConfig;
    },
    getCategoryPlanning(torneoId, categoriaId) {
        const category = this._getStorage().categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category?.planning || !Array.isArray(category.planning.days)) return null;
        return {
            ...category.planning,
            days: category.planning.days.map(day => ({
                date: day.date,
                stages: [...new Set((day.stages || []).map(normalizePlanningStage))]
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
            if (!date || !validPlanningDate(date)) throw new Error('La fecha de la planificación no es válida.');
            if (!calendarDates.has(date) && previousByDate.get(date) !== JSON.stringify(day.stages || [])) throw new Error('Esta fecha no está habilitada en el calendario del torneo.');
            if (seenDates.has(date)) throw new Error('Una jornada no puede aparecer dos veces en la planificación.');
            seenDates.add(date);
            const stages = [...new Set((day?.stages || []).map(normalizePlanningStage).filter(Boolean))];
            const invalidStage = stages.find(stage => !isValidPlanningStage(stage));
            if (invalidStage) {
                const categoryName = category.nombre || categoriaId;
                throw new Error(`La planificación contiene una etapa no reconocida: "${invalidStage}" (Categoría: ${categoryName}, Fecha: ${date}).`);
            }
            return { date, stages };
        }).sort((left, right) => left.date.localeCompare(right.date));
        category.planning = { days: normalizedDays, updatedAt: new Date().toISOString() };
        this._setStorage(data);
        return category.planning;
    },
    getPlanningDatesForStage(torneoId, categoriaId, phase) {
        const planning = this.getCategoryPlanning(torneoId, categoriaId);
        if (!planning) return [];
        const accepted = new Set(acceptedPlanningStagesForPhase(phase));
        return planning.days.filter(day => day.stages.some(stage => accepted.has(stage))).map(day => day.date);
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
    removeCategory(torneoId, categoriaId, { force = false } = {}) {
        const data = this._getStorage();
        const category = data.categories.find(item => item.id === categoriaId && item.torneoId === torneoId);
        if (!category) throw new Error('No se encontró la categoría seleccionada.');
        const hasFinished = data.matches.some(match => match.categoriaId === categoriaId && match.estado === 'finalizado');
        if (hasFinished && !force) throw new Error('No se puede eliminar una categoría que ya tiene partidos finalizados.');
        data.categories = data.categories.filter(item => item.id !== categoriaId);
        data.teams = data.teams.filter(team => team.categoriaId !== categoriaId);
        data.zones = data.zones.filter(zone => zone.categoriaId !== categoriaId);
        data.matches = data.matches.filter(match => match.categoriaId !== categoriaId);
        this._setStorage(data);
        return category;
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
    updateTeam(equipoId, { nombre } = {}) {
        const data = this._getStorage();
        const team = data.teams.find(item => item.id === equipoId);
        if (!team) throw new Error('No se encontró el equipo seleccionado.');
        const name = String(nombre || '').trim();
        if (!name) throw new Error('Ingrese un nombre de equipo válido.');
        if (data.teams.some(item => item.id !== equipoId && item.torneoId === team.torneoId && item.categoriaId === team.categoriaId && item.nombre.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
            throw new Error('Ya existe otro equipo con ese nombre en esta categoría.');
        }
        team.nombre = name;
        this._setStorage(data);
        return team;
    },
    removeTeam(equipoId) {
        const data = this._getStorage();
        const team = data.teams.find(item => item.id === equipoId);
        if (!team) throw new Error('No se encontró el equipo seleccionado.');
        const hasFinished = data.matches.some(match => match.estado === 'finalizado' && (match.equipoLocalId === equipoId || match.equipoVisitanteId === equipoId));
        if (hasFinished) throw new Error('No se puede eliminar un equipo que ya disputó partidos finalizados.');
        data.teams = data.teams.filter(item => item.id !== equipoId);
        data.zones.forEach(zone => { if (zone.liderEquipoId === equipoId) zone.liderEquipoId = null; });
        data.matches = data.matches.filter(match => match.equipoLocalId !== equipoId && match.equipoVisitanteId !== equipoId);
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
    unassignTeamFromZone(equipoId) {
        const data = this._getStorage();
        const team = data.teams.find(item => item.id === equipoId);
        if (!team) throw new Error('No se encontró el equipo seleccionado.');
        const leaderZone = data.zones.find(item => item.liderEquipoId === team.id);
        if (leaderZone) throw new Error('Liberá primero la cabeza de serie antes de quitar al equipo de su zona.');
        const hasMatches = data.matches.some(match => isZonePhaseMatch(match) && (match.equipoLocalId === equipoId || match.equipoVisitanteId === equipoId));
        if (hasMatches) throw new Error('No se puede quitar de la zona a un equipo que ya tiene partidos generados en ella.');
        team.zonaId = null;
        this._setStorage(data);
        return team;
    },

    getZonesByTournamentAndCategory(torneoId, categoriaId) { return this._getStorage().zones.filter(zone => zone.torneoId === torneoId && zone.categoriaId === categoriaId); },
    getZonesByCategory(categoriaId) { return this._getStorage().zones.filter(zone => zone.categoriaId === categoriaId); },
    createZone(nombre, categoriaId, torneoId) {
        const cleanName = String(nombre || '').trim();
        if (!cleanName) throw new Error('Ingrese un nombre de zona válido.');
        const data = this._getStorage();
        if (data.zones.some(zone => zone.torneoId === torneoId && zone.categoriaId === categoriaId && zone.nombre.trim().toLocaleLowerCase('es') === cleanName.toLocaleLowerCase('es'))) {
            throw new Error('Ya existe una zona con ese nombre en esta categoría.');
        }
        const zone = { id: makeId('zona'), nombre: cleanName, categoriaId, torneoId, liderEquipoId: null };
        data.zones.push(zone);
        this._setStorage(data);
        return zone;
    },
    updateZone(zonaId, { nombre } = {}) {
        const cleanName = String(nombre || '').trim();
        if (!cleanName) throw new Error('Ingrese un nombre de zona válido.');
        const data = this._getStorage();
        const zone = data.zones.find(item => item.id === zonaId);
        if (!zone) throw new Error('No se encontró la zona seleccionada.');
        if (data.zones.some(item => item.id !== zonaId && item.torneoId === zone.torneoId && item.categoriaId === zone.categoriaId && item.nombre.trim().toLocaleLowerCase('es') === cleanName.toLocaleLowerCase('es'))) {
            throw new Error('Ya existe otra zona con ese nombre en esta categoría.');
        }
        zone.nombre = cleanName;
        this._setStorage(data);
        return zone;
    },
    clearZoneLeader(zonaId) {
        const data = this._getStorage();
        const zone = data.zones.find(item => item.id === zonaId);
        if (!zone) throw new Error('No se encontró la zona seleccionada.');
        zone.liderEquipoId = null;
        this._setStorage(data);
        return zone;
    },
    removeZone(zonaId) {
        const data = this._getStorage();
        const zone = data.zones.find(item => item.id === zonaId);
        if (!zone) throw new Error('No se encontró la zona seleccionada.');
        const hasFinished = data.matches.some(match => match.zonaId === zonaId && match.estado === 'finalizado');
        if (hasFinished) throw new Error('No se puede eliminar una zona que tiene partidos finalizados.');
        data.zones = data.zones.filter(item => item.id !== zonaId);
        data.teams.forEach(team => { if (team.zonaId === zonaId) team.zonaId = null; });
        data.matches = data.matches.filter(match => match.zonaId !== zonaId);
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
        this._validateScheduleConflicts(data.matches, data);
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
        this._validateScheduleConflicts(updated, data);
        data.matches = updated;
        this._setStorage(data);
    },
    restoreMatches(snapshot) {
        const data = this._getStorage();
        const byId = new Map((snapshot || []).map(match => [match.id, match]));
        data.matches = data.matches.map(match => byId.get(match.id) || match);
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
        const bracketPhase = ['TOP_32', 'TOP_16', 'TOP_8', 'TOP_4', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'].includes(phaseFor(match));
        if ((!match.equipoLocalId || !match.equipoVisitanteId) && !bracketPhase) throw new Error('El partido debe tener dos equipos asignados.');
        if (match.orden !== undefined && match.orden !== null && (!Number.isInteger(Number(match.orden)) || Number(match.orden) < 1)) throw new Error('El orden del partido debe ser un número entero mayor que cero.');
        if (match.hora && (!/^\d{2}:\d{2}$/.test(match.hora) || minutesFromTime(match.hora) >= 1440)) throw new Error('El horario del partido no es válido.');
        if (match.fecha && match.hora) {
            const day = this.getDaySchedules(match.torneoId).find(item => item.fecha === match.fecha);
            const settings = this.getTournamentSchedulingSettings(match.torneoId);
            const block = settings.blockDuration;
            const slotInterval = settings.slotInterval;
            const start = minutesFromTime(match.hora);
            if (!day || start < minutesFromTime(day.inicio) || start + block > minutesFromTime(day.fin) || (start - minutesFromTime(day.inicio)) % slotInterval !== 0) {
                throw new Error('El horario debe coincidir con un bloque válido dentro de la jornada.');
            }
        }
        if (match.cancha) {
            const courts = this.getTournamentCourts(match.torneoId);
            const court = courts.find(item => item.id === match.courtId || item.name === match.cancha);
            if (!court) throw new Error('La cancha seleccionada no existe en este torneo.');
            match.courtId = court.id;
            match.cancha = court.name;
        }
        const local = match.equipoLocalId ? data.teams.find(team => team.id === match.equipoLocalId) : null;
        const visitante = match.equipoVisitanteId ? data.teams.find(team => team.id === match.equipoVisitanteId) : null;
        if ((match.equipoLocalId && !local) || (match.equipoVisitanteId && !visitante) || (local && (local.torneoId !== match.torneoId || local.categoriaId !== match.categoriaId)) || (visitante && (visitante.torneoId !== match.torneoId || visitante.categoriaId !== match.categoriaId))) throw new Error('Los equipos deben pertenecer a la categoría del partido.');
        if (phaseFor(match) === 'ZONAS' && (!local || !visitante || local.zonaId !== visitante.zonaId || !local.zonaId || match.zonaId !== local.zonaId)
            && !isAllowedSpecialCross(match, category, local, visitante, data.zones.filter(zone => zone.categoriaId === match.categoriaId))) throw new Error('No se pueden enfrentar equipos de zonas diferentes durante esta fase.');
        if (match.fecha && category.planning?.days) {
            const day = category.planning.days.find(item => item.date === match.fecha);
            const accepted = acceptedPlanningStagesForPhase(phaseFor(match));
            if (!day?.stages?.some(stage => accepted.includes(stage))) throw new Error('La etapa de este partido no está permitida en la jornada elegida para su categoría.');
        }
    },
    _validateScheduleConflicts(matches, storageData = null) {
        const data = storageData || this._getStorage();
        const tournamentsById = new Map(data.tournaments.map(item => [item.id, item]));
        const categoriesById = new Map(data.categories.map(item => [item.id, item]));
        const teamsById = new Map(data.teams.map(item => [item.id, item]));
        const settingsFor = torneoId => {
            const tournament = tournamentsById.get(torneoId);
            const duration = Number(tournament?.duracionPartido || 60);
            const interval = Number(tournament?.intervaloPartidos || 0);
            const block = Number(tournament?.blockDuration || duration);
            return { blockDuration: block, slotInterval: resolveSlotInterval(block, interval) };
        };
        const restBlocksFor = categoriaId => Math.max(0, Number(categoriesById.get(categoriaId)?.minimumRestBlocks || 0));
        const teamIdsOf = match => [match.equipoLocalId, match.equipoVisitanteId].filter(Boolean);

        const scheduledMatches = matches.filter(match => match.fecha && match.hora);
        scheduledMatches.forEach((match, index, scheduled) => {
            const matchTeams = teamIdsOf(match);
            const matchSettings = settingsFor(match.torneoId);
            const matchStart = minutesFromTime(match.hora);
            const matchEnd = matchStart + matchSettings.blockDuration;
            scheduled.slice(index + 1).forEach(other => {
                if (match.torneoId !== other.torneoId || match.fecha !== other.fecha) return;
                const otherTeams = teamIdsOf(other);
                const sameCourt = Boolean(match.cancha && other.cancha && (match.courtId && other.courtId ? match.courtId === other.courtId : match.cancha === other.cancha));
                const sharedTeamId = matchTeams.find(id => otherTeams.includes(id));

                if (match.hora === other.hora) {
                    if (sameCourt) throw new Error(`${match.cancha} ya está ocupada a las ${match.hora} (conflicto de cancha y horario).`);
                    if (sharedTeamId) {
                        const name = teamsById.get(sharedTeamId)?.nombre || 'El equipo';
                        throw new Error(`${name} ya tiene un partido programado a las ${match.hora}.`);
                    }
                    return;
                }
                const otherStart = minutesFromTime(other.hora);
                const otherEnd = otherStart + matchSettings.blockDuration;
                if (matchStart >= otherEnd || otherStart >= matchEnd) return;
                if (sameCourt) throw new Error(`${match.cancha} ya está ocupada durante ese bloque (conflicto de cancha y horario).`);
                if (sharedTeamId) throw new Error('Un equipo no puede tener partidos con horarios superpuestos.');
            });
        });

        const byTeam = new Map();
        scheduledMatches.forEach(match => teamIdsOf(match).forEach(teamId => {
            const list = byTeam.get(teamId) || [];
            list.push(match);
            byTeam.set(teamId, list);
        }));
        byTeam.forEach((teamMatches, teamId) => {
            teamMatches.sort((left, right) => `${left.fecha}T${left.hora}`.localeCompare(`${right.fecha}T${right.hora}`));
            teamMatches.forEach((match, index) => {
                const other = teamMatches[index + 1];
                if (!other || match.torneoId !== other.torneoId || match.fecha !== other.fecha) return;
                const restBlocks = Math.max(restBlocksFor(match.categoriaId), restBlocksFor(other.categoriaId));
                if (restBlocks <= 0) return;
                const { slotInterval } = settingsFor(match.torneoId);
                if (minutesFromTime(other.hora) - minutesFromTime(match.hora) < slotInterval * (restBlocks + 1)) {
                    const teamName = teamsById.get(teamId)?.nombre || 'El equipo';
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
        return this.getTournamentCourts(torneoId).length;
    },
    getTournamentCourts(torneoId) {
        const tournament = this.getTournament(torneoId);
        const configuredCount = Number(tournament?.cantidadCanchas || 0);
        if (Number.isInteger(configuredCount) && configuredCount > 0) {
            const configured = Array.isArray(tournament?.courts) ? tournament.courts.map(normalizeCourt) : [];
            return Array.from({ length: configuredCount }, (_, index) => configured[index] || normalizeCourt(null, index));
        }
        if (Array.isArray(tournament?.courts) && tournament.courts.length) return tournament.courts.map(normalizeCourt);
        return [];
    },
    getTournamentSchedulingSettings(torneoId) {
        const tournament = this.getTournament(torneoId);
        const duration = Number(tournament?.duracionPartido || 60);
        const interval = Number(tournament?.intervaloPartidos || 0);
        const block = Number(tournament?.blockDuration || duration);
        return { duracionPartido: duration, intervaloPartidos: interval, blockDuration: block, slotInterval: resolveSlotInterval(block, interval) };
    },
    setTournamentSchedulingSettings(torneoId, duracionPartido, intervaloPartidos, blockDuration = null) {
        const duration = Number(duracionPartido); const interval = Number(intervaloPartidos);
        if (!Number.isInteger(duration) || duration < 1 || duration > 240 || !Number.isInteger(interval) || interval < 0 || interval > 120) throw new Error('La duración y el intervalo deben ser valores válidos en minutos.');
        const block = blockDuration === null ? duration : Number(blockDuration);
        if (!Number.isInteger(block) || block < 5 || block > 240) throw new Error('La duración del bloque debe ser un valor entre 5 y 240 minutos.');
        const data = this._getStorage(); const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo.');
        tournament.duracionPartido = duration; tournament.intervaloPartidos = interval; tournament.blockDuration = block; this._setStorage(data);
    },
    setTournamentCourtCount(torneoId, cantidadCanchas) {
        const count = Number(cantidadCanchas);
        if (!Number.isInteger(count) || count < 1) throw new Error('Ingrese una cantidad entera positiva de canchas disponibles.');
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
        if (!normalized.length) throw new Error('El torneo debe tener al menos una cancha.');
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
        const defaultStart = tournament?.horaInicio || null;
        const defaultEnd = tournament?.horaFin || null;
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
    },

    exportBackupSnapshot(torneoId = null) {
        const data = this._getStorage();
        const exportedAt = new Date().toISOString();
        if (!torneoId) {
            return {
                schema: 'n3com-backup',
                version: '2.0',
                scope: 'full',
                exportedAt,
                data
            };
        }
        const tournament = data.tournaments.find(item => item.id === torneoId);
        if (!tournament) throw new Error('No se encontró el torneo para exportar.');
        const categoryIds = new Set(data.categories.filter(category => category.torneoId === torneoId).map(category => category.id));
        const belongs = item => item.torneoId === torneoId || categoryIds.has(item.categoriaId);
        return {
            schema: 'n3com-backup',
            version: '2.0',
            scope: 'tournament',
            tournamentId: torneoId,
            exportedAt,
            data: {
                tournaments: [tournament],
                categories: data.categories.filter(category => category.torneoId === torneoId),
                teams: data.teams.filter(belongs),
                zones: data.zones.filter(belongs),
                matches: data.matches.filter(belongs),
                calendar: data.calendar.filter(entry => entry.torneoId === torneoId)
            }
        };
    },

    importBackupSnapshot(rawSnapshot, { mode = 'merge' } = {}) {
        const snapshot = typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : rawSnapshot;
        const incoming = snapshot?.data && Array.isArray(snapshot.data.tournaments) ? snapshot.data : snapshot;
        if (!incoming || !Array.isArray(incoming.tournaments) || !Array.isArray(incoming.categories) || !Array.isArray(incoming.teams) || !Array.isArray(incoming.zones) || !Array.isArray(incoming.matches)) {
            throw new Error('El archivo de copia de seguridad no tiene una estructura N3com válida.');
        }
        const cleanIncoming = {
            tournaments: incoming.tournaments,
            categories: incoming.categories,
            teams: incoming.teams,
            zones: incoming.zones,
            matches: incoming.matches,
            calendar: Array.isArray(incoming.calendar) ? incoming.calendar : []
        };

        if (mode === 'replace') {
            this._setStorage(cleanIncoming);
            return { importedTournaments: cleanIncoming.tournaments.length, mode: 'replace' };
        }

        const current = this._getStorage();
        const mergeById = (existingList, incomingList) => {
            const existingIds = new Set(existingList.map(item => item.id));
            return [...existingList, ...incomingList.filter(item => item?.id && !existingIds.has(item.id))];
        };
        const existingTournamentIds = new Set(current.tournaments.map(item => item.id));
        const newTournaments = cleanIncoming.tournaments.filter(item => item?.id && !existingTournamentIds.has(item.id));
        const newTournamentIds = new Set(newTournaments.map(item => item.id));

        const merged = {
            tournaments: [...current.tournaments, ...newTournaments],
            categories: mergeById(current.categories, cleanIncoming.categories.filter(item => newTournamentIds.has(item.torneoId))),
            teams: mergeById(current.teams, cleanIncoming.teams.filter(item => newTournamentIds.has(item.torneoId))),
            zones: mergeById(current.zones, cleanIncoming.zones.filter(item => newTournamentIds.has(item.torneoId))),
            matches: mergeById(current.matches, cleanIncoming.matches.filter(item => newTournamentIds.has(item.torneoId))),
            calendar: [...current.calendar, ...cleanIncoming.calendar.filter(entry => newTournamentIds.has(entry.torneoId))]
        };
        this._setStorage(merged);
        return {
            importedTournaments: newTournaments.length,
            skippedTournaments: cleanIncoming.tournaments.length - newTournaments.length,
            mode: 'merge'
        };
    }
};
