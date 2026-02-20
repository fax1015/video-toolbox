// Main entry point for Video Toolbox renderer
// This imports modularized code and initializes the application

import { DEFAULT_SETTINGS, ACCENT_COLORS, BUILT_IN_PRESETS, TOOL_REGISTRY, APP_SETTINGS_KEY } from './constants.js';
import { get, showPopup, showConfirm, setupCustomSelects, showView, toggleSidebar, resetNav, resetProgress, renderAudioTracks, renderSubtitleTracks, updateTextContent, renderLoaders, setupAnimatedNumbers } from './modules/ui-utils.js';

const electron = window.api;
import { addToQueue, updateQueueUI, updateQueueProgress, renderQueue, processQueue, updateQueueStatusUI, setupQueueHandlers } from './modules/queue.js';
import { setupEncoderHandlers, handleFileSelection, handleFolderSelection, getOptionsFromUI, applyOptionsToUI, updateEstFileSize } from './modules/encoder.js';
import { setupAppsHandlers } from './modules/apps.js';
import { setupImageToPdfHandlers, clearImages as clearImageToPdf } from './modules/image-to-pdf.js';
import * as state from './modules/state.js';

let downloaderModulePromise = null;
let downloaderInitialized = false;

async function loadDownloader() {
    if (!downloaderModulePromise) {
        downloaderModulePromise = import('./modules/downloader.js').then((mod) => {
            if (!downloaderInitialized) {
                mod.setupDownloaderHandlers();
                downloaderInitialized = true;
            }
            return mod;
        }).catch((err) => {
            downloaderModulePromise = null;
            if (window.api?.logError) window.api.logError('Failed to load downloader module', err); else console.error('Failed to load downloader module', err);
            showPopup('Failed to load downloader.');
            throw err;
        });
    }
    return downloaderModulePromise;
}

let trimmerModulePromise = null;
let trimmerInitialized = false;

async function loadTrimmer() {
    if (!trimmerModulePromise) {
        trimmerModulePromise = import('./modules/trimmer.js').then((mod) => {
            if (!trimmerInitialized) {
                mod.setupTrimmerHandlers();
                trimmerInitialized = true;
            }
            return mod;
        }).catch((err) => {
            trimmerModulePromise = null;
            if (window.api?.logError) window.api.logError('Failed to load trimmer module', err); else console.error('Failed to load trimmer module', err);
            showPopup('Failed to load trimmer.');
            throw err;
        });
    }
    return trimmerModulePromise;
}

let extractAudioModulePromise = null;
let extractAudioInitialized = false;

