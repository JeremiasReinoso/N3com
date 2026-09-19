// Control de navegación entre vistas
const activate = buttonId => {
    const buttons = document.querySelectorAll('button.nav-btn[id^="btn-nav-"]');
    const views = document.querySelectorAll('.view-section');
    const button = document.getElementById(buttonId);
    buttons.forEach(item => item.classList.remove('active'));
    views.forEach(view => view.classList.remove('active'));
    button?.classList.add('active');
    document.getElementById(buttonId.replace('btn-nav-', 'view-'))?.classList.add('active');
};

export const Navigation = {
    init: () => {
        document.querySelectorAll('button.nav-btn[id^="btn-nav-"]').forEach(button => {
            button.addEventListener('click', () => {
                if (!button.disabled) activate(button.id);
            });
        });
    },
    activate,
    habilitarMenu: () => {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.disabled = false);
    }
};
