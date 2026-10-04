# NEWCOM — Manual de uso paso a paso

Este manual explica, en orden, todo lo que hay que hacer para armar un torneo completo
en NEWCOM. Está pensado para leerlo tranquilo, paso por paso, siguiendo los menús de la
aplicación. Cada pantalla tiene los mismos nombres que acá: **Inicio, Equipos, Calendario,
Planificación, Programación, Resultados, Posiciones, Eliminatorias**.

---

## 1. Abrir la aplicación

1. Hacer doble clic en **N3com.exe** (o en el acceso directo del programa instalado).
2. Si la primera vez pide un **código de licencia**, escribir el código que le entregó el
   administrador (empieza con `NWC-`) y confirmar. El código se guarda y no hay que
   escribirlo de nuevo.
3. Arriba a la derecha aparece el chip **“N DISPONIBLES”**: son los torneos que puede
   crear todavía. Ej.: `1 DISPONIBLES` = puede crear un torneo.

---

## 2. Crear el torneo

1. En **Mis torneos**, completar el formulario:
   - **Nombre** del torneo (ej.: `Copa Barrio 2026`).
   - **Partidos por equipo**: cuántos partidos quiere que juegue cada equipo.
   - **Método**: cómo se arma el fixture (dejar el que corresponda a su torneo).
2. Hacer clic en **Crear torneo**.
3. Hacer clic en **Abrir torneo**.

> **Importante:** crear un torneo consume **1 crédito**. Eliminar un torneo **no devuelve**
> el crédito. Si no le quedan créditos, avise al administrador (botón *Renovar licencia*).

---

## 3. Cargar categorías y equipos (menú Equipos)

1. **Nueva categoría**: escribir el nombre y confirmar
   (ej.: `+40 Masculino`, `+40 Femenino`). Se pueden crear varias.
2. Elegir la categoría en la pestaña superior.
3. **Agregar equipo**: escribir el nombre del equipo y confirmar. Repetir con todos.
4. Verificar que la lista muestre todos los equipos antes de seguir.

> Los equipos se cargan primero; el fixture no se puede generar sin equipos.

---

## 4. Fechas y horarios (menú Calendario)

1. **Disponibilidad general**: elegir la **fecha de inicio** y la **fecha final** del torneo
   y guardar. Aparecerán las jornadas (días) del período.
2. En cada jornada se puede revisar el horario. Dejar por defecto si está bien:
   `08:00 — 20:00`.
3. Configurar la logística:
   - **Duración del bloque**: cuánto dura cada partido (ej.: `30` minutos).
   - **Intervalo entre partidos (cadencia)**: cada cuántos minutos arrancan partidos
     (ej.: `30`).
4. Guardar el calendario.

**¿Cómo se calcula?** Con duración 30 e intervalo 30, los partidos arrancan cada 30
minutos: `08:00, 08:30, 09:00, 09:30, 10:00…`. Si el intervalo fuera 60, serían
`08:00, 09:00, 10:00…`. La app nunca programa un partido en un horario que no sea de la
jornada ni encima de la duración del bloque.

---

## 5. Armar las zonas (menú Zonas)

1. **Crear zona**: poner el nombre (ej.: `Zona A`, `Zona B`) y confirmar.
2. Repetir hasta tener todas las zonas que necesite.
3. Hacer clic en **Sortear equipos sin zona**: la app reparte los equipos en las zonas de
   forma parecida. Cada zona muestra el chip `N EQUIPOS`.
4. (Opcional) Marcar un **cabeza de serie** con la estrella ★: queda fijo y no se mueve en
   un nuevo sorteo.
5. (Opcional) Marcar **Todos contra todos** en una zona si quiere que jueguen entre todos.

---

## 6. Planificación de jornadas (menú Planificación) — opcional

1. Si su torneo necesita definir **qué etapas se juegan en cada jornada**, entrar acá y
   usar **+ Configurar jornada**.
2. Si el torneo es simple (zonas + cruces), puede **saltarse este paso**.

---

## 7. Programar los partidos (menú Programación)

Este es el paso principal. Se hace en orden:

1. **Generar emparejamientos**: la app arma quién juega contra quién (aparece una
   previsualización).
2. **Confirmar emparejamientos**: los cruces pasan a estar oficiales.
3. **Programar todos los partidos**: la app les asigna **día, hora y cancha**. Al final
   muestra: `8 partido(s) programado(s).`
4. Revisar el estado en la franja superior:
   - **LISTO** = todos los partidos tienen día, hora y cancha. ✅
   - **ALERTAS** = hay partidos sin lugar. La app indica el motivo, por ejemplo:
     *“Cancha 1 ya está ocupada a las 08:00 (conflicto de cancha y horario)”* o
     *“El horario debe coincidir con un bloque válido dentro de la jornada.”*
     → Corregir lo que indique (horas, cantidad de canchas, días) y volver a pulsar
     **Programar todos los partidos**.
