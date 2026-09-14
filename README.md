# NEWCOM 2026

## Ejecución local

Esta versión usa sólo archivos locales. Iniciá la aplicación desde la carpeta
del proyecto con:

```powershell
node server.js
```

Luego abrí `http://127.0.0.1:4173`. Las licencias se guardan exclusivamente en
`private/licenses.json`; el directorio está excluido de Git. Abrir `index.html`
directamente no habilita la gestión de licencias, porque un navegador no puede
escribir archivos locales por sí solo.
