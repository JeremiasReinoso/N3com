// Se ejecuta dentro de la página (Electron) después de borrar el torneo de la
// prueba. Reproduce el flujo real de créditos: queda uno disponible, crear un
// torneo desde el formulario consume ese crédito, aparece el aviso de licencia
// y borrar el torneo no devuelve créditos (regla de licencia vigente).
(async () => {
    const report = { alerts: [], errors: [] };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const count = selector => document.querySelectorAll(selector).length;
    const text = selector => (document.querySelector(selector)?.textContent || '').trim();

    window.addEventListener('error', event => report.errors.push(String(event.message || event.error || 'error')));
    window.addEventListener('unhandledrejection', event => report.errors.push(String(event.reason)));
    window.alert = message => report.alerts.push(String(message));
    window.confirm = () => true;

    const { LicenciaRepo } = await import('/js/data/licenseRepo.js');
    const { DataManager } = await import('/js/data/dataManager.js');
    const { initTorneosVer } = await import('/js/views/tournamentsView.js');
    const credits = async () => LicenciaRepo.disponible(await LicenciaRepo.obtenerActiva());

    let remaining = await credits();
    for (let index = 1; index < remaining; index++) await LicenciaRepo.consumirTorneo();

    await initTorneosVer();
    await wait(400);
    const submit = document.querySelector('#form-nuevo-torneo button[type="submit"]');
    report.beforeCreate = {
        remaining: await credits(),
        chip: text('.form-title .calendar-chip'),
        createDisabled: submit ? submit.disabled : null,
        warning: count('.license-credit-warning'),
        cards: count('.torneo-card')
    };

    document.querySelector('#torneo-nombre').value = 'Copa Verificación';
    document.querySelector('#torneo-partidos').value = '3';
    document.querySelector('#form-nuevo-torneo').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await wait(800);
    const submitAfter = document.querySelector('#form-nuevo-torneo button[type="submit"]');
    report.afterCreate = {
        remaining: await credits(),
        chip: text('.form-title .calendar-chip'),
        createDisabled: submitAfter ? submitAfter.disabled : null,
        warning: count('.license-credit-warning'),
        warningText: text('.license-credit-warning'),
        cards: count('.torneo-card'),
        tournaments: DataManager.getTournaments().map(item => item.nombre),
        alerts: report.alerts.slice()
    };

    document.querySelector('.eliminar-torneo')?.click();
    await wait(700);
    report.afterDelete = {
        remaining: await credits(),
        chip: text('.form-title .calendar-chip'),
        warning: count('.license-credit-warning'),
        cards: count('.torneo-card'),
        tournaments: DataManager.getTournaments().length,
        empty: text('#torneos-list'),
        alerts: report.alerts.slice()
    };

    return report;
})()
