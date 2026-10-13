document.addEventListener('DOMContentLoaded', () => {
    // 1. Handle Mobile Sidebar Toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');

    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });

        // Close sidebar if clicking outside on mobile
        document.addEventListener('click', (event) => {
            if (window.innerWidth <= 900) {
                if (!sidebar.contains(event.target) && !menuBtn.contains(event.target)) {
                    sidebar.classList.remove('mobile-open');
                }
            }
        });
    }

    // 2. Automatically highlight the active sidebar link based on URL path
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.sidebar-nav ul li a');
    
    navLinks.forEach(link => {
        const linkPath = link.dataset.path;

        if(linkPath == '/'){
            if(currentPath == "/"){
                link.classList.add("active");
            }
        } else{
            if(linkPath !== '#' && currentPath.includes(`/${linkPath}`)){
                link.classList.add("active");
            }
        }
    });
});
