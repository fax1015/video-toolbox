// Constants and configuration for Video Toolbox

export const APP_SETTINGS_KEY = 'video_toolbox_settings';
export const MAX_QUEUE_SIZE = 500;

export const DEFAULT_SETTINGS = {
    hwAccel: 'auto',
    outputSuffix: '_encoded',
    defaultFormat: 'mp4',
    theme: 'dark',
    accentColor: 'green',
    workPriority: 'normal',
    outputFolder: '',
    overwriteFiles: false,
    notifyOnComplete: true,
    showBlobs: true,
    skeuoMode: false,
    cpuThreads: 0,
    pinnedApps: ['converter', 'folder', 'trim', 'extract-audio']
};

export const ACCENT_COLORS = {
    green: { primary: '#52d698', secondary: '#51d497' },
    blue: { primary: '#60a5fa', secondary: '#3b82f6' },
    purple: { primary: '#a78bfa', secondary: '#8b5cf6' },
    pink: { primary: '#f472b6', secondary: '#ec4899' },
    orange: { primary: '#fb923c', secondary: '#f97316' },
    red: { primary: '#f87171', secondary: '#ef4444' },
    cyan: { primary: '#22d3ee', secondary: '#06b6d4' }
};

export const BUILT_IN_PRESETS = {
    // General
    'general-fast-480p': { label: 'Fast 480p', format: 'mp4', codec: 'h264', preset: 'veryfast', crf: 26, resolution: '480p', fps: 'source', audioCodec: 'aac', audioBitrate: '96k', twoPass: false },
    'general-fast-720p': { label: 'Fast 720p', format: 'mp4', codec: 'h264', preset: 'fast', crf: 23, resolution: '720p', fps: 'source', audioCodec: 'aac', audioBitrate: '128k', twoPass: false },
    'general-hq-720p': { label: 'HQ 720p', format: 'mp4', codec: 'h264', preset: 'medium', crf: 20, resolution: '720p', fps: 'source', audioCodec: 'aac', audioBitrate: '128k', twoPass: false },
    'general-hq-1080p': { label: 'HQ 1080p', format: 'mp4', codec: 'h264', preset: 'slow', crf: 20, resolution: '1080p', fps: 'source', audioCodec: 'aac', audioBitrate: '192k', twoPass: false },

    // Web
    'web-discord-small': { label: 'Discord (Small)', format: 'mp4', codec: 'h264', preset: 'medium', crf: 30, resolution: '480p', fps: '30', audioCodec: 'aac', audioBitrate: '64k', twoPass: false },
    'web-social-720p': { label: 'Social Media 720p', format: 'mp4', codec: 'h264', preset: 'medium', crf: 24, resolution: '720p', fps: '30', audioCodec: 'aac', audioBitrate: '128k', twoPass: false },
    'web-email-360p': { label: 'Email / Small 360p', format: 'mp4', codec: 'h264', preset: 'veryfast', crf: 32, resolution: '360p', fps: '24', audioCodec: 'aac', audioBitrate: '64k', twoPass: false },
    'web-youtube-4k': { label: 'YouTube 4K', format: 'mp4', codec: 'vp9', preset: 'medium', crf: 28, resolution: '2160p', fps: '60', audioCodec: 'opus', audioBitrate: '320k', twoPass: false },

    // Devices
    'device-old-phone-480p': { label: 'Old Phone 480p', format: 'mp4', codec: 'h264', preset: 'fast', crf: 24, resolution: '480p', fps: '30', audioCodec: 'aac', audioBitrate: '128k', twoPass: false },
    'device-tablet-1080p': { label: 'Tablet 1080p', format: 'mp4', codec: 'h264', preset: 'medium', crf: 21, resolution: '1080p', fps: 'source', audioCodec: 'aac', audioBitrate: '160k', twoPass: false },

    // Matroska
    'mkv-h265-hq': { label: 'H.265 MKV HQ', format: 'mkv', codec: 'h265', preset: 'slow', crf: 20, resolution: 'source', fps: 'source', audioCodec: 'aac', audioBitrate: '320k', twoPass: false },
    'mkv-h264-universal': { label: 'H.264 MKV Universal', format: 'mkv', codec: 'h264', preset: 'medium', crf: 23, resolution: 'source', fps: 'source', audioCodec: 'aac', audioBitrate: '128k', twoPass: false },
    'mkv-archive-av1': { label: 'AV1 Archive', format: 'mkv', codec: 'av1', preset: 'medium', crf: 30, resolution: 'source', fps: 'source', audioCodec: 'opus', audioBitrate: '160k', twoPass: false },

    // Production
    'production-proxy-360p': { label: 'Proxy (Editing) 360p', format: 'mov', codec: 'h264', preset: 'ultrafast', crf: 28, resolution: '360p', fps: 'source', audioCodec: 'pcm_s16le', audioBitrate: 'auto', twoPass: false },
    'production-master': { label: 'Master (Source Res)', format: 'mov', codec: 'h264', preset: 'medium', crf: 12, resolution: 'source', fps: 'source', audioCodec: 'pcm_s16le', audioBitrate: 'auto', twoPass: false }
};

export const TOOL_REGISTRY = [
    {
        id: 'converter',
        name: 'Video Converter',
        description: 'Convert videos to different formats with custom settings.',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`,
        viewId: 'drop-zone',
        navId: 'nav-video',
        action: 'view'
    },
    {
        id: 'folder',
        name: 'Batch Folders',
        description: 'Process entire directories of videos automatically.',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
        viewId: 'folder-drop-zone',
        navId: 'nav-folder',
        action: 'view'
    },
    {
        id: 'trim',
        name: 'Trim Video',
        description: 'Cut and trim video clips without re-encoding (where possible).',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        viewId: 'trim-drop-zone',
        navId: 'nav-trim',
        action: 'view'
    },
    {
        id: 'extract-audio',
        name: 'Extract Audio',
        description: 'Extract audio tracks from video files instantly.',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
        viewId: 'extract-audio-drop-zone',
        navId: 'nav-extract-audio',
        action: 'view'
    },
    {
        id: 'image-to-pdf',
        name: 'Image to PDF',
        description: 'Combine multiple images into a single PDF document.',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><rect x="7" y="11" width="10" height="7" rx="1"></rect><circle cx="10" cy="14" r="1"></circle><path d="M17 18l-3-3-3 3"></path></svg>`,
        viewId: 'image-to-pdf-drop-zone',
        navId: 'nav-image-to-pdf',
        action: 'view'
    },
    {
        id: 'inspector',
        name: 'Media Inspector',
        description: 'View detailed technical metadata for any media file.',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`,
        viewId: 'inspector-drop-zone',
        navId: 'nav-inspector',
        action: 'view'
    },
    {
        id: 'downloader',
        name: 'Video/Audio Downloader',
        description: 'Download videos and audio from URLs with quality selection.',
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
        viewId: 'downloader-dashboard',
        navId: 'nav-downloader',
        action: 'view'
    }
];
