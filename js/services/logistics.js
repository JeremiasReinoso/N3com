import { DataManager } from '../data/dataManager.js';

const logisticsMinutesFromTime = time => {
    const [hour, minute] = String(time).split(':').map(Number);
    return hour * 60 + minute;
};
const timeFromMinutes = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const logisticsPhaseFor = match => match.phase || 'ZONAS';
const logisticsIsOfficial = match => match.confirmado || ['pendiente', 'programado', 'confirmado', 'en_juego', 'finalizado'].includes(match.estado);
const logisticsTeamsOverlap = (left, right) => [left.equipoLocalId, left.equipoVisitanteId].some(id => [right.equipoLocalId, right.equipoVisitanteId].includes(id));
const logisticsCourtKey = match => match.courtId || match.cancha;
const phaseOrder = { ZONAS: 1, ALL_VS_ALL: 2, TOP_16: 3, TOP_8: 4, SEMIFINAL: 5, THIRD_PLACE: 6, FINAL: 7 };
// Espacio real que ocupa un partido en una cancha: su bloque más la pausa
// configurada en Calendario ("Intervalo entre partidos").
const logisticsSpan = settings => Number(settings.blockDuration) + Number(settings.intervaloPartidos || 0);

const logisticsAllowedDates = (tournamentId, match) => {
    const calendar = DataManager.getCalendarDates(tournamentId);
    const planning = DataManager.getCategoryPlanning(tournamentId, match.categoriaId);
    if (!planning) {
        const phase = logisticsPhaseFor(match);
        if (calendar.length > 1 && ['SEMIFINAL', 'THIRD_PLACE', 'FINAL'].includes(phase)) return [calendar.at(-1), ...calendar.slice(0, -1)];
        return calendar;
    }
    const phase = logisticsPhaseFor(match) === 'THIRD_PLACE' ? 'FINAL' : logisticsPhaseFor(match);
    const planned = DataManager.getPlanningDatesForStage(tournamentId, match.categoriaId, phase);
    return calendar.filter(date => planned.includes(date));
};

// Devuelve qué regla impide ocupar ese bloque. Se usa tanto para aceptar una
// asignación como para explicarle al organizador por qué no se pudo programar.
const logisticsSlotIssues = (candidate, scheduled, settings) => {
    const issues = { court: false, team: false, rest: false };
    const start = logisticsMinutesFromTime(candidate.hora);
    const span = logisticsSpan(settings);
    const end = start + span;
    for (const other of scheduled) {
        if (candidate.fecha !== other.fecha || !other.hora) continue;
        const otherStart = logisticsMinutesFromTime(other.hora);
        const otherEnd = otherStart + span;
        const overlaps = start < otherEnd && otherStart < end;
        if (overlaps && logisticsCourtKey(candidate) === logisticsCourtKey(other)) { issues.court = true; continue; }
        if (overlaps && logisticsTeamsOverlap(candidate, other)) { issues.team = true; continue; }
        if (!logisticsTeamsOverlap(candidate, other)) continue;
        const rest = Math.max(DataManager.getCategoryRestBlocks(candidate.categoriaId), DataManager.getCategoryRestBlocks(other.categoriaId));
        if (Math.abs(start - otherStart) < settings.blockDuration * (rest + 1)) issues.rest = true;
    }
    return issues;
};

const logisticsSlotIsValid = (candidate, scheduled, settings) => !Object.values(logisticsSlotIssues(candidate, scheduled, settings)).some(Boolean);

export const fixtureCompare = (left, right) => String(left.fecha || '9999-99-99').localeCompare(String(right.fecha || '9999-99-99'))
    || String(left.hora || '99:99').localeCompare(String(right.hora || '99:99'))
    || String(left.cancha || '').localeCompare(String(right.cancha || ''), 'es', { numeric: true })
    || Number(left.orden || Number.MAX_SAFE_INTEGER) - Number(right.orden || Number.MAX_SAFE_INTEGER);

