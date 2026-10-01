import { DataManager } from '../data/dataManager.js';

const logisticsMinutesFromTime = time => {
    const [hour, minute] = String(time).split(':').map(Number);
    return hour * 60 + minute;
};
const timeFromMinutes = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const logisticsPhaseFor = match => match.phase || 'ZONAS';
const logisticsIsOfficial = match => match.confirmado || ['pendiente', 'programado', 'confirmado', 'en_juego', 'finalizado'].includes(match.estado);
const logisticsTeamsOverlap = (left, right) => [left.equipoLocalId, left.equipoVisitanteId].filter(Boolean)
    .some(id => [right.equipoLocalId, right.equipoVisitanteId].filter(Boolean).includes(id));
const logisticsCourtKey = match => match.courtId || match.cancha;
const phaseOrder = { ZONAS: 1, TOP_16: 2, TOP_8: 3, SEMIFINAL: 4, FINAL: 5 };
const logisticsIssue = (match, type, message) => ({ matchId: match.id, type, message });

const logisticsAllowedDates = (tournamentId, match) => {
    const calendar = DataManager.getCalendarDates(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, match.categoriaId);
    if (!planning) {
        const phase = logisticsPhaseFor(match);
        if (calendar.length > 1 && ['SEMIFINAL', 'FINAL'].includes(phase)) return [calendar.at(-1), ...calendar.slice(0, -1)];
        return calendar;
    }
    const phase = logisticsPhaseFor(match);
    const planned = DataManager.getPlanningDatesForStage(tournamentId, match.categoriaId, phase);
    return calendar.filter(date => planned.includes(date));
};

// Devuelve qué regla impide ocupar ese bloque. Se usa tanto para aceptar una
// asignación como para explicarle al organizador por qué no se pudo programar.
const logisticsSlotIssues = (candidate, scheduled, settings) => {
    const issues = { court: false, team: false, rest: false };
    const start = logisticsMinutesFromTime(candidate.hora);
    const end = start + settings.blockDuration;
    for (const other of scheduled) {
        if (candidate.fecha !== other.fecha || !other.hora) continue;
        const otherStart = logisticsMinutesFromTime(other.hora);
        const otherEnd = otherStart + settings.blockDuration;
        const overlaps = start < otherEnd && otherStart < end;
        if (overlaps && logisticsCourtKey(candidate) === logisticsCourtKey(other)) { issues.court = true; continue; }
        if (overlaps && logisticsTeamsOverlap(candidate, other)) { issues.team = true; continue; }
        if (!logisticsTeamsOverlap(candidate, other)) continue;
        const rest = Math.max(DataManager.getCategoryRestBlocks(candidate.categoriaId), DataManager.getCategoryRestBlocks(other.categoriaId));
        const slotInterval = settings.intervaloPartidos || settings.blockDuration;
        if (Math.abs(start - otherStart) < slotInterval * (rest + 1)) issues.rest = true;
    }
    return issues;
};

const logisticsSlotIsValid = (candidate, scheduled, settings) => !Object.values(logisticsSlotIssues(candidate, scheduled, settings)).some(Boolean);

const distributionDifference = loads => {
    const values = [...loads.values()];
    return values.length ? Math.max(...values) - Math.min(...values) : 0;
};

// Puntaje determinista de una agenda. El orden de los términos es deliberado:
// una cancha equilibrada nunca puede compensar un conflicto deportivo.
const scheduleScore = (matches, courts) => {
    const loads = new Map(courts.map(court => [court.id, 0]));
    const byDay = new Map();
    matches.forEach(match => {
        const court = courts.find(item => item.id === match.courtId || item.name === match.cancha);
        if (court) loads.set(court.id, loads.get(court.id) + 1);
        const key = `${match.fecha}|${match.hora}`;
        const slot = byDay.get(key) || new Set();
        if (court) slot.add(court.id);
        byDay.set(key, slot);
    });
    const imbalance = distributionDifference(loads);
    const slotSpread = [...byDay.values()].reduce((total, used) => total + Math.abs(courts.length - used.size), 0);
    return { conflicts: 0, imbalance, slotSpread, byCourt: Object.fromEntries(loads) };
};

