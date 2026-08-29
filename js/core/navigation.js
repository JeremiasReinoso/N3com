// Control de navegación entre vistas
export const Navigation = {
    init: () => {
        const buttons = document.querySelectorAll('button.nav-btn[id^="btn-nav-"]');
        const views = document.querySelectorAll('.view-section');

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                if (button.disabled) return;

                buttons.forEach(item => item.classList.remove('active'));
                views.forEach(view => view.classList.remove('active'));
                button.classList.add('active');

                const target = document.getElementById(button.id.replace('btn-nav-', 'view-'));
                if (target) target.classList.add('active');
            });
        });
    },
    habilitarMenu: () => {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.disabled = false);
    }
};
