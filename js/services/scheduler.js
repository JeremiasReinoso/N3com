import { DataManager } from '../data/dataManager.js';

const pairKey = (teamAId, teamBId) => {
    if (!teamAId || !teamBId || teamAId === teamBId) throw new Error('Un equipo no puede jugar contra sí mismo.');
    return [String(teamAId), String(teamBId)].sort().join(':');
};
const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);
const isGroupMatch = match => match.phase === 'ZONAS' || !match.tipo || match.tipo === 'fase_zonas';
const isAllVsAllMatch = match => match.phase === 'ALL_VS_ALL' || match.tipo === 'cruces_todos_contra_todos';
const schedulerAllVsAllTournament = torneoId => DataManager.getTournamentMethod(torneoId) === 'all_vs_all';
const schedulerMinutesFromTime = time => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
};
const schedulerTimeFromMinutes = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const dayCapacity = (day, settings, courtCount) => {
    const duration = Number(settings.duracionPartido) + Number(settings.intervaloPartidos);
    const available = schedulerMinutesFromTime(day.fin) - schedulerMinutesFromTime(day.inicio);
    return duration > 0 ? Math.max(0, Math.floor((available - Number(settings.duracionPartido)) / duration + 1) * courtCount) : 0;
};

const teamSort = (counts, left, right) => (
    counts.get(left.id) - counts.get(right.id)
    || String(left.id).localeCompare(String(right.id))
);

// Completa sólo los cruces que faltan. Se elige siempre uno de los equipos
// con menos partidos y se prueba primero contra otro equipo pendiente. La
// búsqueda con retroceso evita que una elección local deje a un equipo sin
// rivales únicos disponibles.
const buildBalancedPairs = (teams, initialCounts, initialPairs, required) => {
    const byId = new Map(teams.map(team => [team.id, team]));
    const initial = new Map(initialCounts);
    let attempts = 0;
    const maxAttempts = 200000;
    const availableOpponents = (team, pairs) => teams.filter(other => (
        other.id !== team.id && !pairs.has(pairKey(team.id, other.id))
    ));
    const canStillComplete = (counts, pairs) => teams.every(team => (
        counts.get(team.id) >= required
        || counts.get(team.id) + availableOpponents(team, pairs).length >= required
    ));
    const search = (counts, pairs, generated) => {
        attempts += 1;
        if (attempts > maxAttempts) return null;
        const pending = teams.filter(team => counts.get(team.id) < required);
        if (!pending.length) return generated;
        if (!canStillComplete(counts, pairs)) return null;
        const team = pending.sort((left, right) => {
            const leftOptions = availableOpponents(left, pairs).length;
            const rightOptions = availableOpponents(right, pairs).length;
            return teamSort(counts, left, right) || leftOptions - rightOptions;
        })[0];
        const opponents = availableOpponents(team, pairs).sort((left, right) => {
            const leftPending = Number(counts.get(left.id) < required);
            const rightPending = Number(counts.get(right.id) < required);
            return rightPending - leftPending || teamSort(counts, left, right);
        });
        for (const opponent of opponents) {
            const key = pairKey(team.id, opponent.id);
            const nextCounts = new Map(counts);
            nextCounts.set(team.id, nextCounts.get(team.id) + 1);
            nextCounts.set(opponent.id, nextCounts.get(opponent.id) + 1);
            const nextPairs = new Set(pairs);
            nextPairs.add(key);
            if (!canStillComplete(nextCounts, nextPairs)) continue;
            const result = search(nextCounts, nextPairs, [...generated, { local: byId.get(team.id), visitante: byId.get(opponent.id), key }]);
            if (result) return result;
        }
        return null;
    };
    const result = search(initial, new Set(initialPairs), []);
    if (!result) throw new Error('No existe una combinación de rivales únicos que complete los partidos garantizados.');
    return result;
};

const assignRounds = (existing, pairs) => {
    const usedByRound = new Map();
    existing.forEach(match => {
        if (!Number.isInteger(match.ronda)) return;
        const used = usedByRound.get(match.ronda) || new Set();
        used.add(match.equipoLocalId); used.add(match.equipoVisitanteId);
        usedByRound.set(match.ronda, used);
    });
    return pairs.map(pair => {
        let round = 1;
        while ((usedByRound.get(round) || new Set()).has(pair.local.id) || (usedByRound.get(round) || new Set()).has(pair.visitante.id)) round += 1;
        const used = usedByRound.get(round) || new Set();
        used.add(pair.local.id); used.add(pair.visitante.id);
        usedByRound.set(round, used);
        return { ...pair, ronda: round };
    });
};

