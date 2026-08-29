import { LicenciaRepo } from '../data/licenseRepo.js';

const contenedorAdmin = document.getElementById('admin-list');

async function initAdminView() {
    await cargarLicencias();
}

async function cargarLicencias() {
    contenedorAdmin.innerHTML = '<p>Cargando datos...</p>';
    try {
        const licencias = await LicenciaRepo.obtenerTodas();
        renderizarLicencias(licencias);
    } catch (error) {
        contenedorAdmin.innerHTML = '<p style="color:red;">Error al cargar licencias.</p>';
    }
}

function renderizarLicencias(licencias) {
    if (!licencias || licencias.length === 0) {
        contenedorAdmin.innerHTML = '<p>No hay licencias registradas.</p>';
        return;
    }

    contenedorAdmin.innerHTML = licencias.map(lic => {
        const disponibles = lic.cupo_total - lic.cupo_utilizado;
        return `
            <div class="card" style="border: 2px solid var(--border-color);">
                <h3>Cliente: ${lic.cliente || 'Sin nombre'}</h3>
                <p>Código: <strong>${lic.codigo}</strong></p>
                <hr style="margin: 10px 0; border: 0; border-top: 1px solid var(--border-color);">
                <p>Utilizados: ${lic.cupo_utilizado}</p>
                <p>Totales autorizados: ${lic.cupo_total}</p>
                <p><strong>Disponibles: ${disponibles}</strong></p>
                <button class="btn-agregar-torneos btn-primary" style="margin-top: 15px; width: 100%;" 
                    data-id="${lic.id}" data-total="${lic.cupo_total}">
                    + Agregar Torneos
                </button>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.btn-agregar-torneos').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const licenciaId = e.target.dataset.id;
            const totalActual = parseInt(e.target.dataset.total, 10);
            const cantidad = parseInt(prompt("¿Cuántos torneos desea agregar?"), 10);
            
            if (isNaN(cantidad) || cantidad <= 0) {
                alert("Ingrese una cantidad válida.");
                return;
            }

            try {
                e.target.disabled = true;
                e.target.textContent = "Guardando...";
                await LicenciaRepo.ampliarCupo(licenciaId, totalActual, cantidad);
                alert("Torneos agregados correctamente.");
                await cargarLicencias();
            } catch (error) {
                alert("Error al actualizar la licencia.");
                e.target.disabled = false;
                e.target.textContent = "+ Agregar Torneos";
            }
        });
    });
}

initAdminView();
