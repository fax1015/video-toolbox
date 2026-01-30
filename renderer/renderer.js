/**
 * Media Converter Renderer
 * Handles UI interactions and IPC communication.
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('Renderer initialized');

    // Safe element selector
    const get = (id) => {
        const el = document.getElementById(id);
        if (!el) console.warn(`Element with ID "${id}" not found`);
        return el;
    };

    // --- Views ---
    const dropZone = get('drop-zone');
    const folderDropZone = get('folder-drop-zone');
    const dashboard = get('file-dashboard');
    const progressView = get('progress-view');
    const completeView = get('complete-view');
    const settingsView = get('settings-view');
    const queueView = get('queue-view');

    // --- Dashboard Elements ---
    const filenameEl = get('filename');
    const resolutionEl = get('file-resolution');
    const durationEl = get('file-duration');
    const bitrateEl = get('file-bitrate');
    const fileIcon = get('file-icon');

    // --- Controls ---
    const backBtn = get('back-btn');
    const settingsBackBtn = get('settings-back-btn');
    const convertBtn = get('convert-btn');
    const cancelBtn = get('cancel-btn');

    // --- Settings ---
    const formatSelect = get('format-select');
    const codecSelect = get('codec-select');
    const presetSelect = get('preset-select');
    const audioSelect = get('audio-select');
    const crfSlider = get('crf-slider');
    const crfValue = get('crf-value');
    const audioBitrateSelect = get('audio-bitrate');

    // --- Progress Elements ---
    const progressPercent = get('progress-percent');
    const progressRing = get('progress-ring');
    const timeElapsed = get('time-elapsed');
    const encodeSpeed = get('encode-speed');
    const progressFilename = get('progress-filename');
    const timePosition = get('time-position');

    // --- Complete Elements ---
    const outputPathEl = get('output-path');
    const openFileBtn = get('open-file-btn');
    const openFolderBtn = get('open-folder-btn');
    const newEncodeBtn = get('new-encode-btn');

    // --- Navigation Elements ---
    const navVideo = get('nav-video');
    const navFolder = get('nav-folder');
    const navSettings = get('nav-settings');
    const navQueue = get('nav-queue');

    // --- Queue Elements ---
    const addQueueBtn = get('add-queue-btn');
    const queueList = get('queue-list');
    const queueBadge = get('queue-badge');
    const clearQueueBtn = get('clear-queue-btn');
    const startQueueBtn = get('start-queue-btn');
    const queueAddBtn = get('queue-add-btn');

    // --- Global Settings Elements ---
    const hwAccelSelect = get('hw-accel');
    const outputSuffixInput = get('output-suffix');
    const defaultFormatSelect = get('default-format');
    const themeSelectAttr = get('theme-select');
    const outputFolderInput = get('output-folder');
    const selectOutputFolderBtn = get('select-output-folder-btn');
    const overwriteFilesCheckbox = get('overwrite-files');
    const notifyOnCompleteCheckbox = get('notify-on-complete');
    const hwAutoTag = get('hw-auto-tag');

    // --- Advanced Elements ---
    const toggleAdvancedBtn = get('toggle-advanced-btn');
    const advancedPanel = get('advanced-panel');
    const customFfmpegArgs = get('custom-ffmpeg-args');

    // --- Queue Icon Elements ---
    const startQueueIcon = get('start-queue-icon');
    const pauseQueueIcon = get('pause-queue-icon');
    const pauseQueueIcon2 = get('pause-queue-icon-2');
    const startQueueText = get('start-queue-text');

    // --- Preset Elements ---
    const presetMenuBtn = get('preset-menu-btn');
    const presetDropdown = get('preset-dropdown');
    const currentPresetName = get('current-preset-name');
    const customPresetsList = get('custom-presets-list');
    const savePresetBtn = get('save-preset-btn');

    let currentFilePath = null;
    let currentOutputPath = null;
    let isEncoding = false;
    let isCancelled = false;
    let encodingQueue = [];
    let isQueueRunning = false;
    let currentlyEncodingItemId = null;
    let currentEditingQueueId = null;

    // --- Settings Persistence ---
    const APP_SETTINGS_KEY = 'video_toolbox_settings';
    let appSettings = {
        hwAccel: 'auto',
        outputSuffix: '_encoded',
        defaultFormat: 'mp4',
        theme: 'dark',
        outputFolder: '',
        overwriteFiles: false,
        notifyOnComplete: true
    };

    let detectedEncoders = { nvenc: false, amf: false, qsv: false };

    function loadSettings() {
        const saved = localStorage.getItem(APP_SETTINGS_KEY);
        if (saved) {
            try {
                appSettings = { ...appSettings, ...JSON.parse(saved) };
            } catch (e) { console.error('Error parsing settings', e); }
        }
        applySettings();
    }

    function saveSettings() {
        if (hwAccelSelect) appSettings.hwAccel = hwAccelSelect.value;
        if (outputSuffixInput) appSettings.outputSuffix = outputSuffixInput.value;
        if (defaultFormatSelect) appSettings.defaultFormat = defaultFormatSelect.value;
        if (themeSelectAttr) appSettings.theme = themeSelectAttr.value;
        if (outputFolderInput) appSettings.outputFolder = outputFolderInput.value;
        if (overwriteFilesCheckbox) appSettings.overwriteFiles = overwriteFilesCheckbox.checked;
        if (notifyOnCompleteCheckbox) appSettings.notifyOnComplete = notifyOnCompleteCheckbox.checked;

        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
        applySettings();
    }

    function applySettings() {
        if (hwAccelSelect) hwAccelSelect.value = appSettings.hwAccel;
        if (outputSuffixInput) outputSuffixInput.value = appSettings.outputSuffix;
        if (defaultFormatSelect) defaultFormatSelect.value = appSettings.defaultFormat;
        if (themeSelectAttr) themeSelectAttr.value = appSettings.theme;
        if (outputFolderInput) outputFolderInput.value = appSettings.outputFolder;
        if (overwriteFilesCheckbox) overwriteFilesCheckbox.checked = appSettings.overwriteFiles;
        if (notifyOnCompleteCheckbox) notifyOnCompleteCheckbox.checked = appSettings.notifyOnComplete;

        // Apply theme
        document.body.classList.remove('oled-theme', 'light-theme');
        if (appSettings.theme === 'oled') document.body.classList.add('oled-theme');
        if (appSettings.theme === 'light') document.body.classList.add('light-theme');

        // Update auto tag
        updateHardwareAutoTag();

        // Apply default format to dashboard
        if (formatSelect && !currentEditingQueueId) {
            formatSelect.value = appSettings.defaultFormat;
        }
    }

    async function detectHardware() {
        try {
            detectedEncoders = await electron.getEncoders();
            console.log('Detected encoders:', detectedEncoders);
            updateHardwareAutoTag();
        } catch (e) {
            console.error('Error detecting hardware:', e);
        }
    }

    function updateHardwareAutoTag() {
        if (!hwAutoTag) return;
        if (appSettings.hwAccel === 'auto') {
            const selected = getAutoEncoder();
            hwAutoTag.textContent = selected === 'none' ? '(none found)' : `(selected: ${selected.toUpperCase()})`;
            hwAutoTag.classList.remove('hidden');
        } else {
            hwAutoTag.classList.add('hidden');
        }
    }

    function getAutoEncoder() {
        if (detectedEncoders.nvenc) return 'nvenc';
        if (detectedEncoders.amf) return 'amf';
        if (detectedEncoders.qsv) return 'qsv';
        return 'none';
    }

    detectHardware();
    loadSettings();

    [hwAccelSelect, outputSuffixInput, defaultFormatSelect, themeSelectAttr, overwriteFilesCheckbox, notifyOnCompleteCheckbox].forEach(el => {
        if (el) el.addEventListener('change', saveSettings);
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

    if (toggleAdvancedBtn) {
        toggleAdvancedBtn.addEventListener('click', () => {
            advancedPanel.classList.toggle('hidden');
            toggleAdvancedBtn.querySelector('svg').style.transform = advancedPanel.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    // Verify Electron bridge
    if (!window.electron) {
        console.error('Electron bridge not found! Check preload script configuration.');
        return;
    }

    const { electron } = window;

    // --- Helpers ---
    function showView(view) {
        if (!view) return;
        [dropZone, folderDropZone, dashboard, progressView, completeView, settingsView, queueView].forEach(v => {
            if (v) v.classList.add('hidden');
        });
        view.classList.remove('hidden');
    }

    function toggleSidebar(disabled) {
        [navVideo, navFolder, navSettings, navQueue].forEach(btn => {
            if (btn) btn.classList.toggle('disabled', disabled);
        });
    }

    function resetProgress() {
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressRing) progressRing.style.strokeDashoffset = 502;
        if (timeElapsed) timeElapsed.textContent = '00:00:00';
        if (timePosition) timePosition.textContent = '00:00:00';
        if (encodeSpeed) encodeSpeed.textContent = '0.00x';
    }

    // --- Navigation logic ---
    function resetNav() {
        if (navVideo) navVideo.classList.remove('active');
        if (navFolder) navFolder.classList.remove('active');
        if (navSettings) navSettings.classList.remove('active');
        if (navQueue) navQueue.classList.remove('active');
    }

    if (navVideo) {
        navVideo.addEventListener('click', () => {
            console.log('Nav: Video clicked');
            resetNav();
            navVideo.classList.add('active');
            showView(dropZone);
        });
    }

    if (navFolder) {
        navFolder.addEventListener('click', () => {
            console.log('Nav: Folder clicked');
            resetNav();
            navFolder.classList.add('active');
            showView(folderDropZone);
        });
    }

    if (navQueue) {
        navQueue.addEventListener('click', () => {
            console.log('Nav: Queue clicked');
            resetNav();
            navQueue.classList.add('active');
            showView(queueView);
            renderQueue();
        });
    }

    if (navSettings) {
        navSettings.addEventListener('click', () => {
            console.log('Nav: Settings clicked');
            resetNav();
            navSettings.classList.add('active');
            showView(settingsView);
        });
    }

    // --- Event Listeners ---

    // Drag and Drop
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                console.log('File dropped:', file.path);
                handleFileSelection(file.path);
            }
        });

        dropZone.addEventListener('click', async () => {
            console.log('Drop zone clicked, opening dialog...');
            try {
                const filePath = await electron.selectFile();
                if (filePath) {
                    console.log('File selected:', filePath);
                    handleFileSelection(filePath);
                }
            } catch (err) {
                console.error('Error selecting file:', err);
            }
        });
    }

    // Folder Drop Zone
    if (folderDropZone) {
        folderDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            folderDropZone.classList.add('drag-over');
        });

        folderDropZone.addEventListener('dragleave', () => {
            folderDropZone.classList.remove('drag-over');
        });

        folderDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            folderDropZone.classList.remove('drag-over');
            const folder = e.dataTransfer.files[0];
            if (folder) {
                // Electron gives us the path
                handleFolderSelection(folder.path);
            }
        });

        folderDropZone.addEventListener('click', async () => {
            try {
                const folderPath = await electron.selectFolder();
                if (folderPath) {
                    handleFolderSelection(folderPath);
                }
            } catch (err) {
                console.error('Error selecting folder:', err);
            }
        });
    }

    async function handleFolderSelection(folderPath) {
        console.log('Folder selected:', folderPath);
        try {
            const files = await electron.listFiles(folderPath);
            if (files.length === 0) {
                alert('No video files found in the selected folder.');
                return;
            }

            const confirmAdd = confirm(`Found ${files.length} video files. Add them to queue with current settings?`);
            if (!confirmAdd) return;

            files.forEach(file => {
                const options = {
                    input: file,
                    format: appSettings.defaultFormat,
                    codec: getEffectiveCodec(),
                    preset: presetSelect ? presetSelect.value : 'medium',
                    audioCodec: audioSelect ? audioSelect.value : 'aac',
                    crf: crfSlider ? parseInt(crfSlider.value) : 23,
                    audioBitrate: audioBitrateSelect ? audioBitrateSelect.value : '192k',
                    outputSuffix: appSettings.outputSuffix,
                    customArgs: customFfmpegArgs ? customFfmpegArgs.value : ''
                };
                addToQueue(options);
            });

            showView(queueView);
            resetNav();
            navQueue.classList.add('active');
        } catch (err) {
            console.error('Error handling folder:', err);
        }
    }

    async function handleFileSelection(filePath) {
        currentFilePath = filePath;
        currentEditingQueueId = null;
        if (addQueueBtn) addQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Add to Queue
        `;

        const name = filePath.split(/[\\/]/).pop();
        const ext = name.split('.').pop().toUpperCase();

        if (filenameEl) filenameEl.textContent = name;
        if (fileIcon) fileIcon.textContent = ext;

        showView(dashboard);

        // Get metadata
        try {
            const metadata = await electron.getMetadata(filePath);
            if (resolutionEl) resolutionEl.textContent = metadata.resolution;
            if (durationEl) durationEl.textContent = metadata.duration;
            if (bitrateEl) bitrateEl.textContent = metadata.bitrate;

            // Only apply default format if not editing an existing item (handled in loadQueueItemToDashboard)
            if (formatSelect && !currentEditingQueueId) {
                formatSelect.value = appSettings.defaultFormat;
            }
        } catch (err) {
            console.warn('Could not read metadata:', err);
        }
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (currentEditingQueueId) {
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
                currentEditingQueueId = null;
            } else {
                showView(dropZone);
            }
        });
    }
    if (settingsBackBtn) settingsBackBtn.addEventListener('click', () => {
        resetNav();
        navVideo.classList.add('active');
        showView(dropZone);
    });

    if (crfSlider) {
        crfSlider.addEventListener('input', () => {
            if (crfValue) crfValue.textContent = crfSlider.value;
        });
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', () => {
            if (!currentFilePath) return;

            const options = {
                input: currentFilePath,
                format: formatSelect ? formatSelect.value : appSettings.defaultFormat,
                codec: getEffectiveCodec(),
                preset: presetSelect ? presetSelect.value : 'medium',
                audioCodec: audioSelect ? audioSelect.value : 'aac',
                crf: crfSlider ? parseInt(crfSlider.value) : 23,
                audioBitrate: audioBitrateSelect ? audioBitrateSelect.value : '192k',
                outputSuffix: appSettings.outputSuffix,
                customArgs: customFfmpegArgs ? customFfmpegArgs.value : ''
            };

            if (progressFilename) progressFilename.textContent = currentFilePath.split(/[\\/]/).pop();
            resetProgress();
            showView(progressView);
            isEncoding = true;
            isCancelled = false;
            toggleSidebar(true);
            electron.startEncode(options);
        });
    }

    function getEffectiveCodec() {
        const baseCodec = codecSelect ? codecSelect.value : 'h264';
        if (baseCodec === 'copy') return 'copy';

        let accel = appSettings.hwAccel;
        if (accel === 'auto') {
            accel = getAutoEncoder();
        }

        if (accel !== 'none') {
            if (baseCodec === 'h264') return `h264_${accel}`;
            if (baseCodec === 'h265') return `hevc_${accel}`;
        }
        return baseCodec;
    }

    if (addQueueBtn) {
        addQueueBtn.addEventListener('click', () => {
            if (!currentFilePath) return;

            const options = {
                input: currentFilePath,
                format: formatSelect ? formatSelect.value : appSettings.defaultFormat,
                codec: getEffectiveCodec(),
                preset: presetSelect ? presetSelect.value : 'medium',
                audioCodec: audioSelect ? audioSelect.value : 'aac',
                crf: crfSlider ? parseInt(crfSlider.value) : 23,
                audioBitrate: audioBitrateSelect ? audioBitrateSelect.value : '192k',
                outputSuffix: appSettings.outputSuffix
            };

            if (currentEditingQueueId) {
                updateQueueItem(currentEditingQueueId, options);
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
            } else {
                addToQueue(options);
                showView(dropZone);
                resetNav();
                navVideo.classList.add('active');
            }
        });
    }

    function updateQueueItem(id, options) {
        const index = encodingQueue.findIndex(item => item.id === id);
        if (index !== -1) {
            encodingQueue[index].options = options;
            encodingQueue[index].name = options.input.split(/[\\/]/).pop();
            // Reset status if it was completed or error to allow re-encoding with new settings
            if (encodingQueue[index].status === 'completed' || encodingQueue[index].status === 'error') {
                encodingQueue[index].status = 'pending';
                encodingQueue[index].progress = 0;
            }
            updateQueueUI();
        }
        currentEditingQueueId = null;
    }

    async function loadQueueItemToDashboard(id) {
        const item = encodingQueue.find(i => i.id === id);
        if (!item) return;

        currentEditingQueueId = id;
        currentFilePath = item.options.input;

        // Populate dashboard
        const name = item.options.input.split(/[\\/]/).pop();
        const ext = name.split('.').pop().toUpperCase();

        if (filenameEl) filenameEl.textContent = name;
        if (fileIcon) fileIcon.textContent = ext;

        // Apply settings from queue item
        if (formatSelect) formatSelect.value = item.options.format;
        // Logic to reverse getEffectiveCodec is complex, but we stored the original-ish codec in options.
        // If it contains hwaccel name, we should map it back to the base codec.
        let baseCodec = item.options.codec;
        if (baseCodec.includes('_')) {
            baseCodec = baseCodec.split('_')[0];
            if (baseCodec === 'hevc') baseCodec = 'h265';
        }
        if (codecSelect) codecSelect.value = baseCodec;
        if (presetSelect) presetSelect.value = item.options.preset;
        if (audioSelect) audioSelect.value = item.options.audioCodec;
        if (crfSlider) {
            crfSlider.value = item.options.crf;
            if (crfValue) crfValue.textContent = item.options.crf;
        }
        if (audioBitrateSelect) audioBitrateSelect.value = item.options.audioBitrate;

        if (addQueueBtn) addQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Update Item
        `;

        showView(dashboard);

        // Get metadata
        try {
            const metadata = await electron.getMetadata(item.options.input);
            if (resolutionEl) resolutionEl.textContent = metadata.resolution;
            if (durationEl) durationEl.textContent = metadata.duration;
            if (bitrateEl) bitrateEl.textContent = metadata.bitrate;
        } catch (err) {
            console.warn('Could not read metadata:', err);
        }
    }

    if (queueAddBtn) {
        queueAddBtn.addEventListener('click', async () => {
            try {
                const filePath = await electron.selectFile();
                if (filePath) {
                    const options = {
                        input: filePath,
                        format: formatSelect ? formatSelect.value : appSettings.defaultFormat,
                        codec: getEffectiveCodec(),
                        preset: presetSelect ? presetSelect.value : 'medium',
                        audioCodec: audioSelect ? audioSelect.value : 'aac',
                        crf: crfSlider ? parseInt(crfSlider.value) : 23,
                        audioBitrate: audioBitrateSelect ? audioBitrateSelect.value : '192k',
                        outputSuffix: appSettings.outputSuffix,
                        customArgs: customFfmpegArgs ? customFfmpegArgs.value : ''
                    };
                    addToQueue(options);
                }
            } catch (err) {
                console.error('Error adding to queue:', err);
            }
        });
    }

    // --- Preset Logic ---
    const BUILT_IN_PRESETS = {
        'fast-1080p': { format: 'mp4', codec: 'h264', preset: 'veryfast', crf: 23, audioCodec: 'aac', audioBitrate: '128k' },
        'hq-1080p': { format: 'mp4', codec: 'h264', preset: 'slow', crf: 18, audioCodec: 'aac', audioBitrate: '192k' },
        'discord': { format: 'mp4', codec: 'h264', preset: 'medium', crf: 28, audioCodec: 'aac', audioBitrate: '96k' },
        'hevc-mkv': { format: 'mkv', codec: 'h265', preset: 'medium', crf: 24, audioCodec: 'opus', audioBitrate: '128k' }
    };

    let customPresets = {};

    function loadCustomPresets() {
        const saved = localStorage.getItem('custom_presets');
        if (saved) {
            try { customPresets = JSON.parse(saved); } catch (e) { console.error('Error loading custom presets', e); }
        }
        renderCustomPresetsList();
    }

    function saveCustomPreset(name, settings) {
        customPresets[name] = settings;
        localStorage.setItem('custom_presets', JSON.stringify(customPresets));
        renderCustomPresetsList();
    }

    function renderCustomPresetsList() {
        if (!customPresetsList) return;
        const keys = Object.keys(customPresets);
        if (keys.length === 0) {
            customPresetsList.innerHTML = '<div class="preset-empty">No custom presets</div>';
            return;
        }
        customPresetsList.innerHTML = keys.map(name => `
            <div class="preset-item" data-custom-preset="${name}">${name}</div>
        `).join('');
    }

    if (presetMenuBtn) {
        presetMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            presetDropdown.classList.toggle('hidden');
        });
    }

    document.addEventListener('click', () => {
        if (presetDropdown) presetDropdown.classList.add('hidden');
    });

    if (presetDropdown) {
        presetDropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.preset-item');
            if (item) {
                const builtInId = item.dataset.preset;
                const customId = item.dataset.customPreset;
                let settings = null;
                let name = '';

                if (builtInId) {
                    settings = BUILT_IN_PRESETS[builtInId];
                    name = item.textContent;
                } else if (customId) {
                    settings = customPresets[customId];
                    name = customId;
                }

                if (settings) {
                    applyPreset(settings, name);
                }
            }
        });
    }

    function applyPreset(settings, name) {
        if (formatSelect) formatSelect.value = settings.format;
        if (codecSelect) codecSelect.value = settings.codec;
        if (presetSelect) presetSelect.value = settings.preset;
        if (crfSlider) {
            crfSlider.value = settings.crf;
            if (crfValue) crfValue.textContent = settings.crf;
        }
        if (audioSelect) audioSelect.value = settings.audioCodec;
        if (audioBitrateSelect) audioBitrateSelect.value = settings.audioBitrate;
        if (currentPresetName) currentPresetName.textContent = name;
    }

    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = prompt('Enter a name for this preset:');
            if (name && name.trim()) {
                const settings = {
                    format: formatSelect.value,
                    codec: codecSelect.value,
                    preset: presetSelect.value,
                    crf: parseInt(crfSlider.value),
                    audioCodec: audioSelect.value,
                    audioBitrate: audioBitrateSelect.value
                };
                saveCustomPreset(name.trim(), settings);
                currentPresetName.textContent = name.trim();
            }
        });
    }

    loadCustomPresets();

    function addToQueue(options) {
        const id = Date.now();
        encodingQueue.push({
            id,
            options,
            status: 'pending',
            progress: 0,
            name: options.input.split(/[\\/]/).pop()
        });
        updateQueueUI();
    }

    function updateQueueUI() {
        if (queueBadge) {
            const pendingCount = encodingQueue.filter(item => item.status !== 'completed').length;
            queueBadge.textContent = pendingCount;
            queueBadge.classList.toggle('hidden', pendingCount === 0);
        }
        renderQueue();
    }

    function renderQueue(isProgressUpdate = false) {
        if (!queueList) return;

        if (encodingQueue.length === 0) {
            queueList.innerHTML = '<div class="empty-queue-msg">Queue is empty</div>';
            return;
        }

        if (isProgressUpdate && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                const itemEl = queueList.querySelector(`[data-id="${item.id}"]`);
                if (itemEl) {
                    const statusEl = itemEl.querySelector('.queue-item-status');
                    const progressEl = itemEl.querySelector('.queue-progress-bar');
                    if (statusEl) statusEl.textContent = `Encoding... ${item.progress}%`;
                    if (progressEl) progressEl.style.width = `${item.progress}%`;
                    itemEl.classList.add('active');
                    return;
                }
            }
        }

        queueList.innerHTML = encodingQueue.map((item) => `
            <div class="queue-item ${item.id === currentlyEncodingItemId ? 'active' : ''} ${item.status === 'completed' ? 'completed' : ''}" 
                 data-id="${item.id}" 
                 onclick="window.loadQueueItem(${item.id})">
                <div class="queue-item-info">
                    <div class="queue-item-name">${item.name}</div>
                    <div class="queue-item-status">${item.status === 'encoding' ? `Encoding... ${item.progress}%` : item.status}</div>
                </div>
                ${item.status === 'encoding' || item.status === 'completed' ? `
                <div class="queue-item-progress">
                    <div class="queue-progress-bar" style="width: ${item.progress}%"></div>
                </div>
                ` : ''}
                <button class="queue-item-remove" onclick="event.stopPropagation(); window.removeQueueItem(${item.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');
    }

    window.loadQueueItem = (id) => {
        if (isQueueRunning) {
            alert('Cannot edit queue items while the queue is running.');
            return;
        }
        const item = encodingQueue.find(i => i.id === id);
        if (item && item.status === 'completed') {
            return;
        }
        loadQueueItemToDashboard(id);
    };

    window.removeQueueItem = (id) => {
        const index = encodingQueue.findIndex(item => item.id === id);
        if (index !== -1) {
            if (id === currentlyEncodingItemId) {
                electron.cancelEncode();
                currentlyEncodingItemId = null;
            }
            encodingQueue.splice(index, 1);
            updateQueueUI();
            if (encodingQueue.length === 0) {
                isQueueRunning = false;
                updateQueueStatusUI();
                toggleSidebar(false);
            }
        }
    };

    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', () => {
            if (encodingQueue.length === 0) return;

            const confirmClear = confirm('Are you sure you want to clear all items from the queue?');
            if (!confirmClear) return;

            if (isQueueRunning) electron.cancelEncode();
            encodingQueue = [];
            currentlyEncodingItemId = null;
            isQueueRunning = false;
            updateQueueUI();
            updateQueueStatusUI();
            toggleSidebar(false);
        });
    }
    if (startQueueBtn) {
        startQueueBtn.addEventListener('click', () => {
            if (encodingQueue.length === 0) return;

            if (isQueueRunning) {
                // Pause clicked
                isQueueRunning = false;
                // Important: cancel the current encode so the user can interact
                if (currentlyEncodingItemId !== null) {
                    const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
                    if (item && item.status === 'encoding') {
                        item.status = 'pending';
                        item.progress = 0;
                    }
                    electron.cancelEncode();
                    currentlyEncodingItemId = null;
                    toggleSidebar(false);
                }
                updateQueueStatusUI();
                updateQueueUI();
            } else {
                // Start or Resume clicked
                isQueueRunning = true;
                updateQueueStatusUI();
                processQueue();
            }
        });
    }

    function updateQueueStatusUI() {
        if (!startQueueBtn) return;
        if (isQueueRunning) {
            startQueueIcon.classList.add('hidden');
            pauseQueueIcon.classList.remove('hidden');
            pauseQueueIcon2.classList.remove('hidden');
            startQueueText.textContent = 'Pause Queue';
        } else {
            startQueueIcon.classList.remove('hidden');
            pauseQueueIcon.classList.add('hidden');
            pauseQueueIcon2.classList.add('hidden');
            const hasStarted = encodingQueue.some(item => item.status === 'completed');
            startQueueText.textContent = hasStarted ? 'Resume Queue' : 'Start Queue';
        }
    }

    function processQueue() {
        if (!isQueueRunning) return;

        // Find the first pending item
        const nextItem = encodingQueue.find(item => item.status === 'pending');

        if (!nextItem) {
            isQueueRunning = false;
            currentlyEncodingItemId = null;
            // Only alert if there were actually items that were completed
            if (encodingQueue.some(i => i.status === 'completed')) {
                alert('Queue processing complete!');
            }
            updateQueueUI();
            updateQueueStatusUI();
            toggleSidebar(false);
            return;
        }

        nextItem.status = 'encoding';
        currentlyEncodingItemId = nextItem.id;
        isEncoding = true;
        isCancelled = false;
        toggleSidebar(true);
        updateQueueUI();
        updateQueueStatusUI();
        electron.startEncode(nextItem.options);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            const wasQueueRunning = isQueueRunning;
            isCancelled = true;
            electron.cancelEncode();
            isEncoding = false;
            isQueueRunning = false;

            // If it was a queue, mark current item as pending so it can be restarted
            if (wasQueueRunning && currentlyEncodingItemId !== null) {
                const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
                if (item) {
                    item.status = 'pending';
                    item.progress = 0;
                }
            }

            currentlyEncodingItemId = null;
            toggleSidebar(false);

            if (wasQueueRunning) {
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
                updateQueueStatusUI();
                updateQueueUI();
            } else {
                showView(dashboard);
            }
        });
    }

    // --- Progress Handlers ---
    electron.onProgress((data) => {
        if (isQueueRunning && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                item.progress = data.percent;
                renderQueue(true);
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
        isEncoding = false;
        if (appSettings.notifyOnComplete) {
            new Notification('Encoding Complete', {
                body: `File saved to: ${data.outputPath}`
            });
        }

        if (isQueueRunning && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                item.status = 'completed';
                item.progress = 100;
            }
            updateQueueUI();
            setTimeout(processQueue, 500);
        } else {
            if (outputPathEl) outputPathEl.textContent = data.outputPath;
            currentOutputPath = data.outputPath;
            showView(completeView);
            toggleSidebar(false);
        }
    });

    electron.onError((data) => {
        isEncoding = false;
        alert(`Error: ${data.message}`);
        if (isQueueRunning && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                item.status = 'error';
            }
            updateQueueUI();
            isQueueRunning = false;
            updateQueueStatusUI();
            toggleSidebar(false);
        } else {
            showView(dashboard);
            toggleSidebar(false);
        }
    });

    // --- Complete View Actions ---
    if (openFileBtn) openFileBtn.addEventListener('click', () => electron.openFile(currentOutputPath));
    if (openFolderBtn) openFolderBtn.addEventListener('click', () => electron.openFolder(currentOutputPath));
    if (newEncodeBtn) newEncodeBtn.addEventListener('click', () => showView(dropZone));
});
