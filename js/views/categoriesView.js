import { DataManager } from '../data/dataManager.js';

export const initCategoriasView = () => {
    const torneo = DataManager.getCurrentTournament();
    if (!torneo) {
        alert("Seleccione un torneo primero");
        return;
    }

    const categorias = DataManager.getCategoriesByTournament(torneo.id);

    let html = `
    <div class="view-section" id="view-categorias">
        <div class="container">
            <h2>Categorías - ${torneo.nombre}</h2>
            
            <div class="form-group">
                <input type="text" id="categoria-nombre" placeholder="Nombre de categoría" required />
                <button class="btn-primary" onclick="createCategory()">Agregar Categoría</button>
            </div>

            ${categorias.length > 0 ? `
                <div class="categorias-list">
                    ${categorias.map(c => `
                        <div class="tarjeta categoria-card" data-id="${c.id}">
                            <h3>${c.nombre}</h3>
                            <button class="btn-ver btn-small" data-id="${c.id}">Ver</button>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <p>Aún no hay categorías en este torneo.</p>
            `}

            <button class="btn-primary" onclick="openCreateCategory()">+ Nueva Categoría</button>
        </div>
    </div>`;

    document.getElementById('app').innerHTML = html;

    // Manejar ver categoría
    document.querySelectorAll('.btn-ver').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            DataManager.setCurrentCategory(id);
            initTeamsView();
        });
    });
};

const createCategory = () => {
    const nombre = document.getElementById('categoria-nombre').value;
    if (!nombre) {
        alert("Ingrese un nombre de categoría");
        return;
    }
    DataManager.createCategory(nombre, DataManager.getCurrentTournament().id);
    closeCreateCategory();
    initCategoriasView();
};

const openCreateCategory = () => {
    document.getElementById('modal-create-category').style.display = 'block';
};

const closeCreateCategory = () => {
    document.getElementById('modal-create-category').style.display = 'none';
};