export const SchedulerService = {
    // La fase se deriva de resultados y de un cierre explícito de los cruces.
    // Así no se habilitan semifinales sólo por haber terminado los asegurados.
    getTournamentPhase(torneoId, categoriaId) {
        if (!schedulerAllVsAllTournament(torneoId)) return 'STANDARD';
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const final = matches.find(match => match.phase === 'FINAL');
        if (final) return final.estado === 'finalizado' ? 'FINISHED' : 'FINAL';
        const semifinals = matches.filter(match => match.phase === 'SEMIFINAL');
        if (semifinals.length) return 'SEMIFINALS';
        const guaranteed = this.estadoFaseClasificatoria(torneoId, categoriaId);
        if (!guaranteed.ok) return 'GUARANTEED_MATCHES';
        if (DataManager.getCategory(categoriaId)?.allVsAllCrossesClosed) return 'SEMIFINALS';
        return 'ALL_VS_ALL';
    },

    getAllVsAllCrosses(torneoId, categoriaId) {
        return DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(isAllVsAllMatch);
    },

    // Cada tanda propone como máximo un partido por equipo. Se prioriza a los
    // equipos con menos encuentros totales y nunca se reutiliza un rival ya
    // enfrentado; las zonas dejan de participar en este cálculo.
    proponerCrucesTodosContraTodos(torneoId, categoriaId) {
        if (!schedulerAllVsAllTournament(torneoId)) throw new Error('Los cruces libres sólo están disponibles para el método Todos contra todos.');
        if (this.getTournamentPhase(torneoId, categoriaId) !== 'ALL_VS_ALL') throw new Error('La fase de cruces no está habilitada para esta categoría.');
        const guaranteed = this.estadoFaseClasificatoria(torneoId, categoriaId);
        if (!guaranteed.ok) throw new Error(guaranteed.mensaje);
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        if (teams.length < 2) throw new Error('Se necesitan al menos dos equipos para crear cruces.');
        const history = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const existingPairs = new Set(history.map(match => pairKey(match.equipoLocalId, match.equipoVisitanteId)));
        const appearances = new Map(teams.map(team => [team.id, history.filter(match => match.equipoLocalId === team.id || match.equipoVisitanteId === team.id).length]));
        const available = new Set(teams.map(team => team.id));
        const byId = new Map(teams.map(team => [team.id, team]));
        const proposal = [];
        const order = ids => [...ids].sort((left, right) => appearances.get(left) - appearances.get(right) || String(left).localeCompare(String(right)));
        while (available.size > 1) {
            const localId = order(available)[0];
            const opponentId = order([...available].filter(id => id !== localId && !existingPairs.has(pairKey(localId, id))))[0];
            if (!opponentId) { available.delete(localId); continue; }
            proposal.push({ local: byId.get(localId), visitante: byId.get(opponentId) });
            available.delete(localId); available.delete(opponentId);
        }
        return proposal;
    },

    crearCrucesTodosContraTodos(torneoId, categoriaId, pairs) {
        if (!Array.isArray(pairs) || !pairs.length) throw new Error('No hay cruces disponibles para confirmar.');
        const planning = DataManager.getCategoryPlanning(torneoId, categoriaId);
        if (planning && !DataManager.getPlanningDatesForStage(torneoId, categoriaId, 'ALL_VS_ALL').length) throw new Error('Asigná Cruces a una jornada en Planificación antes de confirmar estos emparejamientos.');
        const proposed = this.proponerCrucesTodosContraTodos(torneoId, categoriaId);
        const proposedKeys = new Set(proposed.map(pair => pairKey(pair.local.id, pair.visitante.id)));
        const selected = pairs.map(pair => ({
            localId: pair.localId || pair.local?.id || pair.local,
            visitanteId: pair.visitanteId || pair.visitante?.id || pair.visitante
        }));
        if (selected.some(pair => !proposedKeys.has(pairKey(pair.localId, pair.visitanteId)))) throw new Error('La propuesta contiene un enfrentamiento inválido o ya disputado.');
        if (new Set(selected.map(pair => pairKey(pair.localId, pair.visitanteId))).size !== selected.length) throw new Error('No se puede confirmar dos veces el mismo cruce.');
        if (new Set(selected.flatMap(pair => [pair.localId, pair.visitanteId])).size !== selected.length * 2) throw new Error('Un equipo sólo puede integrar un cruce por tanda automática.');
        const created = DataManager.addMatches(selected.map((pair, index) => ({
            torneoId, categoriaId, zonaId: null, phase: 'ALL_VS_ALL', tipo: 'cruces_todos_contra_todos',
            nombreEtapa: `Cruces — Todos contra todos ${index + 1}`,
            equipoLocalId: pair.localId, equipoVisitanteId: pair.visitanteId,
            fecha: null, hora: null, cancha: null, orden: null, estado: 'pendiente', confirmado: true
        })));
        this.programarFase(torneoId, categoriaId, 'ALL_VS_ALL', 'ZONAS');
        return created;
    },

    existeEnfrentamiento(torneoId, categoriaId, equipoLocalId, equipoVisitanteId) {
        const key = pairKey(equipoLocalId, equipoVisitanteId);
        return DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .some(match => pairKey(match.equipoLocalId, match.equipoVisitanteId) === key);
    },

    crearCruceManualTodosContraTodos(torneoId, categoriaId, equipoLocalId, equipoVisitanteId, schedule = {}, allowDuplicate = false) {
        if (!schedulerAllVsAllTournament(torneoId)) throw new Error('Los cruces libres sólo están disponibles para el método Todos contra todos.');
        if (this.getTournamentPhase(torneoId, categoriaId) !== 'ALL_VS_ALL') throw new Error('La fase de cruces no está habilitada para esta categoría.');
        const guaranteed = this.estadoFaseClasificatoria(torneoId, categoriaId);
        if (!guaranteed.ok) throw new Error(guaranteed.mensaje);
        if (!equipoLocalId || !equipoVisitanteId || equipoLocalId === equipoVisitanteId) throw new Error('Seleccione dos equipos distintos.');
        const duplicate = this.existeEnfrentamiento(torneoId, categoriaId, equipoLocalId, equipoVisitanteId);
        if (duplicate && !allowDuplicate) throw new Error('Estos equipos ya se enfrentaron. Confirme si desea crear una revancha.');
        const planning = DataManager.getCategoryPlanning(torneoId, categoriaId);
        if (planning && schedule.fecha && !DataManager.getPlanningDatesForStage(torneoId, categoriaId, 'ALL_VS_ALL').includes(schedule.fecha)) throw new Error('La jornada seleccionada no tiene configurada la etapa Cruces.');
        const created = DataManager.addMatches([{
            torneoId, categoriaId, zonaId: null, phase: 'ALL_VS_ALL', tipo: 'cruces_todos_contra_todos',
            nombreEtapa: 'Cruce manual — Todos contra todos', manual: true,
            equipoLocalId, equipoVisitanteId, fecha: schedule.fecha || null, hora: schedule.hora || null,
            cancha: schedule.cancha || null, orden: schedule.orden ? Number(schedule.orden) : null,
            estado: 'pendiente', confirmado: true
        }]);
        return { created: created[0], duplicate };
    },

    cerrarCrucesTodosContraTodos(torneoId, categoriaId) {
        if (!schedulerAllVsAllTournament(torneoId)) throw new Error('Este torneo no utiliza la fase Todos contra todos.');
        const guaranteed = this.estadoFaseClasificatoria(torneoId, categoriaId);
        if (!guaranteed.ok) throw new Error(guaranteed.mensaje);
        const crosses = this.getAllVsAllCrosses(torneoId, categoriaId);
        if (!crosses.length) throw new Error('Cree al menos un cruce antes de cerrar esta fase.');
        if (crosses.some(match => match.estado !== 'finalizado')) throw new Error('Registre todos los resultados de los cruces antes de generar semifinales.');
        DataManager.setAllVsAllCrossesClosed(torneoId, categoriaId, true);
    },

    // Genera únicamente los cruces necesarios para que cada equipo alcance el
    // mínimo configurado. Cada par usa una clave normalizada: A-B y B-A son
    // el mismo enfrentamiento.
    generarEmparejamientos(torneoId, categoriaId, options = {}) {
        if (options.date) {
            if (!DataManager.getCalendarDates(torneoId).includes(options.date)) throw new Error('Esta fecha no está habilitada en el calendario del torneo.');
            const planning = DataManager.getCategoryPlanning(torneoId, categoriaId);
            if (planning && !DataManager.getPlanningDatesForStage(torneoId, categoriaId, 'ZONAS').includes(options.date)) throw new Error('Esta jornada no tiene configurada la fase de zonas o los partidos garantizados.');
        }
        const tournament = DataManager.getTournament(torneoId);
        if (!tournament) throw new Error('Seleccione un torneo válido.');
        const assured = Number(tournament.partidos_asegurados);
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        if (!teams.length) throw new Error('La categoría seleccionada no tiene equipos.');
        if (teams.some(team => !team.zonaId)) throw new Error('Asigne una zona a todos los equipos antes de emparejar.');

        // Repara duplicados de datos locales creados por versiones anteriores
        // antes de calcular. Las altas y ediciones actuales siempre rechazan
        // duplicados; no se eliminan silenciosamente en esos flujos.
        DataManager.deduplicateGroupMatches(torneoId, categoriaId);
        const existingFixture = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(isGroupMatch);
        const existingValidation = this.validateGuaranteedMatches(torneoId, categoriaId);
        if (existingValidation.invalidMatches.length || existingValidation.crossZoneMatches.length || existingValidation.scheduleConflicts.length) {
            throw new Error(existingValidation.mensaje);
        }

        const pending = [];
        for (const zone of zones) {
            const zoneTeams = teams.filter(team => team.zonaId === zone.id);
            if (!zoneTeams.length) continue;
            if (zoneTeams.length < 2) throw new Error(`${zone.nombre} necesita al menos dos equipos.`);
            if (assured > zoneTeams.length - 1) throw new Error(`${zone.nombre} tiene ${zoneTeams.length} equipos y no puede garantizar ${assured} partidos sin repetir enfrentamientos.`);
            const existing = existingFixture.filter(match => match.zonaId === zone.id);
            const counts = new Map(zoneTeams.map(team => [team.id, 0]));
            const pairsSeen = new Set();
            existing.forEach(match => {
                const key = pairKey(match.equipoLocalId, match.equipoVisitanteId);
                if (pairsSeen.has(key)) throw new Error(`${zone.nombre} contiene un enfrentamiento duplicado.`);
                pairsSeen.add(key);
                counts.set(match.equipoLocalId, (counts.get(match.equipoLocalId) || 0) + 1);
                counts.set(match.equipoVisitanteId, (counts.get(match.equipoVisitanteId) || 0) + 1);
            });

            if ([...counts.values()].every(count => count >= assured)) continue;
            let generated;
            try {
                generated = buildBalancedPairs(zoneTeams, counts, pairsSeen, assured);
            } catch (error) {
                throw new Error(`No se pudo completar ${zone.nombre} sin repetir enfrentamientos: ${error.message}`);
            }
            assignRounds(existing, generated).forEach(({ local, visitante, ronda }) => {
                pending.push({ torneoId, categoriaId, zonaId: zone.id, tipo: 'fase_zonas', ronda, equipoLocalId: local.id, equipoVisitanteId: visitante.id, fecha: null, hora: null, cancha: null, estado: 'borrador', confirmado: false, setsLocal: null, setsVisitante: null });
            });
        }
        const created = pending.length ? DataManager.addMatches(pending) : [];
        const validation = this.validateGuaranteedMatches(torneoId, categoriaId);
        if (!validation.valid) {
            // No se confirma una solución parcial si una validación posterior
            // detecta un dato inesperado: se revierte sólo lo creado en esta
            // ejecución y se conserva el fixture que ya existía.
            created.forEach(match => DataManager.removeMatch(match.id));
            throw new Error(validation.mensaje);
        }
        this.redistribuirFechas(torneoId, categoriaId, options.date ? [options.date] : null);
        return pending.length;
    },

    recrearBorradores(torneoId, categoriaId) {
        const groupMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(isGroupMatch);
        if (groupMatches.some(isOfficialMatch)) throw new Error('No se puede rehacer un fixture que ya tiene partidos confirmados.');
        DataManager.removeDraftGroupMatches(torneoId, categoriaId);
        return this.generarEmparejamientos(torneoId, categoriaId);
    },

    // Distribuye el fixture de forma equitativa, conservando una ronda completa
    // en el mismo día cuando la capacidad lo permite.
    redistribuirFechas(torneoId, categoriaId, preferredDates = null) {
        const planning = DataManager.getCategoryPlanning(torneoId, categoriaId);
        const plannedDates = DataManager.getPlanningDatesForStage(torneoId, categoriaId, 'ZONAS');
        const dates = preferredDates?.length ? preferredDates : (planning ? plannedDates : DataManager.getCalendarDates(torneoId));
        if (planning && !dates.length) throw new Error('Configurá Fase de zonas o Partidos garantizados en la planificación de esta categoría.');
        if (!dates.length) return 0;
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match) && match.estado !== 'finalizado');
        if (!matches.length) return 0;
        const dailyTargets = dates.map((fecha, index) => ({
            fecha,
            target: Math.floor(matches.length / dates.length) + (index < matches.length % dates.length ? 1 : 0),
            matches: [],
            teams: new Set()
        }));
        const assignMatch = match => {
            const possibleDays = dailyTargets.filter(day => day.matches.length < day.target);
            possibleDays.sort((left, right) => {
                const leftTeamUse = Number(left.teams.has(match.equipoLocalId)) + Number(left.teams.has(match.equipoVisitanteId));
                const rightTeamUse = Number(right.teams.has(match.equipoLocalId)) + Number(right.teams.has(match.equipoVisitanteId));
                return leftTeamUse - rightTeamUse || left.matches.length - right.matches.length || left.fecha.localeCompare(right.fecha);
            });
            const day = possibleDays[0];
            day.matches.push(match);
            day.teams.add(match.equipoLocalId);
            day.teams.add(match.equipoVisitanteId);
        };
        const roundGroups = new Map();
        matches.forEach(match => {
            const key = Number.isInteger(match.ronda) ? `ronda:${match.ronda}` : `partido:${match.id}`;
            const group = roundGroups.get(key) || [];
            group.push(match);
            roundGroups.set(key, group);
        });
        [...roundGroups.values()].forEach(round => {
            const roundTeams = new Set(round.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]));
            const dayForWholeRound = dailyTargets.filter(day => (
                day.target - day.matches.length >= round.length
                && [...roundTeams].every(teamId => !day.teams.has(teamId))
            ));
            if (dayForWholeRound.length) {
                dayForWholeRound.sort((left, right) => left.matches.length - right.matches.length || left.fecha.localeCompare(right.fecha));
                const day = dayForWholeRound[0];
                round.forEach(match => {
                    day.matches.push(match);
                    day.teams.add(match.equipoLocalId);
                    day.teams.add(match.equipoVisitanteId);
                });
                return;
            }
            round.forEach(assignMatch);
        });
        const reassigned = dailyTargets.flatMap(day => day.matches.map(match => ({
            ...match,
            fecha: day.fecha,
            hora: null,
            cancha: null,
            estado: isOfficialMatch(match) ? 'pendiente' : match.estado
        })));
        DataManager.updateMatches(reassigned);
        return reassigned.length;
    },

    confirmarEmparejamientos(torneoId, categoriaId) {
        const validation = this.validateGuaranteedMatches(torneoId, categoriaId);
        if (!validation.valid) throw new Error(validation.mensaje);
        const drafts = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match) && (match.estado === 'borrador' || match.estado === 'emparejado'));
        if (!drafts.length) return 0;
        DataManager.updateMatches(drafts.map(match => ({ ...match, estado: 'pendiente', confirmado: true })));
        return drafts.length;
    },

    getMatchesCountForTeam(torneoId, categoriaId, teamId, { onlyOfficial = false, onlyFinished = false } = {}) {
        const ids = new Set();
        DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match))
            .filter(match => !onlyOfficial || isOfficialMatch(match))
            .filter(match => !onlyFinished || match.estado === 'finalizado')
            .forEach(match => {
                if (match.equipoLocalId === teamId || match.equipoVisitanteId === teamId) ids.add(match.id);
            });
        return ids.size;
    },

    // Lee la fuente de verdad (partidos) en vez de confiar en el contador que
    // se usa durante la generación. Además de la cantidad por equipo, revisa
    // pares normalizados, zona y conflictos de programación ya persistidos.
    validateGuaranteedMatches(torneoId, categoriaId, { onlyOfficial = false, onlyFinished = false, requireSchedule = false } = {}) {
        const tournament = DataManager.getTournament(torneoId);
        const required = Number(tournament?.partidos_asegurados || 0);
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const teamById = new Map(teams.map(team => [team.id, team]));
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match))
            .filter(match => !onlyOfficial || isOfficialMatch(match))
            .filter(match => !onlyFinished || match.estado === 'finalizado');
        const seenMatchIds = new Set();
        const pairs = new Map();
        const duplicatePairs = [];
        const crossZoneMatches = [];
        const invalidMatches = [];
        const unscheduledMatches = [];
        matches.forEach(match => {
            if (seenMatchIds.has(match.id)) return;
            seenMatchIds.add(match.id);
            const local = teamById.get(match.equipoLocalId);
            const visitante = teamById.get(match.equipoVisitanteId);
            if (!local || !visitante || local.id === visitante.id) {
                invalidMatches.push(match);
                return;
            }
            if (!local.zonaId || local.zonaId !== visitante.zonaId || match.zonaId !== local.zonaId) crossZoneMatches.push(match);
            const key = pairKey(local.id, visitante.id);
            if (pairs.has(key)) duplicatePairs.push([pairs.get(key), match]);
            else pairs.set(key, match);
            if (requireSchedule && (!match.fecha || !match.hora || !match.cancha)) unscheduledMatches.push(match);
        });
        const teamsStatus = teams.map(team => {
            const matchesCount = this.getMatchesCountForTeam(torneoId, categoriaId, team.id, { onlyOfficial, onlyFinished });
            return { teamId: team.id, nombre: team.nombre, matches: matchesCount, required, complete: matchesCount >= required };
        });
        const incompleteTeams = teamsStatus.filter(team => !team.complete);
        const impossibleZones = zones.filter(zone => required > teams.filter(team => team.zonaId === zone.id).length - 1);
        const scheduled = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(match => match.fecha && match.hora && match.cancha);
        const scheduleConflicts = [];
        scheduled.forEach((match, index) => scheduled.slice(index + 1).forEach(other => {
            if (match.fecha !== other.fecha || match.hora !== other.hora) return;
            if (match.cancha === other.cancha || [match.equipoLocalId, match.equipoVisitanteId].some(id => [other.equipoLocalId, other.equipoVisitanteId].includes(id))) scheduleConflicts.push([match, other]);
        }));
        const problems = [];
        if (impossibleZones.length) problems.push(`No se pueden cumplir los partidos asegurados sin repetir cruces en: ${impossibleZones.map(zone => zone.nombre).join(', ')}.`);
        if (invalidMatches.length) problems.push('Hay partidos con equipos inválidos.');
        if (crossZoneMatches.length) problems.push('Hay partidos entre zonas diferentes.');
        if (duplicatePairs.length) problems.push('Hay enfrentamientos repetidos.');
        if (scheduleConflicts.length) problems.push('Hay conflictos de cancha, horario o equipos.');
        if (unscheduledMatches.length) problems.push('Hay partidos sin fecha, hora o cancha.');
        if (incompleteTeams.length) problems.push(`Faltan partidos asegurados para: ${incompleteTeams.map(team => `${team.nombre} ${team.matches}/${required}`).join(', ')}.`);
        return {
            valid: problems.length === 0 && teams.length > 0,
            guaranteedMatches: required,
            teams: teamsStatus,
            incompleteTeams,
            duplicatePairs,
            crossZoneMatches,
            scheduleConflicts,
            invalidMatches,
            unscheduledMatches,
            mensaje: problems.join(' ') || 'Todos los equipos cumplen los partidos asegurados sin cruces repetidos ni conflictos.'
        };
    },

    verificarPartidosAsegurados(torneoId, categoriaId, onlyOfficial = false) {
        const validation = this.validateGuaranteedMatches(torneoId, categoriaId, { onlyOfficial });
        return { ...validation, ok: validation.valid };
    },

    estadoFaseClasificatoria(torneoId, categoriaId) {
        const fixture = this.validateGuaranteedMatches(torneoId, categoriaId);
        if (!fixture.valid) return { ok: false, equipos: fixture.teams, pendientes: fixture.incompleteTeams, mensaje: fixture.mensaje };
        const finished = this.validateGuaranteedMatches(torneoId, categoriaId, { onlyFinished: true });
        const equipos = finished.teams.map(team => ({ ...team, jugados: team.matches, requeridos: team.required }));
        const pendientes = equipos.filter(team => team.jugados < team.requeridos);
        return {
            ok: !pendientes.length && equipos.length > 0,
            equipos,
            pendientes,
            mensaje: pendientes.length ? `Faltan partidos asegurados finalizados: ${pendientes.map(team => `${team.nombre} ${team.jugados}/${team.requeridos}`).join(', ')}.` : 'Fase clasificatoria completada.'
        };
    },

    // Programa el fixture confirmado con fecha, hora y cancha. Ejecutarlo de
    // nuevo reconstruye la distribución ante un cambio de calendario.
    programarEmparejamientos(torneoId, categoriaId) {
        const planning = DataManager.getCategoryPlanning(torneoId, categoriaId);
        const plannedDates = DataManager.getPlanningDatesForStage(torneoId, categoriaId, 'ZONAS');
        const daySchedules = DataManager.getDaySchedules(torneoId).filter(day => !planning || plannedDates.includes(day.fecha));
        if (!daySchedules.length) throw new Error('Configure al menos un día en Calendario.');
        const groupMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(isGroupMatch);
        if (groupMatches.some(match => !isOfficialMatch(match))) throw new Error('Confirme los emparejamientos antes de programarlos.');
        const verification = this.verificarPartidosAsegurados(torneoId, categoriaId, true);
        if (!verification.ok) throw new Error(verification.mensaje);
        const courts = Array.from({ length: DataManager.getTournamentCourtCount(torneoId) }, (_, index) => `Cancha ${index + 1}`);
        const settings = DataManager.getTournamentSchedulingSettings(torneoId);
        // Con planificación explícita sólo se usan sus jornadas. En torneos
        // históricos se conserva la reserva implícita del último día.
        const priorDays = daySchedules.slice(0, -1);
        const unscheduledGroups = groupMatches.filter(match => match.estado !== 'finalizado').length;
        const priorCapacity = priorDays.reduce((total, day) => total + dayCapacity(day, settings, courts.length), 0);
        const schedulingDays = planning ? daySchedules : (priorDays.length && unscheduledGroups <= priorCapacity ? priorDays : daySchedules);
        this.redistribuirFechas(torneoId, categoriaId, schedulingDays.map(day => day.fecha));
        const toSchedule = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match) && isOfficialMatch(match) && match.estado !== 'finalizado');
        if (!toSchedule.length) return 0;
        const courtLoads = new Map(courts.map(court => [court, 0]));
        const scheduled = [];

        for (const day of schedulingDays) {
            const remaining = toSchedule.filter(match => match.fecha === day.fecha);
            const timeSlots = [];
            for (let minute = schedulerMinutesFromTime(day.inicio); minute + settings.duracionPartido <= schedulerMinutesFromTime(day.fin); minute += settings.duracionPartido + settings.intervaloPartidos) {
                timeSlots.push(schedulerTimeFromMinutes(minute));
            }
            if (remaining.length > timeSlots.length * courts.length) throw new Error(`No hay franjas suficientes el ${day.fecha}.`);
            for (const hora of timeSlots) {
                const busyTeams = new Set();
                const availableCourts = courts.slice();
                while (availableCourts.length) {
                    const matchIndex = remaining.findIndex(match => !busyTeams.has(match.equipoLocalId) && !busyTeams.has(match.equipoVisitanteId));
                    if (matchIndex === -1) break;
                    const [match] = remaining.splice(matchIndex, 1);
                    availableCourts.sort((left, right) => courtLoads.get(left) - courtLoads.get(right) || left.localeCompare(right));
                    const cancha = availableCourts.shift();
                    scheduled.push({ ...match, fecha: day.fecha, hora, cancha, estado: 'pendiente', confirmado: true });
                    courtLoads.set(cancha, courtLoads.get(cancha) + 1);
                    busyTeams.add(match.equipoLocalId);
                    busyTeams.add(match.equipoVisitanteId);
                }
            }
            if (remaining.length) throw new Error(`No se pudieron programar todos los partidos del ${day.fecha} sin superponer equipos.`);
        }
        if (scheduled.length !== toSchedule.length) throw new Error('Hay partidos con una fecha fuera del período del torneo.');
        DataManager.updateMatches(scheduled);
        const completedSchedule = this.validateGuaranteedMatches(torneoId, categoriaId, { onlyOfficial: true, requireSchedule: true });
        if (!completedSchedule.valid) throw new Error(completedSchedule.mensaje);
        return scheduled.length;
    },

    // Propuesta automática reutilizable para cada etapa eliminatoria. El árbitro
    // puede editar luego fecha, hora o cancha sin crear otro partido.
    programarFase(torneoId, categoriaId, phase, afterPhase = null) {
        const configuredDays = DataManager.getDaySchedules(torneoId);
        const settings = DataManager.getTournamentSchedulingSettings(torneoId);
        if (!configuredDays.length) return 0;
        const planning = DataManager.getCategoryPlanning(torneoId, categoriaId);
        const planningPhase = phase === 'THIRD_PLACE' ? 'FINAL' : phase;
        const plannedDates = DataManager.getPlanningDatesForStage(torneoId, categoriaId, planningPhase);
        if (planning && !plannedDates.length) throw new Error(`La etapa ${phase} no tiene una jornada asignada en la planificación de esta categoría.`);
        // La planificación manda. Sólo los torneos históricos conservan la
        // prioridad del último día para las instancias finales.
        const finalStages = ['SEMIFINAL', 'THIRD_PLACE', 'FINAL'];
        const days = planning
            ? configuredDays.filter(day => plannedDates.includes(day.fecha))
            : (finalStages.includes(phase) ? [configuredDays.at(-1), ...configuredDays.slice(0, -1)] : [...configuredDays.slice(0, -1), configuredDays.at(-1)]);
        const targets = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(match => match.phase === phase && match.estado !== 'finalizado' && (!match.fecha || !match.hora || !match.cancha));
        const allMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        const occupied = allMatches.filter(match => match.phase !== phase && match.fecha && match.hora && match.cancha);
        // Una etapa no puede ser sugerida antes de que termine la anterior.
        // Así los partidos nuevos nunca alteran ni se intercalan con el fixture
        // de partidos asegurados ya cerrado.
        const latestPriorSlot = afterPhase
            ? allMatches.filter(match => match.phase === afterPhase && match.fecha && match.hora)
                .map(match => `${match.fecha}T${match.hora}`)
                .sort()
                .at(-1)
            : null;
        const courts = Array.from({ length: DataManager.getTournamentCourtCount(torneoId) }, (_, index) => `Cancha ${index + 1}`);
        const updates = [];
        for (const match of targets) {
            let slot = null;
            for (const day of days) {
                for (let minute = schedulerMinutesFromTime(day.inicio); minute + settings.duracionPartido <= schedulerMinutesFromTime(day.fin); minute += settings.duracionPartido + settings.intervaloPartidos) {
                    const hora = schedulerTimeFromMinutes(minute);
                    if (latestPriorSlot && `${day.fecha}T${hora}` <= latestPriorSlot) continue;
                    for (const cancha of courts) {
                        const conflict = [...occupied, ...updates].some(other => other.fecha === day.fecha && other.hora === hora && (other.cancha === cancha || [other.equipoLocalId, other.equipoVisitanteId].some(id => [match.equipoLocalId, match.equipoVisitanteId].includes(id))));
                        if (!conflict) { slot = { fecha: day.fecha, hora, cancha }; break; }
                    }
                    if (slot) break;
                }
                if (slot) break;
            }
            if (!slot) throw new Error(`No hay una franja disponible para ${match.nombreEtapa || phase}.`);
            updates.push({ ...match, ...slot, estado: 'pendiente', confirmado: true });
        }
        if (updates.length) DataManager.updateMatches(updates);
        return updates.length;
    }
};