5. Verificar en la tabla: cada fila muestra **hora, cancha, jornada y estado**.

**Filtros y vistas**

- **Filtrar por fecha / por cancha**: para ver sólo un día o una cancha.
- **Vista por tabla** o **vista por día**: según como le resulte más cómodo.
- **Limpiar filtros**: vuelve a ver todo.

**Exportar**

- **PDF completo** → todo el fixture del torneo.
- **PDF del día filtrado** → un solo día (primero elegir el día en el filtro).
- **PDF de la cancha filtrada** → una sola cancha (primero elegir la cancha).
  Los archivos se guardan en la carpeta **Documentos** con el nombre del torneo.

> **Si después cambió el horario de las jornadas o el intervalo entre partidos:**
> 1. **Limpiar programación** (avisa cuántos partidos se desprograman; los resultados y los
>    partidos finalizados **se conservan**).
> 2. **Programar todos los partidos** de nuevo. Así todos toman la nueva configuración.

---

## 8. Formato de sets (dentro de Programación)

1. Buscar **Formato de sets**.
2. Elegir y **Guardar formato de sets**:
   - **Zonas y cruces**: normalmente `1 set × 21 puntos`.
   - **Eliminatorias**: normalmente `2 sets × 15 puntos`.
3. Esto define cómo se cargan los resultados (paso siguiente).

---

## 9. Cargar resultados (menú Resultados)

1. Elegir la categoría arriba.
2. Para el partido jugado, dos formas:
   - **Marcador rápido**: botón **“Nombre del equipo gana”** (o `2–0`, `2–1` cuando el
     formato es de 2 sets). Con un clic queda cargado y el partido se marca **finalizado**.
   - **Detalle**: botón *Editar*, escribir los puntos de cada set (`21` / `15`) y
     **Guardar sets**.
3. Con formato **2 sets × 15**: si el partido queda **1–1**, la app pide
   *“completá el tercer set (desempate)”*: cargue el tercer set y guarde.

---

## 10. Ver las posiciones (menú Posiciones)

1. Elegir la categoría. La tabla se calcula sola con los resultados cargados.
2. Cómo se ordena: **3 puntos** por ganar 2–0 (o en sets corridos), **2 puntos** por
   ganar 2–1, **1 punto** por perder; después mandan la diferencia de sets.
3. **PDF de posiciones** descarga la tabla a **Documentos**.

---

## 11. Eliminatorias (menú Eliminatorias) — si su torneo las usa

1. Cargar primero **todos** los resultados de la fase anterior (la app lo pide).
2. Usar los botones en orden: **Generar Top 16 / Top 8**, **Generar semifinales**,
   **Generar final y tercer puesto** (los que corresponda a su torneo).
3. Los partidos de eliminatoria aparecen con su etapa y se puntúan igual que el resto.

---

## 12. Imprimir

1. En la pantalla que quiera imprimir (fixture o posiciones), usar el botón de **Imprimir**
   o **PDF**.
2. La hoja sale **limpia**: sin filtros ni botones, con las **6 columnas** del fixture o la
   tabla completa, en tamaño normal (A4).
3. En pantallas chicas (tablets) la misma información se ve en **tarjetas de 2 columnas**;
   al imprimir igual sale en 6 columnas.

---

## 13. Consejos y problemas frecuentes

- **Dos equipos nunca en la misma cancha y hora**: la app lo bloquea y lo explica con un
  mensaje. Si aparece un conflicto, la solución casi siempre es: más días, más canchas o
  ampliar el horario de las jornadas, y luego *Limpiar → Programar* de nuevo.
- **Los mensajes están en español** y dicen qué falta o qué corregir: léalos antes de
  reintentar.
- **Guardar**: los datos quedan guardados en la computadora automáticamente; igual, ante
  un cambio grande (calendario, formato, programación), espere a ver el mensaje de
  confirmación antes de cerrar.
- **No borrar** archivos del programa por su cuenta; si algo falla, avise al administrador
  con la captura del mensaje de error.

---

## Resumen rápido del orden correcto

```
1. Crear torneo        →  2. Cargar categorías y equipos
→  3. Calendario (fechas, bloques, cadencia)
→  4. Zonas (crear y sortear)
→  5. Programación: emparejamientos → confirmar → programar (LISTO)
→  6. Formato de sets (1×21 / 2×15)
→  7. Resultados (cargar marcadores)
→  8. Posiciones (tabla y PDF)
→  9. Eliminatorias (si corresponde, con resultados completos)
```

Siempre en ese orden: **sin equipos no hay fixture, sin calendario no hay horarios, sin
resultados no hay posiciones.**
