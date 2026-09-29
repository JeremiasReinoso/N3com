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

La lógica está cubierta por `planning-fixture.test.mjs`; la impresión se verifica mediante las reglas `@media print` y requiere revisión visual con el dispositivo/impresora de destino.
