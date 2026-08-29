// Control de navegación entre vistas
export const Navigation = {
    init: () => {
        const buttons = document.querySelectorAll('button.nav-btn[id^="btn-nav-"]');
        const views = document.querySelectorAll('.view-section');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;

                buttons.forEach(b => b.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));

                btn.classList.add('active');
                const targetId = btn.id.replace('btn-nav-', 'view-');
                const target = document.getElementById(targetId);
                if (target) target.classList.add('active');
            });
        });
    },
    habilitarMenu: () => {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.disabled = false);
    }
};