const UPDATE_REPO = { owner: 'fax1015', name: 'video-toolbox' };
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO.owner}/${UPDATE_REPO.name}/releases/latest`;
const UPDATE_PAGE_URL = `https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.name}/releases/latest`;
const UPDATE_BADGE_DELAY_MS = 2500;
const UPDATE_BADGE_VISIBLE_MS = 3500;
const UPDATE_BADGE_TRANSITION_MS = 1300;

const updateBadgeTimers = new WeakMap();

const normalizeVersion = (version) => {
    if (!version) return null;
    const trimmed = version.trim().replace(/^v/i, '');
    const main = trimmed.split('-')[0];
    if (!/^\d+(\.\d+)*$/.test(main)) return null;
    return main;
};

const compareVersions = (a, b) => {
    const aParts = a.split('.').map((part) => parseInt(part, 10));
    const bParts = b.split('.').map((part) => parseInt(part, 10));
    const maxParts = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < maxParts; i += 1) {
        const aVal = aParts[i] ?? 0;
        const bVal = bParts[i] ?? 0;
        if (aVal > bVal) return 1;
        if (aVal < bVal) return -1;
    }
    return 0;
};

const fetchLatestReleaseVersion = async () => {
    const response = await fetch(UPDATE_API_URL, {
        headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.tag_name || data?.name || null;
};

const clearUpdateBadgeTimers = (updateBadge) => {
    if (!updateBadge) return;
    const timers = updateBadgeTimers.get(updateBadge);
    if (timers) timers.forEach((timerId) => clearTimeout(timerId));
    updateBadgeTimers.set(updateBadge, []);
};

const showUpdateBadge = (updateBadge) => {
    if (!updateBadge) return;
    updateBadge.classList.remove('is-hidden');
    requestAnimationFrame(() => {
        updateBadge.classList.add('is-visible');
    });
};

const hideUpdateBadge = (updateBadge) => {
    if (!updateBadge) return;
    updateBadge.classList.remove('is-visible');
    const hideTimer = setTimeout(() => {
        updateBadge.classList.add('is-hidden');
    }, UPDATE_BADGE_TRANSITION_MS);
    const timers = updateBadgeTimers.get(updateBadge) || [];
    timers.push(hideTimer);
    updateBadgeTimers.set(updateBadge, timers);
};

const showTemporaryBadge = (updateBadge, message) => {
    if (!updateBadge) return;
    clearUpdateBadgeTimers(updateBadge);
    updateBadge.textContent = message;
    updateBadge.classList.remove('update-available', 'is-visible');
    updateBadge.classList.add('is-hidden');

    const timers = [];
    const showTimer = setTimeout(() => {
        showUpdateBadge(updateBadge);
        const hideTimer = setTimeout(() => {
            hideUpdateBadge(updateBadge);
        }, UPDATE_BADGE_VISIBLE_MS);
        timers.push(hideTimer);
    }, UPDATE_BADGE_DELAY_MS);
    timers.push(showTimer);
    updateBadgeTimers.set(updateBadge, timers);
};

const checkForUpdates = async (currentVersion, updateBadge) => {
    if (!currentVersion || !updateBadge) return 'unknown';
    clearUpdateBadgeTimers(updateBadge);
    const latestRaw = await fetchLatestReleaseVersion();
    const latest = normalizeVersion(latestRaw);
    const current = normalizeVersion(currentVersion);
    if (!latest || !current) return 'unknown';
    if (compareVersions(latest, current) > 0) {
        updateBadge.textContent = `Update v${latest} available`;
        updateBadge.title = 'Open the latest release';
        updateBadge.classList.add('update-available');
        updateBadge.classList.remove('is-hidden');
        showUpdateBadge(updateBadge);
        return 'update';
    }
    return 'current';
};

async function loadExtractAudio() {
    if (!extractAudioModulePromise) {
        extractAudioModulePromise = import('./modules/extract-audio.js').then((mod) => {
            if (!extractAudioInitialized) {
                mod.setupExtractAudioHandlers();
                extractAudioInitialized = true;
            }
            return mod;
        }).catch((err) => {
            extractAudioModulePromise = null;
            if (window.api?.logError) window.api.logError('Failed to load extract audio module', err); else console.error('Failed to load extract audio module', err);
            showPopup('Failed to load extract audio.');
            throw err;
        });
    }
    return extractAudioModulePromise;
}

let inspectorModulePromise = null;
let inspectorInitialized = false;

async function loadInspector() {
    if (!inspectorModulePromise) {
        inspectorModulePromise = import('./modules/inspector.js').then((mod) => {
            if (!inspectorInitialized) {
                mod.setupInspectorHandlers();
                inspectorInitialized = true;
            }
            return mod;
        }).catch((err) => {
            inspectorModulePromise = null;
            if (window.api?.logError) window.api.logError('Failed to load inspector module', err); else console.error('Failed to load inspector module', err);
            showPopup('Failed to load inspector.');
            throw err;
        });
    }
    return inspectorModulePromise;
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.api?.logInfo) window.api.logInfo('Renderer initialized'); else console.log('Renderer initialized');

    renderLoaders();
    setupAnimatedNumbers();

    const appVersionEl = get('app-version');
    const headerAppVersionEl = get('header-app-version');

    // Window Controls
    const minBtn = document.getElementById('min-btn');
    const maxBtn = document.getElementById('max-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minBtn) minBtn.addEventListener('click', () => window.api.minimize());
    if (maxBtn) maxBtn.addEventListener('click', () => window.api.toggleMaximize());
    if (closeBtn) closeBtn.addEventListener('click', () => window.api.close());

    const updateBadge = get('update-badge');
    if (updateBadge && window.api?.openExternal) {
        updateBadge.addEventListener('click', () => {
            window.api.openExternal(UPDATE_PAGE_URL);
        });
    }

    // Report a Bug button - opens GitHub issues page
    const reportBugBtn = get('report-bug-btn');
    if (reportBugBtn && window.api?.openExternal) {
        reportBugBtn.addEventListener('click', () => {
            window.api.openExternal(`https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.name}/issues`);
        });
    }
    if ((appVersionEl || headerAppVersionEl) && window.api?.getAppVersion) {
        window.api.getAppVersion().then((version) => {
            if (version) {
                if (appVersionEl) appVersionEl.textContent = `v${version}`;
                if (headerAppVersionEl) headerAppVersionEl.textContent = `v${version}`;
                checkForUpdates(version, updateBadge).then((status) => {
                    if (!updateBadge) return;
                    if (status === 'current') {
                        showTemporaryBadge(updateBadge, 'Up to date');
                    } else if (status === 'unknown') {
                        updateBadge.classList.remove('update-available');
                        updateBadge.classList.add('hidden');
                    }
                }).catch((err) => {
                    if (updateBadge) {
                        updateBadge.classList.remove('update-available');
                        updateBadge.classList.add('hidden');
                    }
                    if (window.api?.logWarn) window.api.logWarn('Update check failed', err); else console.warn('Update check failed', err);
                });
            }
        }).catch(() => {
            // Ignore version lookup errors and keep default text
        });
    }

    // Initialize app settings from defaults
    state.setAppSettings({ ...DEFAULT_SETTINGS });

    window.getOptionsFromUI = getOptionsFromUI;

    // DOM element references (keeping centralized for now)
    const dropZone = get('drop-zone');
    const folderDropZone = get('folder-drop-zone');
    const extractAudioDropZone = get('extract-audio-drop-zone');
    const extractAudioDashboard = get('extract-audio-dashboard');
    const trimDropZone = get('trim-drop-zone');
    const trimDashboard = get('trim-dashboard');
    const dashboard = get('file-dashboard');
    const progressView = get('progress-view');
    const completeView = get('complete-view');
    const settingsView = get('settings-view');
    const queueView = get('queue-view');

    const filenameEl = get('filename');
    const resolutionEl = get('file-resolution');
    const durationEl = get('file-duration');
    const bitrateEl = get('file-bitrate');
    const fileIcon = get('file-icon');

    const backBtn = get('back-btn');
    const settingsBackBtn = get('settings-back-btn');
    const convertBtn = get('convert-btn');
    const cancelBtn = get('cancel-btn');

    const formatSelect = get('format-select');
    const codecSelect = get('codec-select');
    const presetSelect = get('preset-select');
    const audioSelect = get('audio-select');
    const crfSlider = get('crf-slider');
    const crfValue = get('crf-value');
    const audioBitrateSelect = get('audio-bitrate');

    const progressPercent = get('progress-percent');
    const progressRing = get('progress-ring');
    const progressTitle = get('progress-title');
    const timeElapsed = get('time-elapsed');
    const encodeSpeed = get('encode-speed');
    const progressFilename = get('progress-filename');
    const timePosition = get('time-position');
    const completeTitle = get('complete-title');

    const outputPathEl = get('output-path');
    const openFileBtn = get('open-file-btn');
    const openFolderBtn = get('open-folder-btn');
    const newEncodeBtn = get('new-encode-btn');

    const navVideo = get('nav-video');
    const navFolder = get('nav-folder');
    const navTrim = get('nav-trim');
    const navExtractAudio = get('nav-extract-audio');
    const navSettings = get('nav-settings');
    const navQueue = get('nav-queue');
    const navApps = get('nav-apps');
    const navDownloader = get('nav-downloader');
    const navInspector = get('nav-inspector');

    const appsDashboard = get('apps-dashboard');

    const addQueueBtn = get('add-queue-btn');

    const hwAccelSelect = get('hw-accel');
    const outputSuffixInput = get('output-suffix');
    const defaultFormatSelect = get('default-format');
    const themeSelectAttr = get('theme-select');
    const accentColorSelect = get('accent-color-select');
    const workPrioritySelect = get('work-priority-select');
    const cpuThreadsInput = get('cpu-threads');
    const outputFolderInput = get('output-folder');
    const selectOutputFolderBtn = get('select-output-folder-btn');
    const overwriteFilesCheckbox = get('overwrite-files');
    const notifyOnCompleteCheckbox = get('notify-on-complete');
    const hwAutoTag = get('hw-auto-tag');
    const showBlobsCheckbox = get('show-blobs');
    const toggleAdvancedBtn = get('toggle-advanced-btn');
    const advancedPanel = get('advanced-panel');
    const customFfmpegArgs = get('custom-ffmpeg-args');
    const revertVideoBtn = get('revert-video-btn');
    const resolutionSelect = get('resolution-select');
    const fpsSelect = get('fps-select');
    const vBitrateInput = get('v-bitrate');
    const twoPassCheckbox = get('two-pass');
    const crfContainer = get('crf-container');
    const bitrateContainer = get('bitrate-container');
    const addAudioBtn = get('add-audio-btn');
    const audioTrackList = get('audio-track-list');
    const subtitleDropZone = get('subtitle-drop-zone');
    const subtitleTrackList = get('subtitle-track-list');
    const chapterImportZone = get('chapter-import-zone');
    const chaptersInfo = get('chapters-info');
    const chaptersFilename = get('chapters-filename');
    const removeChaptersBtn = get('remove-chapters-btn');
    const estFileSizeEl = get('est-file-size');

    const presetMenuBtn = get('preset-menu-btn');
    const presetDropdown = get('preset-dropdown');
    const currentPresetName = get('current-preset-name');
    const customPresetsList = get('custom-presets-list');
    const savePresetBtn = get('save-preset-btn');

    const sidebar = document.querySelector('.app-sidebar');
    const sidebarIndicator = document.querySelector('.sidebar-active-indicator');

    const updateSidebarIndicator = () => {
        if (!sidebar || !sidebarIndicator) return;
        const activeButton = sidebar.querySelector('.nav-item.active');
        if (!activeButton) {
            sidebarIndicator.style.opacity = '0';
            return;
        }

        const sidebarRect = sidebar.getBoundingClientRect();
        const activeRect = activeButton.getBoundingClientRect();
        const indicatorHeight = sidebarIndicator.offsetHeight || 24;

        // Check if the active button is in the sidebar-bottom section (always visible)
        const sidebarBottom = sidebar.querySelector('.sidebar-bottom');
        const isInBottomSection = sidebarBottom && sidebarBottom.contains(activeButton);

        let isVisible = true;

        if (!isInBottomSection) {
            // Only check scroll visibility if not in bottom section
            const scrollContainer = sidebar.querySelector('.sidebar-nav-scroll');
            if (scrollContainer) {
                const scrollRect = scrollContainer.getBoundingClientRect();
                // Check if active button is within the scroll container's visible bounds
                isVisible = activeRect.top >= scrollRect.top - 5 &&
                    activeRect.bottom <= scrollRect.bottom + 5;
            }
        }

        if (!isVisible) {
            sidebarIndicator.style.opacity = '0';
            return;
        }

        // Calculate position relative to sidebar, accounting for scroll
        const nextTop = activeRect.top - sidebarRect.top + (activeRect.height - indicatorHeight) / 2;

        sidebarIndicator.style.transform = `translateY(${Math.max(nextTop, 0)}px)`;
        sidebarIndicator.style.opacity = '1';
    };

    const scheduleSidebarIndicatorUpdate = () => {
        requestAnimationFrame(updateSidebarIndicator);
    };

    // Check for Tauri API bridge
    if (!window.api) {
        if (window.api?.logError) window.api.logError('Tauri API bridge not found! Check preload script configuration.'); else console.error('Tauri API bridge not found! Check preload script configuration.');
        return;
    }

    const { api } = window;

    // ==================== SETTINGS MANAGEMENT ====================
    function loadSettings() {
        const saved = localStorage.getItem(APP_SETTINGS_KEY);
        if (saved) {
            try {
                state.setAppSettings({ ...state.appSettings, ...JSON.parse(saved) });
            } catch (e) {
                if (window.api?.logError) window.api.logError('Error parsing settings', e); else console.error('Error parsing settings', e);
            }
        }
        applySettings();
    }

    function saveSettings() {
        if (state.isApplyingSettings) return;

        if (hwAccelSelect) {
            const selected = hwAccelSelect.value;
            state.appSettings.hwAccel = selected === 'auto' ? 'auto' : selected;
        }

        if (outputSuffixInput) state.appSettings.outputSuffix = outputSuffixInput.value;
        if (defaultFormatSelect) state.appSettings.defaultFormat = defaultFormatSelect.value;
        if (themeSelectAttr) state.appSettings.theme = themeSelectAttr.value;
        if (accentColorSelect) state.appSettings.accentColor = accentColorSelect.value;
        if (workPrioritySelect) state.appSettings.workPriority = workPrioritySelect.value;
        if (outputFolderInput) state.appSettings.outputFolder = outputFolderInput.value;
        if (overwriteFilesCheckbox) state.appSettings.overwriteFiles = overwriteFilesCheckbox.checked;
        if (notifyOnCompleteCheckbox) state.appSettings.notifyOnComplete = notifyOnCompleteCheckbox.checked;
        if (showBlobsCheckbox) state.appSettings.showBlobs = showBlobsCheckbox.checked;
        if (cpuThreadsInput) state.appSettings.cpuThreads = parseInt(cpuThreadsInput.value) || 0;

        if (!state.appSettings.pinnedApps) state.appSettings.pinnedApps = ['converter', 'folder', 'trim', 'extract-audio'];

        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(state.appSettings));
        applySettings();
    }

    function applySettings() {
        state.setApplyingSettings(true);
        try {
            if (hwAccelSelect) {
                if (state.appSettings.hwAccel === 'auto') {
                    hwAccelSelect.value = 'auto';
                    hwAccelSelect.dataset.auto = 'true';
                } else {
                    hwAccelSelect.value = state.appSettings.hwAccel;
                    delete hwAccelSelect.dataset.auto;
                }
            }
            if (outputSuffixInput) outputSuffixInput.value = state.appSettings.outputSuffix;
            if (defaultFormatSelect) defaultFormatSelect.value = state.appSettings.defaultFormat;
            if (themeSelectAttr) themeSelectAttr.value = state.appSettings.theme || 'default';
            if (accentColorSelect) accentColorSelect.value = state.appSettings.accentColor;
            if (workPrioritySelect) workPrioritySelect.value = state.appSettings.workPriority;
            if (outputFolderInput) outputFolderInput.value = state.appSettings.outputFolder;
            if (overwriteFilesCheckbox) overwriteFilesCheckbox.checked = state.appSettings.overwriteFiles;
            if (notifyOnCompleteCheckbox) notifyOnCompleteCheckbox.checked = state.appSettings.notifyOnComplete;
            if (showBlobsCheckbox) showBlobsCheckbox.checked = (state.appSettings.showBlobs !== false);
            if (cpuThreadsInput) cpuThreadsInput.value = state.appSettings.cpuThreads || 0;

            document.body.classList.toggle('no-blobs', state.appSettings.showBlobs === false);

            document.body.classList.remove('oled-theme', 'light-theme', 'high-contrast-theme');
            if (state.appSettings.theme === 'oled') document.body.classList.add('oled-theme');
            if (state.appSettings.theme === 'light') document.body.classList.add('light-theme');
            if (state.appSettings.theme === 'high-contrast') document.body.classList.add('high-contrast-theme');

            if (themeSelectAttr) {
                themeSelectAttr.value = state.appSettings.theme;
                themeSelectAttr.dispatchEvent(new Event('change'));
            }

            if (accentColorSelect) {
                accentColorSelect.disabled = (state.appSettings.theme === 'high-contrast');
                accentColorSelect.dispatchEvent(new Event('change'));
            }

            applyAccentColor();
            updateHardwareAutoTag();

            if (formatSelect && !state.currentEditingQueueId) {
                formatSelect.value = state.appSettings.defaultFormat;
            }
        } finally {
            state.setApplyingSettings(false);
        }
    }

    function applyAccentColor() {
        const colorName = state.appSettings.accentColor || 'green';
        const color = ACCENT_COLORS[colorName] || ACCENT_COLORS.green;

        document.body.dataset.accent = colorName;
        document.documentElement.style.setProperty('--accent-primary', color.primary);
        document.documentElement.style.setProperty('--accent-secondary', color.secondary);
    }

    function clampNumberInputValue(input, value) {
        const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
        const max = input.max !== '' ? parseFloat(input.max) : Infinity;
        let next = value;
        if (!Number.isNaN(min)) next = Math.max(next, min);
        if (!Number.isNaN(max)) next = Math.min(next, max);
        return next;
    }

    function getNumberDefaultValue(input) {
        const dataDefault = input.dataset.default !== undefined ? parseFloat(input.dataset.default) : Number.NaN;
        if (!Number.isNaN(dataDefault)) return dataDefault;
        const placeholderValue = input.placeholder !== '' ? parseFloat(input.placeholder) : Number.NaN;
        if (!Number.isNaN(placeholderValue)) return placeholderValue;
        if (input.min !== '') {
            const minValue = parseFloat(input.min);
            if (!Number.isNaN(minValue)) return minValue;
        }
        return 0;
    }

    function getNumberDisplayParts(input) {
        const field = input.closest('.number-input-field');
        if (!field) return null;
        const display = field.querySelector('.number-input-display');
        if (!display) return null;
        const current = display.querySelector('.number-input-value.current');
        const next = display.querySelector('.number-input-value.next');
        if (!current || !next) return null;

        return {
            field,
            display,
            current,
            next,
        };
    }

    function syncNumberDisplay(input) {
        const parts = getNumberDisplayParts(input);
        if (!parts) return;

        const fallback = input.value !== ''
            ? input.value
            : String(getNumberDefaultValue(input));
        parts.display.classList.remove('animate-left', 'animate-right');
        parts.current.textContent = fallback;
        parts.next.textContent = '';
    }

    function setNumberEditingState(input, isEditing) {
        const parts = getNumberDisplayParts(input);
        if (!parts) return;

        if (isEditing) {
            parts.field.classList.add('is-editing');
        } else {
            parts.field.classList.remove('is-editing');
        }
    }

    function animateNumberDisplay(input, direction, fromValue, toValue) {
        const parts = getNumberDisplayParts(input);
        if (!parts) return;

        const classLeft = 'animate-left';
        const classRight = 'animate-right';
        const nextClass = direction > 0 ? classLeft : classRight;

        parts.current.textContent = fromValue;
        parts.next.textContent = toValue;
        parts.display.classList.remove(classLeft, classRight);
        // Restart animation by forcing a reflow.
        void parts.display.offsetWidth;
        parts.display.classList.add(nextClass);
    }

    function updateNumberStepperState(input) {
        const container = input.closest('.number-input-container');
        if (!container) return;

        const decrement = container.querySelector('.number-stepper-btn.decrement');
        const increment = container.querySelector('.number-stepper-btn.increment');
        if (!decrement || !increment) return;

        const currentValue = input.value === '' ? getNumberDefaultValue(input) : parseFloat(input.value);
        const minValue = input.min !== '' ? parseFloat(input.min) : Number.NaN;
        const maxValue = input.max !== '' ? parseFloat(input.max) : Number.NaN;

        const atMin = !Number.isNaN(minValue) && !Number.isNaN(currentValue) && currentValue <= minValue;
        const atMax = !Number.isNaN(maxValue) && !Number.isNaN(currentValue) && currentValue >= maxValue;

        decrement.disabled = atMin;
        increment.disabled = atMax;
    }

    function setupNumberSteppers() {
        document.querySelectorAll('.number-stepper-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const inputId = button.dataset.inputId;
                if (!inputId) return;
                const input = document.getElementById(inputId);
                if (!input) return;

                const stepAttr = input.dataset.step || input.step || '1';
                const step = parseFloat(stepAttr) || 1;
                const direction = button.classList.contains('increment') ? 1 : -1;
                const current = parseFloat(input.value);
                const fallback = input.min !== '' ? parseFloat(input.min) : 0;
                const startValue = Number.isNaN(current) ? fallback : current;
                const nextValue = clampNumberInputValue(input, startValue + (direction * step));

                if (Number.isNaN(nextValue)) return;
                const previousValue = input.value !== '' ? input.value : String(startValue);
                input.value = String(nextValue);
                animateNumberDisplay(input, direction, previousValue, String(nextValue));
                updateNumberStepperState(input);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });

        document.querySelectorAll('.number-input-text-box').forEach((input) => {
            syncNumberDisplay(input);
            updateNumberStepperState(input);

            const parts = getNumberDisplayParts(input);
            if (parts) {
                parts.display.addEventListener('click', () => {
                    input.focus();
                });

                parts.display.addEventListener('animationend', () => {
                    parts.display.classList.remove('animate-left', 'animate-right');
                    parts.current.textContent = parts.next.textContent || parts.current.textContent;
                    parts.next.textContent = '';
                });
            }

            input.addEventListener('input', () => {
                const liveParts = getNumberDisplayParts(input);
                if (!liveParts) return;
                if (liveParts.display.classList.contains('animate-left') || liveParts.display.classList.contains('animate-right')) {
                    return;
                }
                liveParts.current.textContent = input.value;
                updateNumberStepperState(input);
            });

            input.addEventListener('focus', () => {
                setNumberEditingState(input, true);
            });

            input.addEventListener('blur', () => {
                setNumberEditingState(input, false);

                if (input.value === '') {
                    input.value = String(getNumberDefaultValue(input));
                }

                const current = parseFloat(input.value);
                if (Number.isNaN(current)) {
                    input.value = String(getNumberDefaultValue(input));
                } else {
                    const nextValue = clampNumberInputValue(input, current);
                    if (nextValue !== current) {
                        input.value = String(nextValue);
                    }
                }

                syncNumberDisplay(input);
                updateNumberStepperState(input);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
    }

    async function detectHardware() {
        try {
            const encoders = await electron.getEncoders();
            state.setDetectedEncoders(encoders);
            if (window.api?.logInfo) window.api.logInfo('Detected encoders:', encoders); else console.log('Detected encoders:', encoders);

            if (state.appSettings.hwAccel === 'auto' && hwAccelSelect) {
                hwAccelSelect.value = 'auto';
                hwAccelSelect.dataset.auto = 'true';
            }
            updateHardwareAutoTag();
        } catch (e) {
            if (window.api?.logError) window.api.logError('Error detecting hardware:', e); else console.error('Error detecting hardware:', e);
        }
    }

    function updateHardwareAutoTag() {
        if (!hwAutoTag) return;
        if (state.appSettings.hwAccel === 'auto') {
            const selected = getAutoEncoder();
            hwAutoTag.textContent = selected === 'none' ? '(none found)' : `(selected: ${selected.toUpperCase()})`;
            hwAutoTag.classList.remove('hidden');
        } else {
            hwAutoTag.classList.add('hidden');
        }
    }

    function getAutoEncoder() {
        if (state.detectedEncoders.nvenc) return 'nvenc';
        if (state.detectedEncoders.amf) return 'amf';
        if (state.detectedEncoders.qsv) return 'qsv';
        return 'none';
    }

    // Load settings immediately to prevent theme flash
    loadSettings();

    setupNumberSteppers();

    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => detectHardware());
    } else {
        setTimeout(() => detectHardware(), 0);
    }

    // Setup settings change handlers
    const changeElements = [outputSuffixInput, defaultFormatSelect, themeSelectAttr, accentColorSelect, workPrioritySelect, overwriteFilesCheckbox, notifyOnCompleteCheckbox, outputFolderInput, showBlobsCheckbox, cpuThreadsInput];
    if (hwAccelSelect) {
        hwAccelSelect.addEventListener('change', () => {
            delete hwAccelSelect.dataset.auto;
            saveSettings();
        });
    }
    changeElements.forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                if (!state.isApplyingSettings) saveSettings();
            });
        }
    });

    if (selectOutputFolderBtn) {
        selectOutputFolderBtn.addEventListener('click', async () => {
            const path = await electron.selectFolder();
            if (path) {
                outputFolderInput.value = path;
                saveSettings();
            }
        });
    }

    // Initialize modules
    setupCustomSelects();
    setupQueueHandlers();
    setupEncoderHandlers();
    setupAppsHandlers();
    setupImageToPdfHandlers();

    // Navigation handlers
    if (navVideo) {
        navVideo.addEventListener('click', () => {
            clearImageToPdf();
            resetNav();
            navVideo.classList.add('active');
            showView(dropZone);
            scheduleSidebarIndicatorUpdate();
        });
    }

    if (navFolder) {
        navFolder.addEventListener('click', () => {
            clearImageToPdf();
            resetNav();
            navFolder.classList.add('active');
            showView(folderDropZone);
            scheduleSidebarIndicatorUpdate();
        });
    }

    if (navQueue) {
        navQueue.addEventListener('click', () => {
            clearImageToPdf();
            resetNav();
            navQueue.classList.add('active');
            showView(queueView);
            renderQueue();
            scheduleSidebarIndicatorUpdate();
        });
    }

    if (navSettings) {
        navSettings.addEventListener('click', () => {
            clearImageToPdf();
            resetNav();
            navSettings.classList.add('active');
            showView(settingsView);
            scheduleSidebarIndicatorUpdate();
        });
    }

    if (navTrim) {
        navTrim.addEventListener('click', async () => {
            clearImageToPdf();
            await loadTrimmer();
            resetNav();
            navTrim.classList.add('active');
            showView(trimDropZone);
            scheduleSidebarIndicatorUpdate();
        });
    }

    if (navExtractAudio) {
        navExtractAudio.addEventListener('click', async () => {
            clearImageToPdf();
            await loadExtractAudio();
            resetNav();
            navExtractAudio.classList.add('active');
            showView(extractAudioDropZone);
            scheduleSidebarIndicatorUpdate();
        });
    }

    if (navDownloader) {
        navDownloader.addEventListener('click', async () => {
            clearImageToPdf();
            const { showDownloader } = await loadDownloader();
            showDownloader();
        });
    }

    if (navInspector) {
        navInspector.addEventListener('click', async () => {
            clearImageToPdf();
            await loadInspector();
            resetNav();
            navInspector.classList.add('active');
            showView(get('inspector-drop-zone'));
            scheduleSidebarIndicatorUpdate();
        });
    }

    if (sidebar) {
        const observer = new MutationObserver(() => scheduleSidebarIndicatorUpdate());
        observer.observe(sidebar, { attributes: true, subtree: true, attributeFilter: ['class'] });
        window.addEventListener('resize', scheduleSidebarIndicatorUpdate);
        scheduleSidebarIndicatorUpdate();
    }

    // Sidebar scroll indicator
    const sidebarNavScroll = document.querySelector('.sidebar-nav-scroll');
    const scrollIndicator = document.querySelector('.sidebar-scroll-indicator');

    const updateScrollIndicator = () => {
        if (!sidebarNavScroll || !scrollIndicator) return;

        const { scrollTop, scrollHeight, clientHeight } = sidebarNavScroll;
        const isScrollable = scrollHeight > clientHeight;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;

        if (isScrollable && !isAtBottom) {
            scrollIndicator.classList.add('visible');
        } else {
            scrollIndicator.classList.remove('visible');
        }
    };

    if (sidebarNavScroll) {
        sidebarNavScroll.addEventListener('scroll', () => {
            updateScrollIndicator();
            scheduleSidebarIndicatorUpdate();
        });
        window.addEventListener('resize', updateScrollIndicator);
        // Initial check
        requestAnimationFrame(updateScrollIndicator);
    }

    // Cancel encoding button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (window.api && window.api.cancelEncode) {
                window.api.cancelEncode();
            }
            // Return to main drop zone
            const dropZone = get('drop-zone');
            const navEncode = get('nav-encode');
            if (dropZone) showView(dropZone);
            resetNav();
            if (navEncode) navEncode.classList.add('active');
            toggleSidebar(false);
            showPopup('Encoding cancelled.');
        });
    }

    // Progress event handlers
    electron.onProgress((data) => {
        if (state.isQueueRunning && state.currentlyEncodingItemId !== null) {
            const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
            if (item) {
                item.progress = data.percent;
                updateQueueProgress();
            }
        } else {
            if (progressPercent) progressPercent.textContent = `${data.percent}%`;
            if (progressRing) {
                const offset = 502 - (data.percent / 100) * 502;
                progressRing.style.strokeDashoffset = offset;
            }
            if (timeElapsed) timeElapsed.textContent = data.time;
            if (timePosition) timePosition.textContent = data.time;
            if (encodeSpeed) encodeSpeed.textContent = data.speed;
        }
    });

    electron.onComplete((data) => {
        state.setEncodingState(false);
        const wasExtracting = state.isExtracting;
        const wasTrimming = state.isTrimming;
        state.setExtracting(false);
        state.setTrimming(false);

        if (completeTitle) {
            if (wasExtracting) completeTitle.textContent = 'Extraction Complete!';
            else if (wasTrimming) completeTitle.textContent = 'Trim Complete!';
            else completeTitle.textContent = 'Encoding Complete!';
        }

        const newEncodeBtn = get('new-encode-btn');
        if (newEncodeBtn) newEncodeBtn.textContent = 'Encode Another Video';

        if (state.appSettings.notifyOnComplete) {
            const action = wasExtracting ? 'Extraction' : (wasTrimming ? 'Trim' : 'Encoding');
            new Notification(action + ' Complete', { body: `File saved to: ${data.outputPath}` });
        }

        if (state.isQueueRunning && state.currentlyEncodingItemId !== null) {
            const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
            if (item) {
                item.status = 'completed';
                item.progress = 100;
            }
            updateQueueUI();
            setTimeout(processQueue, 500);
        } else {
            if (outputPathEl) outputPathEl.textContent = data.outputPath;
            state.setCurrentOutputPath(data.outputPath);
            showView(completeView);
            toggleSidebar(false);
        }
    });

    electron.onError((data) => {
        state.setEncodingState(false);
        state.setExtracting(false);
        state.setTrimming(false);
        alert(`Error: ${data.message}`);

        if (state.isQueueRunning && state.currentlyEncodingItemId !== null) {
            const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
            if (item) {
                item.status = 'error';
            }
            updateQueueUI();
            state.setQueueRunning(false);
            updateQueueStatusUI();
            toggleSidebar(false);
        } else {
            if (state.encodingQueue.length > 0) {
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
            } else {
                showView(dashboard);
            }
            toggleSidebar(false);
        }
    });

    // Encoder completion button handlers
    if (openFileBtn) {
        openFileBtn.addEventListener('click', () => {
            if (state.currentOutputPath) {
                window.api.openFile(state.currentOutputPath);
            }
        });
    }

    if (openFolderBtn) {
        openFolderBtn.addEventListener('click', () => {
            if (state.currentOutputPath) {
                window.api.openFolder(state.currentOutputPath);
            }
        });
    }

    if (newEncodeBtn) {
        newEncodeBtn.addEventListener('click', () => {
            if (state.lastActiveViewId === 'trimDropZone') {
                showView(trimDropZone);
                resetNav();
                if (navTrim) navTrim.classList.add('active');
            } else if (state.lastActiveViewId === 'extractAudioDropZone') {
                showView(extractAudioDropZone);
                resetNav();
                if (navExtractAudio) navExtractAudio.classList.add('active');
            } else if (state.lastActiveViewId === 'imageToPdfDropZone') {
                const imageDropZone = get('image-to-pdf-drop-zone');
                showView(imageDropZone);
                resetNav();
            } else {
                showView(dropZone);
                resetNav();
                if (navVideo) navVideo.classList.add('active');
            }
        });
    }

    // Queue item selection/editing handlers
    window.loadQueueItem = async (id) => {
        if (state.isQueueRunning) {
            showPopup('Cannot edit queue items while the queue is running.');
            return;
        }
        const item = state.encodingQueue.find(i => i.id === id);
        if (item && item.status === 'completed') {
            return;
        }

        if (item && item.taskType === 'download') {
            await loadDownloader();
            await loadDownloadItemToDashboard(id);
            return;
        }

        if (item && item.taskType === 'trim') {
            state.setCurrentEditingQueueId(id);
            const { loadTrimQueueItem } = await loadTrimmer();
            loadTrimQueueItem(item).then(() => {
                showView(trimDashboard);
                resetNav();
                if (navTrim) navTrim.classList.add('active');
            });
            return;
        }

        if (item && item.taskType === 'extract') {
            state.setCurrentEditingQueueId(id);
            const { handleExtractFileSelection, updateExtractBitrateVisibility } = await loadExtractAudio();
            handleExtractFileSelection(item.options.input, {
                format: item.options.format,
                bitrate: item.options.bitrate,
                sampleRate: item.options.sampleRate,
                mp3Mode: item.options.mp3Mode,
                mp3Quality: item.options.mp3Quality,
                flacLevel: item.options.flacLevel
            }).then(() => {
                updateExtractBitrateVisibility();
                const extractAddQueueBtn = get('extract-add-queue-btn');
                if (extractAddQueueBtn) {
                    extractAddQueueBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                        Update Item
                    `;
                }
                showView(extractAudioDashboard);
                resetNav();
                if (navExtractAudio) navExtractAudio.classList.add('active');
            });
            return;
        }
        loadQueueItemToDashboard(id);
    };



    async function loadDownloadItemToDashboard(id) {
        const item = state.encodingQueue.find(i => i.id === id);
        if (!item) return;

        const { processVideoUrl } = await loadDownloader();

        state.setCurrentEditingQueueId(id);

        const dlUrlInput = get('dl-url');
        const dlModeSelect = get('dl-mode');
        const dlQualitySelect = get('dl-quality');
        const dlFormatSelect = get('dl-format');
        const dlFpsSelect = get('dl-fps');
        const dlVideoBitrateSelect = get('dl-video-bitrate');
        const dlVideoCodecSelect = get('dl-video-codec');
        const dlAudioFormatSelect = get('dl-audio-format');
        const dlAudioBitrateSelect = get('dl-audio-bitrate');
        const dlStartBtn = get('dl-start-btn');
        const downloaderDashboard = get('downloader-dashboard');

        showView(downloaderDashboard);
        resetNav();
        if (navDownloader) navDownloader.classList.add('active');

        if (dlUrlInput) dlUrlInput.value = item.options.url;

        await processVideoUrl(item.options.url);

        if (dlModeSelect) {
            dlModeSelect.value = item.options.mode;
            dlModeSelect.dispatchEvent(new Event('change'));
        }
        if (dlQualitySelect) dlQualitySelect.value = item.options.quality;
        if (dlFormatSelect) dlFormatSelect.value = item.options.format;
        if (dlFpsSelect && item.options.fps) dlFpsSelect.value = item.options.fps;
        if (dlVideoBitrateSelect && item.options.videoBitrate) dlVideoBitrateSelect.value = item.options.videoBitrate;
        if (dlVideoCodecSelect && item.options.videoCodec) dlVideoCodecSelect.value = item.options.videoCodec;
        if (dlAudioFormatSelect && item.options.audioFormat) dlAudioFormatSelect.value = item.options.audioFormat;
        if (dlAudioBitrateSelect && item.options.audioBitrate) dlAudioBitrateSelect.value = item.options.audioBitrate;

        if (dlStartBtn) {
            dlStartBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                Update Queue Item
            `;
        }
    }

    async function loadQueueItemToDashboard(id) {
        const item = state.encodingQueue.find(i => i.id === id);
        if (!item) return;

        state.setCurrentEditingQueueId(id);
        state.setCurrentFile(item.options.input);

        const name = item.options.input.split(/[\\/]/).pop();
        const ext = name.split('.').pop().toUpperCase();

        if (filenameEl) filenameEl.textContent = name;
        if (fileIcon) fileIcon.textContent = ext;

        applyOptionsToUI(item.options);

        if (chaptersInfo) {
            if (state.chaptersFile) {
                if (chaptersFilename) chaptersFilename.textContent = state.chaptersFile.split(/[\\/]/).pop();
                chaptersInfo.classList.remove('hidden');
                if (chapterImportZone) chapterImportZone.classList.add('hidden');
            } else {
                chaptersInfo.classList.add('hidden');
                if (chapterImportZone) chapterImportZone.classList.remove('hidden');
            }
        }

        if (addQueueBtn) addQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Update Item
        `;

        showView(dashboard);
        resetNav();
        if (navVideo) navVideo.classList.add('active');

        try {
            const metadata = await electron.getMetadata(item.options.input);
            if (resolutionEl) resolutionEl.textContent = metadata.resolution;
            if (durationEl) durationEl.textContent = metadata.duration;
            if (bitrateEl) bitrateEl.textContent = metadata.bitrate;
            state.setCurrentFile(
                item.options.input,
                metadata.durationSeconds || 0,
                metadata.width || 0,
                metadata.height || 0,
                metadata.fps || 30
            );
            updateEstFileSize();
        } catch (err) {
            if (window.api?.logWarn) window.api.logWarn('Could not read metadata:', err); else console.warn('Could not read metadata:', err);
        }
    }

    if (window.api?.logInfo) window.api.logInfo('Video Toolbox initialized successfully with modular structure'); else console.log('Video Toolbox initialized successfully with modular structure');
});