// Alterna las categorías dentro de cada etapa y ronda. Si dos categorías
// juegan el mismo día y comparten las canchas, no se agotan primero los
// partidos de una para recién después empezar con la otra: se mezclan
// (un partido de una, un partido de la otra) hasta agotar ambas.
const interleaveCategories = matches => {
    const groups = new Map();
    matches.forEach(match => {
        const key = `${logisticsPhaseFor(match)}|${match.ronda || ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(match);
    });
    const mixed = [];
    [...groups.values()].forEach(group => {
        const queues = [...Map.groupBy(group, match => match.categoriaId).values()];
        let moved = true;
        while (moved) {
            moved = false;
            queues.forEach(queue => {
                const match = queue.shift();
                if (match) { mixed.push(match); moved = true; }
            });
        }
    });
    return mixed;
};

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
        const step = logisticsSpan(settings);
        const blocks = [];
        for (let minute = logisticsMinutesFromTime(day.inicio); minute + settings.blockDuration <= logisticsMinutesFromTime(day.fin); minute += step) {
            blocks.push(timeFromMinutes(minute));
        }
        return blocks;
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
        const pending = interleaveCategories(all.filter(match => match.estado !== 'finalizado' && (!match.fecha || !match.hora || !match.cancha))
            .sort((left, right) => (phaseOrder[logisticsPhaseFor(left)] || 99) - (phaseOrder[logisticsPhaseFor(right)] || 99)
                || Number(left.ronda || left.orden || 0) - Number(right.ronda || right.orden || 0)
                || String(left.id).localeCompare(String(right.id))));
        const updates = [];
        const failures = [];

        for (const match of pending) {
            const dates = logisticsAllowedDates(tournamentId, match);
            const preferred = match.fecha && dates.includes(match.fecha) ? [match.fecha, ...dates.filter(date => date !== match.fecha)] : dates;
            let assignment = null;
            for (const date of preferred) {
                const day = days.find(item => item.fecha === date);
                if (!day) continue;
                for (const hora of this.generateTimeBlocks(tournamentId, day)) {
                    for (const court of [...courts].sort((left, right) => courtLoads.get(left.id) - courtLoads.get(right.id) || left.name.localeCompare(right.name, 'es', { numeric: true }))) {
                        const candidate = { ...match, fecha: date, hora, courtId: court.id, cancha: court.name };
                        if (logisticsSlotIsValid(candidate, [...occupied, ...updates], settings)) {
                            assignment = { fecha: date, hora, courtId: court.id, cancha: court.name };
                            break;
                        }
                    }
                    if (assignment) break;
                }
                if (assignment) break;
            }
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

    getConflicts(tournamentId) {
        const matches = this.getTournamentMatches(tournamentId).filter(logisticsIsOfficial);
        const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
        const span = logisticsSpan(settings);
        const issues = [];
        matches.forEach(match => {
            const label = this.getMatchLabel(tournamentId, match);
            const base = { matchId: match.id, label };
            if (!match.fecha) issues.push({ ...base, type: 'no-date', message: `${label}: falta indicar el día del partido.` });
            else if (!match.hora) issues.push({ ...base, type: 'no-time', message: `${label}: falta indicar el horario.` });
            else if (!match.cancha) issues.push({ ...base, type: 'no-court', message: `${label}: falta asignar una cancha.` });
            else if (!logisticsAllowedDates(tournamentId, match).includes(match.fecha)) issues.push({ ...base, type: 'planning', message: `${label}: la jornada o etapa no está habilitada para este partido.` });
        });
        const scheduled = matches.filter(match => match.fecha && match.hora && match.cancha);
        scheduled.forEach((match, index) => scheduled.slice(index + 1).forEach(other => {
            if (match.fecha !== other.fecha) return;
            const label = this.getMatchLabel(tournamentId, match);
            const otherLabel = this.getMatchLabel(tournamentId, other);
            const distance = Math.abs(logisticsMinutesFromTime(match.hora) - logisticsMinutesFromTime(other.hora));
            if (distance < span && logisticsCourtKey(match) === logisticsCourtKey(other)) issues.push({ type: 'court', matchId: match.id, otherId: other.id, message: `${match.cancha} ya está ocupada a las ${match.hora}: ${label} y ${otherLabel}.` });
            if (!logisticsTeamsOverlap(match, other)) return;
            if (distance < span) issues.push({ type: 'team', matchId: match.id, otherId: other.id, message: `${label}: el mismo equipo tiene otro partido a las ${other.hora} en ${other.cancha || 'cancha sin asignar'}.` });
            else {
                const rest = Math.max(DataManager.getCategoryRestBlocks(match.categoriaId), DataManager.getCategoryRestBlocks(other.categoriaId));
                if (distance < settings.blockDuration * (rest + 1)) issues.push({ type: 'rest', matchId: match.id, otherId: other.id, message: `Descanso insuficiente: ${label} necesita ${rest} bloque${rest === 1 ? '' : 's'} libre${rest === 1 ? '' : 's'} entre partidos.` });
            }
        }));
        return issues;
    }
};
