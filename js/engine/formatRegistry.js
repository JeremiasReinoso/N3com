// Registro extensible de formatos de competición.
// Permite incorporar nuevos formatos sin reescribir ni acoplar los existentes.

import { ValidationEngine } from './validationEngine.js';

const registry = new Map();

export const BUILTIN_FORMATS = Object.freeze({
    ZONAS_ELIMINATORIAS: 'ZONAS_ELIMINATORIAS',
    TODOS_CONTRA_TODOS: 'TODOS_CONTRA_TODOS',
    ZONAS_ZONA_FINAL: 'ZONAS_ZONA_FINAL',
    ELIMINACION_DIRECTA: 'ELIMINACION_DIRECTA',
    LIGA_RONDAS: 'LIGA_RONDAS',
    PERSONALIZADO: 'PERSONALIZADO',
    ZONAS_SUBZONAS: 'ZONAS_SUBZONAS'
});

const DEFAULT_DEFINITIONS = [
    {
        id: BUILTIN_FORMATS.ZONAS_ELIMINATORIAS,
        code: 'A',
        name: 'Zonas + Eliminatorias',
        shortDescription: 'Fase de zonas con clasificación configurable hacia cuadro eliminatorio.',
        requiresZones: true,
        supportsPlayoffs: true,
        supportsFinalGroup: false,
        initialPhase: 'ZONAS',
        defaultConfig: {
            formatId: BUILTIN_FORMATS.ZONAS_ELIMINATORIAS,
            groupMode: 'guaranteed',
            qualificationMode: 'general_top_n',
            qualifiersTotal: 16,
            qualifiersPerZone: 2,
            bestOthers: 0,
            seedingMode: 'overall_rank',
            bracketStyle: 'standard',
            thirdPlace: false,
            standingsMode: 'wins'
        }
    },
    {
        id: BUILTIN_FORMATS.TODOS_CONTRA_TODOS,
        code: 'B',
        name: 'Todos contra Todos',
        shortDescription: 'Tabla única donde cada equipo enfrenta a todos los demás con rondas equilibradas y control de descansos.',
        requiresZones: false,
        supportsPlayoffs: false,
        supportsFinalGroup: false,
        initialPhase: 'LIGA',
        defaultConfig: {
            formatId: BUILTIN_FORMATS.TODOS_CONTRA_TODOS,
            vueltas: 1,
            includePlayoffs: false,
            standingsMode: 'wins'
        }
    },
    {
        id: BUILTIN_FORMATS.ZONAS_ZONA_FINAL,
        code: 'C',
        name: 'Zonas + Zona Final',
        shortDescription: 'Zonas iniciales con clasificación a una Zona Final todos contra todos (arranque en cero o arrastre explícito).',
        requiresZones: true,
        supportsPlayoffs: false,
        supportsFinalGroup: true,
        initialPhase: 'ZONAS',
        defaultConfig: {
            formatId: BUILTIN_FORMATS.ZONAS_ZONA_FINAL,
            groupMode: 'round_robin',
            qualificationMode: 'per_zone',
            qualifiersPerZone: 2,
            bestOthers: 0,
            carryOverMode: 'reset',
            finalVueltas: 1,
            includePlayoffs: false,
            standingsMode: 'wins'
        }
    },
    {
        id: BUILTIN_FORMATS.ELIMINACION_DIRECTA,
        code: 'D',
        name: 'Eliminación Directa',
        shortDescription: 'Cuadro eliminatorio directo con seeds, descansos (byes) válidos y tercer puesto opcional.',
        requiresZones: false,
        supportsPlayoffs: true,
        supportsFinalGroup: false,
        initialPhase: 'ELIMINATORIAS',
        defaultConfig: {
            formatId: BUILTIN_FORMATS.ELIMINACION_DIRECTA,
            bracketStyle: 'standard',
            thirdPlace: false,
            standingsMode: 'wins'
        }
    },
    {
        id: BUILTIN_FORMATS.LIGA_RONDAS,
        code: 'E',
        name: 'Liga por Rondas',
        shortDescription: 'Campeonato por jornadas y rondas completas con enfrentamientos únicos y tabla acumulativa.',
        requiresZones: false,
        supportsPlayoffs: false,
        supportsFinalGroup: false,
        initialPhase: 'LIGA',
        defaultConfig: {
            formatId: BUILTIN_FORMATS.LIGA_RONDAS,
            vueltas: 1,
            includePlayoffs: false,
            standingsMode: 'points_table'
        }
    },
    {
        id: BUILTIN_FORMATS.PERSONALIZADO,
        code: 'F',
        name: 'Formato Personalizado',
        shortDescription: 'Configurador multifase validado: combina zonas, rondas, arrastre de puntos, zona final y eliminatorias.',
        requiresZones: false,
        supportsPlayoffs: true,
        supportsFinalGroup: true,
        initialPhase: 'CUSTOM',
        defaultConfig: {
            formatId: BUILTIN_FORMATS.PERSONALIZADO,
            standingsMode: 'wins',
            stages: [
                { type: 'ZONAS', groupMode: 'round_robin', zonesCount: 2, qualifiersPerZone: 2, bestOthers: 0 },
                { type: 'ELIMINATORIAS', thirdPlace: true }
            ]
        }
    },
    {
        id: BUILTIN_FORMATS.ZONAS_SUBZONAS,
        code: 'G',
        name: 'Zonas + Ronda Campeonato y Estímulo',
        shortDescription: 'Fase de zonas seguida de sub-zonas por puestos (Campeonato Z1-Z2 y Estímulo / Triangulares) y cruces finales.',
        requiresZones: true,
        supportsPlayoffs: true,
        supportsFinalGroup: true,
        initialPhase: 'ZONAS',
        defaultConfig: {
            formatId: BUILTIN_FORMATS.ZONAS_SUBZONAS,
            groupMode: 'round_robin',
            subZoneScheme: 'auto',
            qualifiersPerZone: 2,
            thirdPlace: true,
            placementCrosses: true,
            standingsMode: 'wins'
        }
    }
];

