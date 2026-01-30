document.addEventListener('DOMContentLoaded', () => {
    const navVideo = document.getElementById('nav-video');
    const navFolder = document.getElementById('nav-folder');
    const dropZone = document.getElementById('drop-zone');
    const folderDropZone = document.getElementById('folder-drop-zone');
    const fileDashboard = document.getElementById('file-dashboard');
    const progressView = document.getElementById('progress-view');
    const completeView = document.getElementById('complete-view');
    function hideAllViews() {
        if (dropZone) dropZone.classList.add('hidden');
        if (folderDropZone) folderDropZone.classList.add('hidden');
        if (fileDashboard) fileDashboard.classList.add('hidden');
        if (progressView) progressView.classList.add('hidden');
        if (completeView) completeView.classList.add('hidden');
    }
    function resetNav() {
        if (navVideo) navVideo.classList.remove('active');
        if (navFolder) navFolder.classList.remove('active');
    }
    if (navVideo) {
        navVideo.addEventListener('click', () => {
            resetNav();
            navVideo.classList.add('active');
            hideAllViews();
            if (dropZone) dropZone.classList.remove('hidden');
        });
    }
    if (navFolder) {
        navFolder.addEventListener('click', () => {
            resetNav();
            navFolder.classList.add('active');
            hideAllViews();
            if (folderDropZone) {
                folderDropZone.classList.remove('hidden');
            }
        });
    }
});