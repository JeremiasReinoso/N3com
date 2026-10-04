// Se ejecuta dentro de la página al final del recorrido: vuelve a la lista de
// torneos y usa el botón "Eliminar" para borrar el torneo de la prueba.
(async () => {
    const report = { errors: [] };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const count = selector => document.querySelectorAll(selector).length;
    const text = selector => (document.querySelector(selector)?.textContent || '').trim();

    window.addEventListener('error', event => report.errors.push(String(event.message || event.error || 'error')));
    window.alert = message => report.errors.push(`alert: ${message}`);
    window.confirm = () => true;

    location.hash = '#/torneos';
    await wait(900);
    report.listBefore = count('.torneo-card');
    const remove = document.querySelector('.eliminar-torneo');
    report.removeLabel = (remove?.textContent || '').trim();
    remove?.click();
    await wait(700);
    report.listAfter = count('.torneo-card');
    report.tournamentsLeft = JSON.parse(localStorage.getItem('newcom_data')).tournaments.length;
    report.emptyMessage = text('#torneos-list');
    return report;
})()
