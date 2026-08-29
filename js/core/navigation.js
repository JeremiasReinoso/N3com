// Control de navegación entre vistas
export const Navigation = {
    init: () => {
        document.addEventListener('click', event => {
            const button = event.target.closest('button.nav-btn[id^="btn-nav-"]');
            if (!button || button.disabled) return;
            Navigation.activate(button.id);
        });
    },
    activate: buttonId => {
        document.querySelectorAll('button.nav-btn[id^="btn-nav-"]').forEach(button => button.classList.toggle('active', button.id === buttonId));
        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        const target = document.getElementById(buttonId.replace('btn-nav-', 'view-'));
        if (target) target.classList.add('active');
    },
    habilitarMenu: () => {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.disabled = false);
    }
};
