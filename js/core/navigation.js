import { AppContext } from './state.js';

const tournamentSections = [
    ['inicio', 'Inicio'],
    ['equipos', 'Equipos'],
    ['zonas', 'Zonas'],
    ['calendario', 'Calendario'],
    ['programacion', 'Programación'],
    ['resultados', 'Resultados'],
    ['posiciones', 'Posiciones'],
    ['eliminatorias', 'Eliminatorias']
];

const activateView = viewId => {
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
};

const renderTournamentNavigation = (section, onSectionChange) => {
    const nav = document.getElementById('main-nav');
    const header = document.querySelector('.app-header');
    if (!nav) return;

    nav.hidden = false;
    header?.classList.add('tournament-open');
    nav.innerHTML = tournamentSections.map(([id, label]) =>
        `<button type="button" id="btn-nav-${id}" class="nav-btn${id === section ? ' active' : ''}" data-section="${id}">${label}</button>`
    ).join('');
    nav.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
        if (!button.disabled) onSectionChange(button.dataset.section);
    }));
};

const renderTournamentListNavigation = () => {
    const nav = document.getElementById('main-nav');
    const header = document.querySelector('.app-header');
    if (nav) {
        nav.innerHTML = '';
        nav.hidden = true;
    }
    header?.classList.remove('tournament-open');
};

export const Navigation = {
    render: ({ context, section, onSectionChange }) => {
        if (context === AppContext.TOURNAMENT) {
            renderTournamentNavigation(section, onSectionChange);
            return;
        }
        renderTournamentListNavigation();
    },
    activateView,
    habilitarMenu: () => {
        document.querySelectorAll('#main-nav .nav-btn').forEach(button => { button.disabled = false; });
    }
};
