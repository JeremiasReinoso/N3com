# Checklist de planificación y fixture

- [x] Torneo de dos días: zonas el primer día; semifinal y final el segundo.
- [x] Dos categorías con cronogramas diferentes.
- [x] Tres categorías con cronogramas diferentes.
- [x] Cambiar la planificación conserva los IDs y partidos existentes.
- [x] Reducir el calendario informa fechas, categorías y partidos afectados antes de guardar.
- [x] Equipos de otra categoría son rechazados.
- [x] Cruces entre zonas durante `ZONAS` son rechazados.
- [x] Un partido manual confirmado vive en la misma colección de Fixture y Resultados.
- [x] Cambiar hora y cancha actualiza el mismo registro de partido.
- [x] Los filtros día + categoría + etapa + zona + cancha se combinan.
- [x] La hoja de impresión usa los filtros visibles y oculta controles y editores.
- [x] Una categoría/torneo anterior sin `planning` abre con modo compatible y sin inferir etapas.
- [x] El Fixture General se ordena por día, hora y cancha, y los filtros se combinan entre sí.
- [x] El PDF del fixture completo, el de una jornada y el de una cancha reflejan los filtros vigentes.
- [x] Cada categoría conserva su propio descanso mínimo entre partidos.
- [x] Un partido sin lugar informa el motivo concreto (cancha ocupada, descanso, fecha o horario).
- [x] Los conflictos identifican el partido, el tipo y la situación exacta (fecha, hora, cancha, descanso).
- [x] Reprogramar a mano conserva el mismo ID y rechaza en silencio los cambios en conflicto.
- [x] La tabla de referencias del PDF apunta a cada objeto (documento no corrupto).
- [x] El panel de conflictos se dibuja cuando existen alertas (no revienta el render).
- [x] Verificación de escritorio (`tests/smoke/run.ps1`): flujo completo emparejar → confirmar → programar, filtros combinados, vistas por día y por cancha, descanso por categoría, exportación de PDF, ancho reducido (tarjetas) y hoja de impresión.

La lógica está cubierta por `planning-fixture.test.mjs` y `fixture-general-exports.test.mjs`; la interfaz real se verifica con `tests/smoke/run.ps1` (requiere un binario de Electron para Windows) y la impresión con `@media print` emulado, además de la revisión visual con el dispositivo/impresora de destino.
