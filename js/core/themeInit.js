try {
    document.documentElement.dataset.theme = localStorage.getItem('newcom_theme') === 'light' ? 'light' : 'dark';
} catch {
    document.documentElement.dataset.theme = 'dark';
}
