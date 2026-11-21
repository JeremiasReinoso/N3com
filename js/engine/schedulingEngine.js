// Fachada unificada de programación y logística.
// Reutiliza LogisticsService y SchedulerService existentes como fuente única de verdad
// para asignación de fechas, bloques horarios, canchas compartidas, descansos y conflictos.

import { DataManager } from '../data/dataManager.js';
import { LogisticsService, fixtureCompare } from '../services/logistics.js';
import { SchedulerService } from '../services/scheduler.js';

export const SchedulingEngine = {
    fixtureCompare,

    generateTimeBlocks(torneoId, day) {
        return LogisticsService.generateTimeBlocks(torneoId, day);
    },

    generateTimeSlots(torneoId) {
        return LogisticsService.generateTimeSlots(torneoId);
    },

    getGeneralFixture(torneoId, options = {}) {
        return LogisticsService.getGeneralFixture(torneoId, options);
    },

    scheduleTournament(torneoId) {
        return LogisticsService.generateSchedule(torneoId);
    },

    programTournamentBestEffort(torneoId) {
        return LogisticsService.programTournament(torneoId);
    },

    schedulePhase(torneoId, categoriaId, phase) {
        return SchedulerService.programarFase(torneoId, categoriaId, phase);
    },

    reorganizeCourts(torneoId) {
        return LogisticsService.reorganizeCourts(torneoId);
    },

    reorganizeFixture(torneoId) {
        return LogisticsService.reorganizeFixture(torneoId);
    },

    validateSchedule(torneoId) {
        return LogisticsService.validateSchedule(torneoId);
    },

    getConflicts(torneoId) {
        return LogisticsService.getConflicts(torneoId);
    },

    scoreSchedule(torneoId) {
        return LogisticsService.scoreSchedule(torneoId);
    },

    rescheduleMatch(torneoId, matchId, { fecha, hora, courtId, cancha, orden } = {}) {
        const allMatches = LogisticsService.getTournamentMatches(torneoId);
        const current = allMatches.find(match => match.id === matchId);
        if (!current) throw new Error('No se encontró el partido seleccionado para reprogramar.');
        const courts = DataManager.getTournamentCourts(torneoId);
        const resolvedCourt = courts.find(court => court.id === courtId || court.name === cancha) || null;
        const nextMatch = {
            ...current,
            fecha: fecha !== undefined ? fecha : current.fecha,
            hora: hora !== undefined ? hora : current.hora,
            courtId: resolvedCourt ? resolvedCourt.id : (courtId !== undefined ? courtId : current.courtId),
            cancha: resolvedCourt ? resolvedCourt.name : (cancha !== undefined ? cancha : current.cancha),
            orden: orden !== undefined ? orden : current.orden
        };
        DataManager.updateMatches([nextMatch]);
        return LogisticsService.getTournamentMatches(torneoId).find(match => match.id === matchId);
    }
};
