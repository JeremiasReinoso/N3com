# Registro de Cambios (CHANGELOG)

Todos los cambios relevantes de **N3com** se documentan en este archivo siguiendo una evolución progresiva y retrocompatible.

---

## [2.0.0] — Modernización integral y ampliación funcional

### Motor de Competición Modular (`js/engine/`)
- Incorporación del motor central compartido entre Escritorio y Web:
  - `CompetitionEngine`, `FormatRegistry`, `RoundRobinEngine`, `GroupStageEngine`, `KnockoutEngine`, `FinalStageEngine`, `FixtureEngine`, `SchedulingEngine`, `StandingsEngine`, `ResultsEngine`, `QualificationEngine` y `ValidationEngine`.
- Implementación del **Método del Círculo (Berger)** en `RoundRobinEngine` con rondas óptimas ($N-1$ para pares, $N$ para impares) y descansos (*byes*) explícitos.
- Implementación de **cuadros eliminatorios universales** (`KnockoutEngine`) para cualquier cantidad $N \ge 2$ con seeds oficiales, **byes reales sin cruces ficticios**, partido por 3.º puesto opcional y propagación automática de ganadores y perdedores (`sourceLoserMatchIds`).
- Implementación de **Formatos A, B, C, D, E y F (Personalizado)** con validación previa de coherencia y registro extensible (`FormatRegistry.register`).

### Correcciones Críticas (Estabilidad y Precisión Deportiva)
- **Resiliencia de almacenamiento (`DataManager._getStorage`):** un partido corrupto ya no borra todos los torneos guardados; se degrada únicamente ese partido a `pendiente` y el JSON inválido se resguarda en `newcom_data_corrupt_backup`.
- **Optimización de rendimiento:** eliminadas las lecturas redundantes de `localStorage` dentro de `_validateScheduleConflicts` y precálculo de descansos por categoría y bloques horarios en `LogisticsService.programTournament` (reduciendo >4× el tiempo de programación en torneos grandes).
- **Ordenamiento deportivo de posiciones (`StandingsEngine`):** corregido el criterio predeterminado a `PG → DIF Sets → DIF Puntos → PF → Enfrentamiento directo` (evitando que un equipo que perdió 1-2 supere a un ganador 2-0), sumada mini-tabla para empates de 2 o más equipos y corregida `calcularClasificacionFinal` para respetar semifinalistas y tercer puesto.
- **Unificación de bloque e intervalo (`resolveSlotInterval`):** corregida la ambigüedad entre `blockDuration` e `intervaloPartidos` que anulaba los descansos mínimos cuando `intervaloPartidos < blockDuration`.
- **Logística y eliminatorias:** corregido choque de `reorganizeCourts` con partidos finalizados, falsos conflictos con llaves `TBD` (`null`), rollback atómico en `reorganizeFixture` y `playoffs.addStage`, protección en `advanceBracketWinner` contra alteración de instancias ya finalizadas, fuga de `counts` en `cruce_especial` y soporte de `revancha` al re-generar.
- **Interfaz:** eliminado el re-render destructivo en `window.focus`, limpieza automática de listeners en Calendario, limpieza del 3.º set al deshabilitarlo en Resultados y escape HTML centralizado (`js/core/escapeHtml.js`).

### Interfaz, Gestión y Preparación Comercial
- Nuevo tablero **Inicio del Torneo** (`tournamentHomeView.js`) con indicadores, estado por categoría, edición de metadatos, organización, edición comercial e identidad para reportes.
- **Configurador de Formatos A–F** independiente por categoría (`formatConfigurator.js`) y creación de categorías personalizadas.
- CRUD completo no destructivo de equipos (renombrar/eliminar), zonas (renombrar/eliminar/desasignar/soltar líder) y categorías.
- Visualización de rondas/byes, tablas por zona, tabla de Zona Final con política explícita (`reset` vs `carry_over`), columnas `SF`/`SC`/`PTS` y tablero visual de llaves eliminatorias.
- Copias de seguridad y restauración JSON (`exportBackupSnapshot` / `importBackupSnapshot` en modo `merge` o `replace`) y puerto `StorageAdapter` preparado para persistencia centralizada futura.

### Exportaciones
- Corregida la columna de hora en PDF para Cancha 2+ y agregado el modo configurable *"Solo hora de inicio por cancha"* (con hora real por partido por defecto).
- Agregados **PDF por categoría**, **PDF con filtros activos combinados**, **CSV de fixture**, **PDF y CSV de Tablas de Posiciones** y **PDF y CSV de Resultados** (`reportsExport.js`), con encabezado institucional e información completa del torneo.

### Seguridad
- Eliminadas las credenciales administrativas hardcodeadas del frontend (`js/core/adminAuth.js`).
- Autenticación administrativa trasladada al servidor (`services/adminAuthService.js`) con `scrypt`, cookies `HttpOnly; SameSite=Strict`, protección `X-CSRF-Token`, verificación de `Host`/`Origin` y rate limiting progresivo.
- Allowlist estático estricto en `server.js` (bloquea `server.js`, `package.json`, `.git`, `electron/`, `services/`, `private/`, `tests/`), cabeceras de seguridad (`CSP` sin `script-src 'unsafe-inline'`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`) y scripts inline extraídos a `js/core/themeInit.js`.
- Licencias firmadas criptográficamente con **Ed25519 (v2)** (`services/signedLicenseService.js`) con escrituras atómicas en `licenses.json`, preservando retrocompatibilidad con licencias portátiles v1.
- Endurecimiento de `electron/main.js` con bloqueo de instancia única, denegación de permisos del SO, control de `will-redirect` y manejo de puerto ocupado.

### Compatibilidad y Restricciones Respetadas
- La sección **PLANIFICACIÓN** (`planningView.js` y `tournamentStages.js`) se conservó intacta.
- 100% compatible con torneos guardados, identificadores persistidos y licencias previas.

---

## [1.0.0] — Versión inicial local
- Gestión local de torneos con formato único (zonas, tabla general, Top 16 → Top 8 → Semifinales → Final), calendario, planificación por categoría, logística global de canchas, exportación PDF/XLSX básica y licencias locales/portátiles v1.
