try {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.sidebar = localStorage.getItem('n3com_sidebar_collapsed') === 'true' ? 'collapsed' : 'expanded';
} catch {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.sidebar = 'expanded';
}
