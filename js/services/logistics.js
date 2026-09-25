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

const logisticsSlotIsValid = (candidate, scheduled, settings) => {
    const start = logisticsMinutesFromTime(candidate.hora);
    const end = start + settings.blockDuration;
    for (const other of scheduled) {
        if (candidate.fecha !== other.fecha || !other.hora) continue;
        const otherStart = logisticsMinutesFromTime(other.hora);
        const otherEnd = otherStart + settings.blockDuration;
        const overlaps = start < otherEnd && otherStart < end;
        if (overlaps && logisticsCourtKey(candidate) === logisticsCourtKey(other)) return false;
        if (overlaps && logisticsTeamsOverlap(candidate, other)) return false;
        if (!logisticsTeamsOverlap(candidate, other)) continue;
        const rest = Math.max(DataManager.getCategoryRestBlocks(candidate.categoriaId), DataManager.getCategoryRestBlocks(other.categoriaId));
        if (Math.abs(start - otherStart) < settings.blockDuration * (rest + 1)) return false;
    }
    return true;
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

    generateTimeBlocks(tournamentId, day) {
        const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
        const blocks = [];
        for (let minute = logisticsMinutesFromTime(day.inicio); minute + settings.blockDuration <= logisticsMinutesFromTime(day.fin); minute += settings.blockDuration) {
            blocks.push(timeFromMinutes(minute));
        }
        return blocks;
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
            else failures.push({ matchId: match.id, reasons: dates.length ? ['todas las canchas ocupadas', 'equipo ocupado o descanso insuficiente'] : ['jornada no habilitada o etapa no planificada'] });
        }
        if (updates.length) DataManager.updateMatches(updates);
        return { scheduled: updates.length, failures };
    },

    getConflicts(tournamentId) {
        const matches = this.getTournamentMatches(tournamentId).filter(logisticsIsOfficial);
        const settings = DataManager.getTournamentSchedulingSettings(tournamentId);
        const issues = [];
        matches.forEach(match => {
            if (!match.fecha || !match.hora || !match.cancha) issues.push({ type: 'unscheduled', matchId: match.id, message: 'Partido sin día, horario o cancha.' });
            else if (!logisticsAllowedDates(tournamentId, match).includes(match.fecha)) issues.push({ type: 'planning', matchId: match.id, message: 'La jornada o etapa no está habilitada para este partido.' });
        });
        const scheduled = matches.filter(match => match.fecha && match.hora && match.cancha);
        scheduled.forEach((match, index) => scheduled.slice(index + 1).forEach(other => {
            if (match.fecha !== other.fecha) return;
            const distance = Math.abs(logisticsMinutesFromTime(match.hora) - logisticsMinutesFromTime(other.hora));
            if (distance < settings.blockDuration && logisticsCourtKey(match) === logisticsCourtKey(other)) issues.push({ type: 'court', matchId: match.id, otherId: other.id, message: `${match.cancha} tiene partidos superpuestos.` });
            if (!logisticsTeamsOverlap(match, other)) return;
            if (distance < settings.blockDuration) issues.push({ type: 'team', matchId: match.id, otherId: other.id, message: 'Un equipo tiene partidos simultáneos.' });
            else {
                const rest = Math.max(DataManager.getCategoryRestBlocks(match.categoriaId), DataManager.getCategoryRestBlocks(other.categoriaId));
                if (distance < settings.blockDuration * (rest + 1)) issues.push({ type: 'rest', matchId: match.id, otherId: other.id, message: `Descanso insuficiente: se requieren ${rest} bloque${rest === 1 ? '' : 's'} libres.` });
            }
        }));
        return issues;
    }
};