export const FormatRegistry = {
    BUILTIN_FORMATS,

    register(definition) {
        if (!definition?.id || typeof definition.id !== 'string') {
            throw new Error('La definición del formato debe incluir un identificador válido.');
        }
        const id = definition.id.trim().toUpperCase();
        registry.set(id, Object.freeze({ ...definition, id }));
        return registry.get(id);
    },

    has(formatId) {
        return registry.has(String(formatId || '').trim().toUpperCase());
    },

    get(formatId) {
        const key = String(formatId || '').trim().toUpperCase();
        return registry.get(key) || null;
    },

    list() {
        return [...registry.values()];
    },

    createConfig(formatId, overrides = {}) {
        const definition = this.get(formatId);
        if (!definition) throw new Error(`Formato no registrado: "${formatId}".`);
        const merged = {
            ...structuredClone(definition.defaultConfig),
            ...overrides,
            formatId: definition.id
        };
        return merged;
    },

    resolve(rawConfig) {
        const formatId = rawConfig?.formatId || rawConfig?.format || BUILTIN_FORMATS.ZONAS_ELIMINATORIAS;
        const definition = this.get(formatId) || this.get(BUILTIN_FORMATS.ZONAS_ELIMINATORIAS);
        const config = {
            ...structuredClone(definition.defaultConfig),
            ...(rawConfig || {}),
            formatId: definition.id
        };
        return { definition, config };
    },

    validate(config, context = {}) {
        const definition = this.get(config?.formatId || config?.format);
        if (!definition) {
            return { valid: false, errors: [`Formato no registrado: "${config?.formatId || config?.format}".`], warnings: [] };
        }
        if (typeof definition.validate === 'function') {
            return definition.validate(config, context);
        }
        return ValidationEngine.validateFormatConfig(config, context);
    }
};

DEFAULT_DEFINITIONS.forEach(definition => FormatRegistry.register(definition));