export const fixtureCompare = (left, right) => String(left.fecha || '9999-99-99').localeCompare(String(right.fecha || '9999-99-99'))
    || String(left.hora || '99:99').localeCompare(String(right.hora || '99:99'))
    || String(left.cancha || '').localeCompare(String(right.cancha || ''), 'es', { numeric: true })
    || Number(left.orden || Number.MAX_SAFE_INTEGER) - Number(right.orden || Number.MAX_SAFE_INTEGER);

export const LogisticsService = {
    getTournamentMatches(tournamentId) {
        return DataManager.getCategoriesByTournament(tournamentId)
            .flatMap(category => DataManager.getMatchesByTournamentAndCategory(tournamentId, category.id));
    },

    // Etiqueta visible de un partido para mensajes de logística y conflictos.
    getMatchLabel(tournamentId, match) {
        const category = DataManager.getCategory(match.categoriaId);
        const teams = DataManager.getTeamsByTournamentAndCategory(tournamentId, match.categoriaId);
        const teamName = id => teams.find(team => team.id === id)?.nombre || 'Equipo sin nombre';
        return `${category?.nombre || 'Sin categoría'}: ${teamName(match.equipoLocalId)} vs ${teamName(match.equipoVisitanteId)}`;
    },

    generateTimeBlocks(tournamentId, day) {
        const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
        if (!day?.fecha || !/^\d{2}:\d{2}$/.test(day.inicio || '') || !/^\d{2}:\d{2}$/.test(day.fin || '')) return [];
        const start = logisticsMinutesFromTime(day.inicio);
        const end = logisticsMinutesFromTime(day.fin);
        const blocks = [];
        const slotInterval = settings.slotInterval || settings.blockDuration;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end || slotInterval < 1 || settings.blockDuration < 1) return blocks;
        for (let minute = start; minute + settings.blockDuration <= end; minute += slotInterval) {
            blocks.push(timeFromMinutes(minute));
        }
        return blocks;
    },

    // Única fuente de slots: calendario por fecha + configuración logística
    // global del torneo. Nunca se generan horas fuera de este conjunto.
    generateTimeSlots(tournamentId) {
        return DataManager.getDaySchedules(tournamentId).flatMap(day => this.generateTimeBlocks(tournamentId, day).map(hora => ({ fecha: day.fecha, hora })));
    },

    getGeneralFixture(tournamentId, { includeDrafts = false } = {}) {
        return this.getTournamentMatches(tournamentId)
            .filter(match => includeDrafts || logisticsIsOfficial(match))
            .sort(fixtureCompare);
    },

    // Explica qué regla bloqueó cada partido que no pudo colocarse. El
    // organizador necesita saber si fue cancha, equipo, descanso o jornada.
    explainFailure(tournamentId, match, dates, days, courts, scheduled, settings) {
        if (!dates.length) return ['jornada no habilitada o etapa no planificada'];
        const counts = { court: 0, team: 0, rest: 0 };
        let candidates = 0;
        for (const date of dates) {
            const day = days.find(item => item.fecha === date);
            if (!day) continue;
            for (const hora of this.generateTimeBlocks(tournamentId, day)) {
                for (const court of courts) {
                    candidates += 1;
                    const issues = logisticsSlotIssues({ ...match, fecha: date, hora, courtId: court.id, cancha: court.name }, scheduled, settings);
                    if (issues.court) counts.court += 1;
                    if (issues.team) counts.team += 1;
                    if (issues.rest) counts.rest += 1;
                }
            }
        }
        if (!candidates) return ['la jornada no tiene bloques horarios disponibles'];
        const labels = {
            court: 'todas las canchas ocupadas en ese bloque',
            team: 'los equipos ya tienen un partido en ese horario',
            rest: 'descanso insuficiente entre partidos del mismo equipo'
        };
        const totalBlock = Object.keys(counts).filter(key => counts[key] === candidates);
        const reasons = totalBlock.length ? totalBlock : Object.keys(counts).filter(key => counts[key] > 0);
        return reasons.length ? reasons.map(key => labels[key]) : ['no se encontró una combinación válida de cancha y horario'];
    },

    programTournament(tournamentId) {
        const courts = DataManager.getTournamentCourts(tournamentId);
        const days = DataManager.getDaySchedules(tournamentId);
        if (!days.length) throw new Error('Configurá al menos una jornada en Calendario antes de programar.');
        if (!courts.length) throw new Error('Configurá al menos una cancha para el torneo.');
        const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
        const all = this.getTournamentMatches(tournamentId).filter(logisticsIsOfficial);
        const occupied = all.filter(match => match.fecha && match.hora && match.cancha);
        const courtLoads = new Map(courts.map(court => [court.id, occupied.filter(match => logisticsCourtKey(match) === court.id || match.cancha === court.name).length]));
        const pending = all.filter(match => match.estado !== 'finalizado' && (!match.fecha || !match.hora || !match.cancha))
            .sort((left, right) => (phaseOrder[logisticsPhaseFor(left)] || 99) - (phaseOrder[logisticsPhaseFor(right)] || 99)
                || Number(left.ronda || left.orden || 0) - Number(right.ronda || right.orden || 0)
                || String(left.id).localeCompare(String(right.id)));
        const updates = [];
        const failures = [];

        for (const match of pending) {
            const dates = logisticsAllowedDates(tournamentId, match);
            const preferred = match.fecha && dates.includes(match.fecha) ? [match.fecha, ...dates.filter(date => date !== match.fecha)] : dates;
            let assignment = null;
            const candidates = [];
            for (const date of preferred) {
                const day = days.find(item => item.fecha === date);
                if (!day) continue;
                for (const hora of this.generateTimeBlocks(tournamentId, day)) {
                    for (const court of [...courts].sort((left, right) => courtLoads.get(left.id) - courtLoads.get(right.id) || left.name.localeCompare(right.name, 'es', { numeric: true }))) {
                        const candidate = { ...match, fecha: date, hora, courtId: court.id, cancha: court.name };
                        if (!logisticsSlotIsValid(candidate, [...occupied, ...updates], settings)) continue;
                        const slotInterval = settings.intervaloPartidos || settings.blockDuration;
                        const adjacent = [...occupied, ...updates].some(other => other.fecha === date
                            && logisticsTeamsOverlap(candidate, other)
                            && Math.abs(logisticsMinutesFromTime(other.hora) - logisticsMinutesFromTime(hora)) === slotInterval);
                        candidates.push({ assignment: { fecha: date, hora, courtId: court.id, cancha: court.name }, adjacent, load: courtLoads.get(court.id) });
                    }
                }
            }
            candidates.sort((left, right) => Number(left.adjacent) - Number(right.adjacent)
                || left.load - right.load
                || left.assignment.fecha.localeCompare(right.assignment.fecha)
                || left.assignment.hora.localeCompare(right.assignment.hora)
                || left.assignment.cancha.localeCompare(right.assignment.cancha, 'es', { numeric: true }));
            assignment = candidates[0]?.assignment || null;
            if (assignment) {
                updates.push({ ...match, ...assignment, estado: match.estado === 'borrador' ? 'pendiente' : match.estado, confirmado: true });
                courtLoads.set(assignment.courtId, courtLoads.get(assignment.courtId) + 1);
            }
            else failures.push({
                matchId: match.id,
                label: this.getMatchLabel(tournamentId, match),
                reasons: this.explainFailure(tournamentId, match, dates, days, courts, [...occupied, ...updates], settings)
            });
        }
        if (updates.length) DataManager.updateMatches(updates);
        return { scheduled: updates.length, failures };
    },

    // Reasigna únicamente la propiedad cancha. Fecha, hora, equipos, fases,
    // resultados y partidos finalizados permanecen intactos.
    reorganizeCourts(tournamentId) {
        const courts = DataManager.getTournamentCourts(tournamentId);
        if (!courts.length) throw new Error('Configurá al menos una cancha para el torneo.');
        const fixture = this.getGeneralFixture(tournamentId).filter(match => match.fecha && match.hora);
        const movable = fixture.filter(match => match.estado !== 'finalizado');
        const fixed = fixture.filter(match => match.estado === 'finalizado');
        const loads = new Map(courts.map(court => [court.id, fixed.filter(match => logisticsCourtKey(match) === court.id || match.cancha === court.name).length]));
        const usedBySlot = new Map();
        const updates = [];
        movable.sort(fixtureCompare).forEach(match => {
            const key = `${match.fecha}|${match.hora}`;
            const used = usedBySlot.get(key) || new Set();
            const court = [...courts]
                .filter(item => !used.has(item.id))
                .sort((left, right) => loads.get(left.id) - loads.get(right.id)
                    || (used.size ? Number(left.id === courts[(used.size) % courts.length]?.id) - Number(right.id === courts[(used.size) % courts.length]?.id) : 0)
                    || left.name.localeCompare(right.name, 'es', { numeric: true }))[0];
            if (!court) return;
            used.add(court.id); usedBySlot.set(key, used);
            loads.set(court.id, loads.get(court.id) + 1);
            if (match.courtId !== court.id || match.cancha !== court.name) updates.push({ ...match, courtId: court.id, cancha: court.name });
        });
        if (updates.length) DataManager.updateMatches(updates);
        const validation = this.validateSchedule(tournamentId);
        return { updated: updates.length, validation, score: scheduleScore(this.getGeneralFixture(tournamentId), courts) };
    },

    // Regenera horas y canchas desde la fuente de partidos, sin reconstruir
    // enfrentamientos ni tocar resultados. Los partidos finalizados conservan
    // su asignación; los demás vuelven a ocupar los slots válidos.
    reorganizeFixture(tournamentId) {
        const data = this.getGeneralFixture(tournamentId, { includeDrafts: true });
        const reset = data.filter(match => logisticsIsOfficial(match) && match.estado !== 'finalizado')
            .map(match => ({ ...match, fecha: null, hora: null, courtId: null, cancha: null }));
        if (reset.length) DataManager.updateMatches(reset);
        const scheduled = this.generateSchedule(tournamentId);
        return { ...scheduled, score: scheduleScore(this.getGeneralFixture(tournamentId), DataManager.getTournamentCourts(tournamentId)) };
    },

    scoreSchedule(tournamentId) {
        const courts = DataManager.getTournamentCourts(tournamentId);
        return scheduleScore(this.getGeneralFixture(tournamentId), courts);
    },

    validateSchedule(tournamentId) {
        const courts = DataManager.getTournamentCourts(tournamentId);
        const courtIds = new Set(courts.map(court => court.id));
        const courtNames = new Map(courts.map(court => [court.name, court.id]));
        const days = DataManager.getDaySchedules(tournamentId);
        const slots = new Set(this.generateTimeSlots(tournamentId).map(slot => `${slot.fecha}|${slot.hora}`));
        const matches = this.getTournamentMatches(tournamentId).filter(logisticsIsOfficial);
        const issues = [];
        const scheduled = [];
        matches.forEach(match => {
            const label = this.getMatchLabel(tournamentId, match);
            if (!DataManager.getCategory(match.categoriaId) || DataManager.getCategory(match.categoriaId)?.torneoId !== tournamentId || match.torneoId !== tournamentId) {
                issues.push(logisticsIssue(match, 'category', `${label}: la categoría no pertenece al torneo.`));
            }
            if (!match.phase) issues.push(logisticsIssue(match, 'phase', `${label}: falta la fase deportiva.`));
            if (!match.fecha) { issues.push(logisticsIssue(match, 'no-date', `${label}: falta indicar el día del partido.`)); return; }
            if (!match.hora) { issues.push(logisticsIssue(match, 'no-time', `${label}: falta indicar el horario.`)); return; }
            if (!match.courtId && !match.cancha) { issues.push(logisticsIssue(match, 'no-court', `${label}: falta asignar una cancha.`)); return; }
            const courtId = courtIds.has(match.courtId) ? match.courtId : courtNames.get(match.cancha);
            if (!courtId) { issues.push(logisticsIssue(match, 'invalid-court', `${label}: la cancha no existe en la configuración logística global.`)); return; }
            if (!slots.has(`${match.fecha}|${match.hora}`)) issues.push(logisticsIssue(match, 'invalid-time', `${label}: ${match.fecha} ${match.hora} no es un slot válido del calendario.`));
            if (!logisticsAllowedDates(tournamentId, match).includes(match.fecha)) issues.push(logisticsIssue(match, 'planning', `${label}: la fase no está habilitada para esa fecha.`));
            const local = match.equipoLocalId && DataManager.getTeamsByTournamentAndCategory(tournamentId, match.categoriaId).find(team => team.id === match.equipoLocalId);
            const visitante = match.equipoVisitanteId && DataManager.getTeamsByTournamentAndCategory(tournamentId, match.categoriaId).find(team => team.id === match.equipoVisitanteId);
            if (match.phase === 'ZONAS' && (!local || !visitante || !match.zonaId || local.zonaId !== match.zonaId || visitante.zonaId !== match.zonaId)) issues.push(logisticsIssue(match, 'sports-integrity', `${label}: los equipos no pertenecen a la misma zona.`));
            scheduled.push({ ...match, courtId });
        });
        scheduled.forEach((match, index) => scheduled.slice(index + 1).forEach(other => {
            if (match.fecha !== other.fecha) return;
            const distance = Math.abs(logisticsMinutesFromTime(match.hora) - logisticsMinutesFromTime(other.hora));
            if (distance < DataManager.getTournamentSchedulingSettings(tournamentId).blockDuration && match.courtId === other.courtId) {
                issues.push({ type: 'court', matchId: match.id, otherId: other.id, message: `${match.cancha || match.courtId} ya está ocupada a las ${match.hora}: ${this.getMatchLabel(tournamentId, match)} y ${this.getMatchLabel(tournamentId, other)}.` });
            }
            if (distance < DataManager.getTournamentSchedulingSettings(tournamentId).blockDuration && logisticsTeamsOverlap(match, other)) {
                issues.push({ type: 'team', matchId: match.id, otherId: other.id, message: `Un equipo tiene partidos superpuestos: ${this.getMatchLabel(tournamentId, match)} / ${this.getMatchLabel(tournamentId, other)}.` });
            } else if (logisticsTeamsOverlap(match, other)) {
                const rest = Math.max(DataManager.getCategoryRestBlocks(match.categoriaId), DataManager.getCategoryRestBlocks(other.categoriaId));
                const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
                const slotInterval = settings.intervaloPartidos || settings.blockDuration;
                if (rest > 0 && distance < slotInterval * (rest + 1)) {
                    issues.push({ type: 'rest', matchId: match.id, otherId: other.id, message: `Descanso insuficiente: ${this.getMatchLabel(tournamentId, match)} necesita ${rest} bloque${rest === 1 ? '' : 's'} libre${rest === 1 ? '' : 's'}.` });
                }
            }
        }));
        const loads = new Map(courts.map(court => [court.id, 0]));
        scheduled.forEach(match => loads.set(match.courtId, (loads.get(match.courtId) || 0) + 1));
        const values = [...loads.values()];
        const distribution = { byCourt: Object.fromEntries(courts.map(court => [court.id, loads.get(court.id)])), difference: values.length ? Math.max(...values) - Math.min(...values) : 0 };
        const totalCapacity = days.reduce((sum, day) => sum + this.generateTimeBlocks(tournamentId, day).length, 0) * courts.length;
        if (scheduled.length === matches.length && totalCapacity >= matches.length && distribution.difference > 1) {
            issues.push({ type: 'distribution', message: `La distribución de partidos entre canchas no es equilibrada: ${JSON.stringify(distribution.byCourt)}.` });
        }
        return { valid: issues.length === 0 && scheduled.length === matches.length, issues, distribution, matches: scheduled };
    },

    // Punto único de entrada para generar y validar la agenda completa.
    generateSchedule(tournamentId) {
        const before = this.getTournamentMatches(tournamentId);
        const result = this.programTournament(tournamentId);
        if (result.failures.length) {
            if (result.scheduled) DataManager.updateMatches(before);
            const detail = result.failures.map(item => `${item.label}: ${item.reasons.join(' / ')}`).join('\n');
            throw new Error(`No se pudo completar la programación automática.\n${detail}`);
        }
        const validation = this.validateSchedule(tournamentId);
        if (!validation.valid) {
            if (result.scheduled) DataManager.updateMatches(before);
            throw new Error(`El fixture quedó incompleto o tiene conflictos:\n${validation.issues.map(issue => issue.message).join('\n')}`);
        }
        return { ...result, validation };
    },

    getConflicts(tournamentId) {
        return this.validateSchedule(tournamentId).issues;
    }
};
