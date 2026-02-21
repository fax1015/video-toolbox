// Video Downloader Module

import { get, showPopup, showView, showPlaylistConfirm, formatDurationFromSeconds, formatBytes, sanitizeFilename, resetNav, toggleSidebar, renderLoaders, animateAutoHeight } from './ui-utils.js';
import * as state from './state.js';
import { addToQueue, updateQueueUI, updateQueueStatusUI, processQueue } from './queue.js';

export let currentDownloadUrl = '';
export let currentVideoInfo = null;
export let selectedFormatId = null;
export let isFormatsExpanded = false;
export let currentFormatTab = 'video';
let isSyncingUI = false;
let currentInfoRequestId = 0;
let currentDlOutputPath = '';

function formatAudioLabel(codec) {
    if (!codec) return 'Audio';
    const normalized = codec.toLowerCase();

    if (normalized.startsWith('mp4a.40.2')) return 'AAC-LC';
    if (normalized.startsWith('mp4a.40.5')) return 'HE-AAC';
    if (normalized.startsWith('mp4a.40.29')) return 'HE-AACv2';
    if (normalized.includes('opus')) return 'OPUS';
    if (normalized.includes('vorbis')) return 'VORBIS';
    if (normalized.includes('mp3')) return 'MP3';
    if (normalized.includes('aac')) return 'AAC';

    return codec.toUpperCase();
}

function getAudioFormatKey(format) {
    if (!format) return null;
    const acodec = (format.acodec || '').toLowerCase();
    const ext = (format.ext || '').toLowerCase();

    if (acodec.includes('opus')) return 'opus';
    if (acodec.includes('vorbis')) return 'vorbis';
    if (acodec.includes('mp3')) return 'mp3';
    if (acodec.includes('flac')) return 'flac';
    if (acodec.includes('wav') || acodec.includes('pcm')) return 'wav';
    if (acodec.includes('aac') || acodec.startsWith('mp4a')) return 'm4a';

    if (ext === 'm4a' || ext === 'aac') return 'm4a';
    if (ext === 'ogg') return 'vorbis';

    return ext || null;
}

export function setCurrentDownloadUrl(url) {
    currentDownloadUrl = url;
}

export function showDownloader() {
    const downloaderDashboard = get('downloader-dashboard');
    const dlProgressView = get('dl-progress-view');
    const dlStartBtn = get('dl-start-btn');
    const navDownloader = get('nav-downloader');

    showView(downloaderDashboard);

    // Update nav state
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    if (navDownloader) navDownloader.classList.add('active');

    // Reset progress view if visible
    if (dlProgressView) dlProgressView.classList.add('hidden');
    if (dlStartBtn) {
        dlStartBtn.disabled = false;
        dlStartBtn.classList.remove('disabled');
    }
}

export function syncFormatCardFromDropdowns() {
    const dlQualitySelect = get('dl-quality');
    const dlFormatSelect = get('dl-format');
    const dlVideoCodecSelect = get('dl-video-codec');
    const dlFpsSelect = get('dl-fps');
    const dlAudioFormatSelect = get('dl-audio-format');
    const dlAudioBitrateSelect = get('dl-audio-bitrate');
    const dlModeSelect = get('dl-mode');

    if (!currentVideoInfo || !currentVideoInfo.formats) return;


    const quality = dlQualitySelect ? dlQualitySelect.value : 'best';
    const format = dlFormatSelect ? dlFormatSelect.value : 'mp4';
    const codec = dlVideoCodecSelect ? dlVideoCodecSelect.value : 'copy';
    const fps = dlFpsSelect ? dlFpsSelect.value : 'none';
    const audioFormat = dlAudioFormatSelect ? dlAudioFormatSelect.value : 'mp3';
    const bitrate = dlAudioBitrateSelect ? dlAudioBitrateSelect.value.replace('k', '') : '192';

    const isAudioTab = currentFormatTab === 'audio';
    let matchingFormatId = null;

    if (isAudioTab) {
        let candidateFormats = currentVideoInfo.formats.filter(f => {
            if (f.vcodec !== 'none') return false;
            return getAudioFormatKey(f) === audioFormat;
        });

        if (bitrate && bitrate !== '0') {
            const matchingFormat = candidateFormats.find(f => {
                const abr = Math.round(f.abr || f.tbr || 0);
                return abr.toString() === bitrate;
            });
            if (matchingFormat) matchingFormatId = matchingFormat.format_id;
        } else if (candidateFormats.length > 0) {
            // When bitrate is not specified, allow selecting the best available audio format.
            const sorted = candidateFormats.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
            if (sorted[0]) matchingFormatId = sorted[0].format_id;
        }
    } else {
        let candidateFormats = currentVideoInfo.formats.filter(f => {
            if (f.vcodec === 'none') return false;
            if (f.ext !== format) return false;

            if (quality !== 'best' && f.height?.toString() !== quality) return false;

            if (fps !== 'none') {
                const fpsNum = parseFloat(fps);
                const formatFps = parseFloat(f.fps || 0);
                if (Math.abs(formatFps - fpsNum) > 0.5) return false;
            }

            return true;
        });

        if (codec !== 'copy') {
            // Strict matching: if user selected a codec, only match formats of that codec.
            // If there is no match, no format card should be selected.
            candidateFormats = candidateFormats.filter(f => {
                const v = f.vcodec || '';
                let fCodec = 'copy';
                if (v.startsWith('avc') || v.includes('h264')) fCodec = 'h264';
                else if (v.startsWith('hev') || v.includes('h265')) fCodec = 'h265';
                else if (v.startsWith('av01') || v.includes('av1')) fCodec = 'av1';
                else if (v.startsWith('vp9') || v.includes('vp09')) fCodec = 'vp9';
                return fCodec === codec;
            });
        }

        if (candidateFormats.length > 0) {
            candidateFormats.sort((a, b) => {
                const heightDiff = (b.height || 0) - (a.height || 0);
                if (heightDiff !== 0) return heightDiff;
                return (b.tbr || 0) - (a.tbr || 0);
            });
            matchingFormatId = candidateFormats[0].format_id;
        }
    }

    selectedFormatId = matchingFormatId;

    document.querySelectorAll('.format-card').forEach(card => {
        card.classList.remove('selected');
    });

    if (matchingFormatId) {
        const selectedCard = document.querySelector(`[data-id="${matchingFormatId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

export function renderFormats() {
    const dlFormatsList = get('dl-formats-list');
    const dlToggleFormatsBtn = get('dl-toggle-formats-btn');

    if (!dlFormatsList || !currentVideoInfo || !currentVideoInfo.formats) return;

    const formats = currentVideoInfo.formats;
    const isAudio = currentFormatTab === 'audio';

    const invalidExts = new Set(['mhtml']);

    let filtered = isAudio
        ? formats.filter(f => f.vcodec === 'none')
        : formats.filter(f => f.vcodec !== 'none');

    filtered = filtered.filter(f => !invalidExts.has((f.ext || '').toLowerCase()));

    filtered.sort((a, b) => {
        if (isAudio) {
            return (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0);
        } else {
            const heightDiff = (b.height || 0) - (a.height || 0);
            if (heightDiff !== 0) return heightDiff;
            return (b.tbr || 0) - (a.tbr || 0);
        }
    });

    const dlFormatTabs = get('dl-format-tabs');
    const hasAnyVideo = formats.some(f => f.vcodec !== 'none');

    if (dlFormatTabs) {
        const videoTabBtn = dlFormatTabs.querySelector('[data-tab="video"]');
        if (videoTabBtn) {
            if (!hasAnyVideo) {
                videoTabBtn.classList.add('disabled');
                videoTabBtn.style.opacity = '0.4';
                videoTabBtn.style.pointerEvents = 'none';
                videoTabBtn.title = 'No video formats available';
            } else {
                videoTabBtn.classList.remove('disabled');
                videoTabBtn.style.opacity = '1';
                videoTabBtn.style.pointerEvents = 'auto';
                videoTabBtn.title = '';
            }
        }
    }

    const displayCount = isFormatsExpanded ? filtered.length : Math.min(6, filtered.length);
    const displayFormats = filtered.slice(0, displayCount);

    dlFormatsList.innerHTML = displayFormats.map(f => {
        const isSelected = selectedFormatId === f.format_id;

        // Resolution as primary display (or audio indicator)
        const resolutionText = isAudio
            ? formatAudioLabel(f.acodec)
            : (f.height ? `${f.height}p` : 'Unknown');

        // Badges for secondary info
        let badges = [];

        // Container/Format
        badges.push(f.ext.toUpperCase());

        // Codec info
        const rawCodec = isAudio ? (f.acodec || 'Unknown') : (f.vcodec || 'Unknown');
        const codecName = rawCodec.toUpperCase().split('.')[0].substring(0, 6);
        badges.push(codecName);

        const fpsText = (!isAudio && f.fps) ? `${Math.round(f.fps)}fps` : '';

        const bitrate = isAudio
            ? (f.abr ? `${Math.round(f.abr)} kbps` : (f.tbr ? `${Math.round(f.tbr)} kbps` : ''))
            : (f.tbr ? `${Math.round(f.tbr)} kbps` : '');

        // Build tooltip with comprehensive info
        const tooltipParts = [];
        if (!isAudio) tooltipParts.push(`Quality: ${f.height || '?'}p`);
        tooltipParts.push(`Container: ${f.ext}`);
        tooltipParts.push(`${isAudio ? 'Audio' : 'Video'} Codec: ${rawCodec}`);
        if (f.fps && !isAudio) tooltipParts.push(`FPS: ${f.fps}`);
        if (bitrate) tooltipParts.push(`Bitrate: ${bitrate}`);
        if (f.filesize) tooltipParts.push(`Size: ${formatBytes(f.filesize)}`);
        const tooltip = tooltipParts.join(' • ');

        return `
            <div class="format-card ${isSelected ? 'selected' : ''}" data-id="${f.format_id}" title="${tooltip}">
                <div class="format-card-header">
                    <span class="format-resolution">${resolutionText}</span>
                    <div class="format-badges">
                        ${badges.map(b => `<span class="format-badge">${b}</span>`).join('')}
                    </div>
                </div>
                <div class="format-details">
                    ${fpsText ? `<span>${fpsText}</span>` : ''}
                    ${bitrate ? `<span>${bitrate}</span>` : ''}
                    ${f.filesize ? `<span>${formatBytes(f.filesize)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    dlFormatsList.querySelectorAll('.format-card').forEach(card => {
        card.addEventListener('click', () => {
            const formatId = card.dataset.id;
            selectedFormatId = formatId;

            dlFormatsList.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');

            isSyncingUI = true;
            syncDropdownsFromFormatCard(formatId);
            isSyncingUI = false;
        });
    });

    // Update toggle button
    if (dlToggleFormatsBtn) {
        if (filtered.length <= 6) {
            dlToggleFormatsBtn.classList.add('hidden');
        } else {
            dlToggleFormatsBtn.classList.remove('hidden');
            dlToggleFormatsBtn.textContent = isFormatsExpanded
                ? 'Show Less'
                : `Show All (${filtered.length})`;
        }
    }
}

function syncDropdownsFromFormatCard(formatId) {
    const dlQualitySelect = get('dl-quality');
    const dlFormatSelect = get('dl-format');
    const dlVideoCodecSelect = get('dl-video-codec');
    const dlFpsSelect = get('dl-fps');
    const dlAudioFormatSelect = get('dl-audio-format');
    const dlAudioBitrateSelect = get('dl-audio-bitrate');
    const dlModeSelect = get('dl-mode');
    const dlFormatTabs = get('dl-format-tabs');

    if (!currentVideoInfo || !currentVideoInfo.formats) return;

    const format = currentVideoInfo.formats.find(f => f.format_id === formatId);
    if (!format) return;

    const isAudio = format.vcodec === 'none';

    const setSelectValue = (selectEl, value, label) => {
        if (!selectEl || value === undefined || value === null) return;
        Array.from(selectEl.options).forEach(opt => {
            if (opt.dataset.temporary === 'true') opt.remove();
        });
        const stringValue = value.toString();
        if (!Array.from(selectEl.options).some(opt => opt.value === stringValue)) {
            const tempOption = document.createElement('option');
            tempOption.value = stringValue;
            tempOption.textContent = label || stringValue;
            tempOption.dataset.temporary = 'true';
            selectEl.appendChild(tempOption);
        }
        selectEl.value = stringValue;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Switch mode tab AND format tab to match format type
    const targetFormatTab = isAudio ? 'audio' : 'video';
    if (currentFormatTab !== targetFormatTab) {
        currentFormatTab = targetFormatTab;
        if (dlFormatTabs) {
            dlFormatTabs.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === targetFormatTab);
            });
        }
        // Trigger re-render with the correct tab
        isSyncingUI = true;
        renderFormats();
        isSyncingUI = false;
    }

    if (dlModeSelect && dlModeSelect.value !== (isAudio ? 'audio' : 'video')) {
        isSyncingUI = true;
        setSelectValue(dlModeSelect, isAudio ? 'audio' : 'video');
        isSyncingUI = false;
    }

    if (isAudio) {
        if (dlAudioFormatSelect) {
            const key = getAudioFormatKey(format);
            if (key) setSelectValue(dlAudioFormatSelect, key, key.toUpperCase());
        }

        if (dlAudioBitrateSelect) {
            const bitrate = Math.round(format.abr || format.tbr || 192);
            setSelectValue(dlAudioBitrateSelect, `${bitrate}k`, `${bitrate} kbps`);
        }
    } else {
        if (dlFormatSelect) setSelectValue(dlFormatSelect, format.ext, format.ext.toUpperCase());

        if (dlQualitySelect && format.height) {
            setSelectValue(dlQualitySelect, format.height.toString(), `${format.height}p`);
        }

        if (dlFpsSelect && format.fps) {
            const fps = Math.round(format.fps);
            setSelectValue(dlFpsSelect, fps.toString(), `${fps} FPS`);
        }

        if (dlVideoCodecSelect) {
            const vcodec = format.vcodec || '';
            let codec = 'copy';
            if (vcodec.startsWith('avc') || vcodec.includes('h264')) codec = 'h264';
            else if (vcodec.startsWith('hev') || vcodec.includes('h265')) codec = 'h265';
            else if (vcodec.startsWith('av01') || vcodec.includes('av1')) codec = 'av1';
            else if (vcodec.startsWith('vp9') || vcodec.includes('vp09')) codec = 'vp9';
            setSelectValue(dlVideoCodecSelect, codec);
        }
    }
}

export async function processVideoUrl(url) {
    const dlUrlInput = get('dl-url');
    const dlPasteBtn = get('dl-paste-btn');
    const dlStartBtn = get('dl-start-btn');
    const dlVideoTitle = get('dl-video-title');
    const dlVideoDuration = get('dl-video-duration');
    const dlVideoChannel = get('dl-video-channel');
    const dlThumbnail = get('dl-thumbnail');
    const dlThumbnailPlaceholder = get('dl-thumbnail-placeholder');
    const dlSettingsPanel = get('dl-settings-panel');
    const dlFormatsSection = get('dl-formats-section');
    const dlOptionsDashboard = get('dl-options-dashboard');
    const dlModeSelect = get('dl-mode');
    const dlAdvancedPanel = get('dl-advanced-panel');
    const dlAudioBitrateSelect = get('dl-audio-bitrate');
    const dlFormatTabs = get('dl-format-tabs');

    const queueView = get('queue-view');
    const navQueue = get('nav-queue');

    url = url.trim();
    if (!url || !/^https?:\/\/.+/.test(url)) {
        return;
    }

    currentDownloadUrl = url;

    if (dlUrlInput) dlUrlInput.value = '';
    if (dlPasteBtn) dlPasteBtn.style.display = 'flex';

    window.currentSingleVideoFileName = null;

    const requestId = ++currentInfoRequestId;

    if (dlStartBtn) dlStartBtn.classList.add('hidden');

    isFormatsExpanded = false;

    if (dlVideoTitle) dlVideoTitle.textContent = 'Loading info...';
    if (dlVideoDuration) dlVideoDuration.textContent = '--:--';
    if (dlVideoChannel) dlVideoChannel.textContent = '--';
    if (dlThumbnail) dlThumbnail.style.display = 'none';
    if (dlThumbnailPlaceholder) {
        dlThumbnailPlaceholder.innerHTML = '<span class="loader-shell" data-loader data-loader-size="32"></span>';
        dlThumbnailPlaceholder.style.display = 'flex';
        renderLoaders({ selector: '#dl-thumbnail-placeholder [data-loader]' });
    }

    if (dlSettingsPanel) dlSettingsPanel.classList.add('hidden');
    if (dlFormatsSection) dlFormatsSection.classList.add('hidden');

    showView(dlOptionsDashboard);

    if (dlModeSelect) {
        const videoOption = dlModeSelect.querySelector('option[value="video"]');
        if (videoOption) {
            videoOption.disabled = false;
            videoOption.hidden = false;
        }
        dlModeSelect.value = 'video';
        dlModeSelect.dispatchEvent(new Event('change'));
    }

    if (dlAudioBitrateSelect) {
        Array.from(dlAudioBitrateSelect.options).forEach(opt => {
            if (opt.dataset.temporary === 'true') opt.remove();
        });
    }

    if (dlSettingsPanel) dlSettingsPanel.classList.add('hidden');
    if (dlAdvancedPanel) dlAdvancedPanel.classList.add('hidden');

    try {
        const isSoundCloud = url.includes('soundcloud.com');
        let info = await window.api.getVideoInfo(url, { disableFlatPlaylist: isSoundCloud });

        if (requestId !== currentInfoRequestId) return;

        const cleanMetadata = (meta) => {
            if (!meta) return meta;
            const queueItem = state.currentEditingQueueId !== null ? state.encodingQueue.find(i => i.id === state.currentEditingQueueId) : null;

            if (!meta.title || meta.title.toLowerCase() === 'playlist' || meta.title.toLowerCase() === 'track') {
                if (queueItem && queueItem.name) {
                    meta.title = queueItem.name;
                } else {
                    try {
                        const urlObj = new URL(url);
                        const pathParts = urlObj.pathname.split('/').filter(p => p);
                        if (pathParts.length > 0) {
                            let slug = pathParts[pathParts.length - 1].replace(/-/g, ' ');
                            meta.title = slug.charAt(0).toUpperCase() + slug.slice(1);
                        }
                    } catch (e) { if (window.api?.logWarn) window.api.logWarn('Ignored error: ' + e); }
                }
            }

            if (!meta.thumbnail && queueItem && queueItem.options && queueItem.options.thumbnail) {
                meta.thumbnail = queueItem.options.thumbnail;
            }

            if ((!meta.channel || meta.channel === 'Unknown') && queueItem && queueItem.options && queueItem.options.channel) {
                meta.channel = queueItem.options.channel;
            }

            return meta;
        };

        if (info && !info.error) {
            if (info.isPlaylist) {
                if (state.currentEditingQueueId !== null) {
                    if (info.entries && info.entries.length > 0) {
                        const entry = info.entries[0];
                        const queueItem = state.encodingQueue.find(i => i.id === state.currentEditingQueueId);

                        let bestThumbnail = entry.thumbnail;
                        if (!bestThumbnail && entry.thumbnails && entry.thumbnails.length > 0) {
                            bestThumbnail = entry.thumbnails[entry.thumbnails.length - 1].url || entry.thumbnails[0].url;
                        }

                        let extractedTitle = entry.fulltitle || entry.original_title || entry.title || entry.track;
                        if (!extractedTitle || extractedTitle.toLowerCase() === 'playlist') {
                            extractedTitle = queueItem ? queueItem.name : (info.title || 'Unknown Title');
                        }

                        info = {
                            isPlaylist: false,
                            id: entry.id,
                            title: extractedTitle,
                            thumbnail: bestThumbnail,
                            duration: entry.duration_string || (entry.duration ? formatDurationFromSeconds(entry.duration) : '--:--'),
                            channel: entry.uploader || entry.artist || entry.channel || (entry.user ? entry.user.username : null) || 'Unknown',
                            extractor: entry.extractor || info.extractor,
                            isVideo: entry.vcodec !== 'none'
                        };
                    } else {
                        throw new Error('No video information found in playlist.');
                    }
                } else {
                    const choice = await showPlaylistConfirm(info.title, info.count);

                    if (requestId !== currentInfoRequestId) return;

                    if (choice) {
                        info.entries.forEach((entry, index) => {
                            // Try to get the URL from various possible fields
                            let entryUrl = entry.url || entry.webpage_url || entry.original_url;
                            
                            if (!entryUrl && entry.id) {
                                // Try to construct URL based on extractor type
                                const extractor = entry.extractor || info.extractor || '';
                                const extractorKey = extractor.toLowerCase().replace(/[^a-z0-9]/g, '');
                                
                                if (extractorKey.includes('youtube') || url.includes('youtube.com') || url.includes('youtu.be')) {
                                    entryUrl = `https://www.youtube.com/watch?v=${entry.id}`;
                                } else if (entry.url_direct) {
                                    entryUrl = entry.url_direct;
                                }
                                // For SoundCloud and other platforms, the entry should have a URL field
                                // if disableFlatPlaylist was used when fetching
                            }

                            if (entryUrl) {
                                let name = entry.fulltitle || entry.original_title || entry.title || entry.track;

                                if (!name) {
                                    try {
                                        const urlObj = new URL(entryUrl);
                                        const pathParts = urlObj.pathname.split('/').filter(p => p);
                                        if (pathParts.length > 0) {
                                            name = pathParts[pathParts.length - 1]
                                                .replace(/-/g, ' ');
                                            name = name.charAt(0).toUpperCase() + name.slice(1);
                                        }
                                    } catch (e) { if (window.api?.logWarn) window.api.logWarn('Ignored error: ' + e); }
                                }

                                let finalName = name || `Track ${index + 1}`;

                                let options = {
                                    input: finalName,
                                    fileName: sanitizeFilename(finalName),
                                    url: entryUrl,
                                    thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails.length > 0 ? entry.thumbnails[entry.thumbnails.length - 1].url : null),
                                    channel: entry.uploader || entry.artist || entry.channel || (entry.user ? entry.user.username : null) || 'Unknown',
                                    mode: 'video',
                                    quality: 'best',
                                    format: 'mp4',
                                    audioFormat: 'mp3',
                                    audioBitrate: '192k'
                                };

                                if (choice === 'audio') {
                                    options.mode = 'audio';
                                    options.format = 'mp3';
                                }

                                addToQueue(options, 'download');
                            } else {
                                if (window.api?.logWarn) window.api.logWarn(`Skipping playlist entry ${index + 1}: no URL available`);
                            }
                        });

                        showPopup(`Added ${info.count} items to queue as ${choice === 'audio' ? 'Audio' : 'Video'}.`);
                        showView(queueView);
                        resetNav();
                        if (navQueue) navQueue.classList.add('active');
                    } else {
                        const downloaderDashboard = get('downloader-dashboard');
                        showView(downloaderDashboard);
                    }
                    return;
                }
            }

            info = cleanMetadata(info);

            if (dlSettingsPanel) {
                dlSettingsPanel.classList.remove('hidden');
                dlSettingsPanel.classList.remove('container-loaded');
                void dlSettingsPanel.offsetWidth;
                dlSettingsPanel.classList.add('container-loaded');
            }

            if (!info.title || ['playlist', 'track', 'unknown'].includes(info.title.toLowerCase())) {
                const queueItem = state.currentEditingQueueId !== null ? state.encodingQueue.find(i => i.id === state.currentEditingQueueId) : null;
                if (queueItem && queueItem.name) {
                    info.title = queueItem.name;
                } else {
                    try {
                        const urlObj = new URL(url);
                        const pathParts = urlObj.pathname.split('/').filter(p => p);
                        if (pathParts.length > 0) {
                            let slug = pathParts[pathParts.length - 1].replace(/-/g, ' ');
                            info.title = slug.charAt(0).toUpperCase() + slug.slice(1);
                        }
                    } catch (e) { if (window.api?.logWarn) window.api.logWarn('Ignored error: ' + e); }
                }
            }

            if (dlVideoTitle) {
                dlVideoTitle.textContent = info.title;
                if (dlThumbnailPlaceholder && !info.thumbnail) {
                    dlThumbnailPlaceholder.style.display = 'none';
                }
                if (info.title) {
                    window.currentSingleVideoFileName = sanitizeFilename(info.title);
                }
                dlVideoTitle.classList.remove('text-loaded');
                void dlVideoTitle.offsetWidth;
                dlVideoTitle.classList.add('text-loaded');
            }
            if (dlVideoDuration) {
                dlVideoDuration.textContent = info.duration;
                dlVideoDuration.classList.remove('text-loaded');
                void dlVideoDuration.offsetWidth;
                dlVideoDuration.classList.add('text-loaded');
            }
            if (dlVideoChannel) {
                dlVideoChannel.textContent = info.channel;
                dlVideoChannel.classList.remove('text-loaded');
                void dlVideoChannel.offsetWidth;
                dlVideoChannel.classList.add('text-loaded');
            }
            if (info.thumbnail && dlThumbnail) {
                dlThumbnail.src = info.thumbnail;
                dlThumbnail.style.display = 'block';
                if (dlThumbnailPlaceholder) dlThumbnailPlaceholder.style.display = 'none';
            }

            if (dlStartBtn) dlStartBtn.classList.remove('hidden');

            currentVideoInfo = info;
            selectedFormatId = null;

            if (dlFormatsSection) {
                dlFormatsSection.classList.remove('hidden');
                dlFormatsSection.classList.remove('container-loaded');
                void dlFormatsSection.offsetWidth;
                dlFormatsSection.classList.add('container-loaded');

                if (info.isVideo === false || (info.extractor && info.extractor.toLowerCase() === 'soundcloud')) {
                    currentFormatTab = 'audio';
                    const audioTabBtn = dlFormatTabs ? dlFormatTabs.querySelector('[data-tab="audio"]') : null;
                    if (audioTabBtn && dlFormatTabs) {
                        dlFormatTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                        audioTabBtn.classList.add('active');
                    }
                } else {
                    currentFormatTab = 'video';
                    const videoTabBtn = dlFormatTabs ? dlFormatTabs.querySelector('[data-tab="video"]') : null;
                    if (videoTabBtn && dlFormatTabs) {
                        dlFormatTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                        videoTabBtn.classList.add('active');
                    }
                }
                renderFormats();
                syncFormatCardFromDropdowns();
            }

            if (info.isVideo === false || (info.extractor && info.extractor.toLowerCase() === 'soundcloud')) {
                if (dlModeSelect) {
                    dlModeSelect.value = 'audio';
                    const videoOption = dlModeSelect.querySelector('option[value="video"]');
                    if (videoOption) {
                        videoOption.disabled = true;
                        videoOption.hidden = true;
                    }
                    dlModeSelect.dispatchEvent(new Event('change'));
                }
            } else {
                if (dlAdvancedPanel) {
                    dlAdvancedPanel.classList.remove('hidden');
                    dlAdvancedPanel.classList.remove('container-loaded');
                    void dlAdvancedPanel.offsetWidth;
                    dlAdvancedPanel.classList.add('container-loaded');
                }
            }
        } else {
            const downloaderDashboard = get('downloader-dashboard');
            showPopup(`Error: ${info.error || 'Could not load video info.'}`);
            showView(downloaderDashboard);
        }
    } catch (err) {
        if (window.api?.logError) window.api.logError('Failed to get video info:', err); else console.error('Failed to get video info:', err);
        const downloaderDashboard = get('downloader-dashboard');
        showPopup(`Error: ${err.message || 'Error loading video info'}`);
        showView(downloaderDashboard);
    }
}

export function setupDownloaderHandlers() {
    const navDownloader = get('nav-downloader');
    const dlPasteBtn = get('dl-paste-btn');
    const dlUrlInput = get('dl-url');
    const dlBackBtn = get('dl-back-btn');
    const dlStartBtn = get('dl-start-btn');
    const dlModeSelect = get('dl-mode');
    const dlToggleFormatsBtn = get('dl-toggle-formats-btn');
    const dlQualitySelect = get('dl-quality');
    const dlFormatSelect = get('dl-format');
    const dlVideoCodecSelect = get('dl-video-codec');
    const dlFpsSelect = get('dl-fps');
    const dlAudioFormatSelect = get('dl-audio-format');
    const dlAudioBitrateSelect = get('dl-audio-bitrate');
    const dlFormatTabs = get('dl-format-tabs');
    const dlFormatsSection = get('dl-formats-section');
    const dlOpenFileBtn = get('dl-open-file-btn');
    const dlOpenFolderBtn = get('dl-open-folder-btn');
    const dlNewDownloadBtn = get('dl-new-download-btn');

    // Register IPC callbacks
    if (window.api) {
        window.api.onDownloadProgress((data) => {
            const dlProgressRing = get('dl-progress-ring');
            const dlProgressPercent = get('dl-progress-percent');
            const dlSpeed = get('dl-speed');
            const dlEta = get('dl-eta');
            const dlSize = get('dl-size');
            const dlStatusText = get('dl-status-text');

            if (data.percent !== undefined && data.percent !== null) {
                const percent = parseFloat(data.percent);
                const offset = 502 - (502 * percent / 100);
                if (dlProgressRing) dlProgressRing.style.strokeDashoffset = offset;
                if (dlProgressPercent) dlProgressPercent.textContent = `${Math.round(percent)}%`;
            }
            if (data.speed && dlSpeed) dlSpeed.textContent = data.speed;
            if (data.eta && dlEta) dlEta.textContent = data.eta;
            if (data.size && dlSize) dlSize.textContent = data.size;
            if (data.status && dlStatusText) dlStatusText.textContent = data.status;

            // Queue Support
            if (state.isQueueRunning && state.currentlyEncodingItemId !== null) {
                const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
                if (item && data.percent !== undefined && data.percent !== null) {
                    item.progress = Math.round(parseFloat(data.percent));
                    updateQueueUI();
                }
            }
        });

        window.api.onDownloadComplete((message) => {
            const dlCompleteView = get('dl-complete-view');
            const dlOutputPath = get('dl-output-path');
            const dlUrlInput = get('dl-url');
            const dlProgressRing = get('dl-progress-ring');
            const dlProgressPercent = get('dl-progress-percent');

            currentDlOutputPath = message.outputPath || '';
            if (dlOutputPath) dlOutputPath.textContent = currentDlOutputPath || 'Output folder';

            // Update progress to 100% on completion
            if (dlProgressRing) dlProgressRing.style.strokeDashoffset = 0;
            if (dlProgressPercent) dlProgressPercent.textContent = '100%';

            if (state.isQueueRunning && state.currentlyEncodingItemId !== null) {
                const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
                if (item) {
                    item.status = 'completed';
                    item.progress = 100;
                }
                updateQueueUI();
                setTimeout(processQueue, 500);
            } else {
                showView(dlCompleteView);
                toggleSidebar(false);
                if (dlUrlInput) dlUrlInput.value = '';
            }
        });

        window.api.onDownloadError((error) => {
            if (state.isQueueRunning && state.currentlyEncodingItemId !== null) {
                const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
                if (item) {
                    item.status = 'failed';
                    item.error = error.message;
                }
                updateQueueUI();
                state.setQueueRunning(false);
                state.setCurrentlyEncodingItemId(null);
                updateQueueStatusUI();
                toggleSidebar(false);
                showPopup(`Download Error: ${error.message}`);
            } else {
                showPopup(`Download Error: ${error.message}`);
                const downloaderDashboard = get('downloader-dashboard');
                showView(downloaderDashboard);
                toggleSidebar(false);
            }
        });
    }

    if (navDownloader) {
        navDownloader.addEventListener('click', () => {
            showDownloader();
        });
    }

    if (dlPasteBtn) {
        dlPasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (dlUrlInput) {
                    dlUrlInput.value = text;
                    if (text && text.trim()) {
                        processVideoUrl(text.trim());
                    }
                }
            } catch (err) {
                if (window.api?.logError) window.api.logError('Failed to read clipboard', err); else console.error('Failed to read clipboard', err);
            }
        });
    }

    let urlInputTimer;
    if (dlUrlInput) {
        dlUrlInput.addEventListener('input', (e) => {
            const url = e.target.value.trim();
            clearTimeout(urlInputTimer);

            if (url && url.length > 8) { // Minimal length check
                urlInputTimer = setTimeout(() => {
                    processVideoUrl(url);
                }, 800);
            }
        });
    }

    if (dlModeSelect) {
        dlModeSelect.addEventListener('change', () => {
            const isAudio = dlModeSelect.value === 'audio';
            const dlAudioFormatGroup = get('dl-audio-format-group');
            const dlAudioBitrateGroup = get('dl-audio-bitrate-group');
            const dlVideoQualityGroup = get('dl-video-quality-group');
            const dlVideoFormatGroup = get('dl-video-format-group');
            const dlFpsGroup = get('dl-fps-group');
            const dlVideoCodecGroup = get('dl-video-codec-group');
            const dlAdvancedPanel = get('dl-advanced-panel');
            const dlSettingsPanel = get('dl-settings-panel');

            const applyModeUI = () => {
                if (dlAudioFormatGroup) dlAudioFormatGroup.classList.toggle('hidden', !isAudio);
                if (dlAudioBitrateGroup) dlAudioBitrateGroup.classList.toggle('hidden', !isAudio);
                if (dlVideoQualityGroup) dlVideoQualityGroup.classList.toggle('hidden', isAudio);
                if (dlVideoFormatGroup) dlVideoFormatGroup.classList.toggle('hidden', isAudio);
                if (dlFpsGroup) dlFpsGroup.classList.toggle('hidden', isAudio);
                if (dlVideoCodecGroup) dlVideoCodecGroup.classList.toggle('hidden', isAudio);

                if (dlAdvancedPanel) {
                    const isCurrentlyHidden = dlAdvancedPanel.classList.contains('hidden');
                    dlAdvancedPanel.classList.toggle('hidden', isAudio);
                    if (isCurrentlyHidden && !isAudio) {
                        dlAdvancedPanel.classList.remove('container-loaded');
                        void dlAdvancedPanel.offsetWidth;
                        dlAdvancedPanel.classList.add('container-loaded');
                    }
                }

                const targetTab = isAudio ? 'audio' : 'video';
                if (currentFormatTab !== targetTab) {
                    currentFormatTab = targetTab;
                    if (dlFormatTabs) {
                        dlFormatTabs.querySelectorAll('.tab-btn').forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.tab === targetTab);
                        });
                    }
                    renderFormats();
                }
            };

            animateAutoHeight(dlSettingsPanel, applyModeUI);

            if (!isSyncingUI) syncFormatCardFromDropdowns();
        });
    }

    if (dlToggleFormatsBtn) {
        dlToggleFormatsBtn.addEventListener('click', () => {
            isFormatsExpanded = !isFormatsExpanded;
            renderFormats();
        });
    }

    // Format tab switcher (Video/Audio)
    if (dlFormatTabs) {
        dlFormatTabs.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                animateAutoHeight(dlFormatsSection, () => {
                    currentFormatTab = tab;
                    dlFormatTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderFormats();
                    syncFormatCardFromDropdowns();
                });
            });
        });
    }

    [dlQualitySelect, dlFormatSelect, dlVideoCodecSelect, dlFpsSelect, dlAudioFormatSelect, dlAudioBitrateSelect].forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                if (!isSyncingUI) syncFormatCardFromDropdowns();
            });
        }
    });

    if (dlBackBtn) {
        dlBackBtn.addEventListener('click', () => {
            currentInfoRequestId++;
            clearTimeout(urlInputTimer);

            const popupOverlay = get('popup-overlay');
            if (popupOverlay) popupOverlay.classList.add('hidden');

            if (state.currentEditingQueueId !== null && state.encodingQueue.find(i => i.id === state.currentEditingQueueId)?.taskType === 'download') {
                state.setCurrentEditingQueueId(null);
                if (dlStartBtn) {
                    dlStartBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Start Download
                    `;
                    dlStartBtn.classList.remove('secondary-btn');
                    dlStartBtn.classList.add('primary-btn');
                }
                const queueView = get('queue-view');
                showView(queueView);
            } else {
                if (dlAudioBitrateSelect) {
                    Array.from(dlAudioBitrateSelect.options).forEach(opt => {
                        if (opt.dataset.temporary === 'true') opt.remove();
                    });
                }
                const downloaderDashboard = get('downloader-dashboard');
                showView(downloaderDashboard);
            }
            currentDownloadUrl = '';
        });
    }

    if (dlStartBtn) {
        dlStartBtn.addEventListener('click', () => {
            const dlUrlInput = get('dl-url');
            const dlThumbnail = get('dl-thumbnail');
            const dlVideoChannel = get('dl-video-channel');
            const dlModeSelect = get('dl-mode');
            const dlQualitySelect = get('dl-quality');
            const dlFormatSelect = get('dl-format');
            const dlFpsSelect = get('dl-fps');
            const dlVideoBitrateSelect = get('dl-video-bitrate');
            const dlVideoCodecSelect = get('dl-video-codec');
            const dlAudioFormatSelect = get('dl-audio-format');
            const dlAudioBitrateSelect = get('dl-audio-bitrate');
            const dlProgressView = get('dl-progress-view');

            const url = currentDownloadUrl || (dlUrlInput ? dlUrlInput.value.trim() : '');
            if (!url) {
                showPopup('Please enter a valid video URL.');
                return;
            }

            const options = {
                url: url,
                file_name: window.currentSingleVideoFileName,
                thumbnail: (dlThumbnail && dlThumbnail.style.display !== 'none') ? dlThumbnail.src : null,
                channel: dlVideoChannel ? dlVideoChannel.textContent : 'Unknown',
                mode: dlModeSelect ? dlModeSelect.value : 'video',
                quality: dlQualitySelect ? dlQualitySelect.value : 'best',
                format: dlFormatSelect ? dlFormatSelect.value : 'mp4',
                format_id: selectedFormatId,
                fps: dlFpsSelect ? dlFpsSelect.value : 'none',
                video_bitrate: dlVideoBitrateSelect ? dlVideoBitrateSelect.value : 'none',
                video_codec: dlVideoCodecSelect ? dlVideoCodecSelect.value : 'copy',
                audio_format: dlAudioFormatSelect ? dlAudioFormatSelect.value : 'mp3',
                audio_bitrate: dlAudioBitrateSelect ? dlAudioBitrateSelect.value : '192k',
                output_path: get('output-folder')?.value || ''
            };

            if (state.currentEditingQueueId !== null) {
                const item = state.encodingQueue.find(i => i.id === state.currentEditingQueueId);
                if (item && item.taskType === 'download') {
                    if (item.options.fileName && !options.fileName) {
                        options.fileName = item.options.fileName;
                    }

                    item.options = options;

                    if (item.status === 'failed' || item.status === 'pending') {
                        item.status = 'pending';
                        item.progress = 0;
                        item.error = null;
                    }

                    state.setCurrentEditingQueueId(null);
                    dlStartBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Start Download
                    `;

                    const queueView = get('queue-view');
                    showView(queueView);
                    updateQueueUI();
                    showPopup('Queue item updated');
                    return;
                }
            }

            showView(dlProgressView);
            toggleSidebar(true);

            const dlProgressRing = get('dl-progress-ring');
            const dlProgressPercent = get('dl-progress-percent');
            const dlStatusText = get('dl-status-text');
            const dlSpeed = get('dl-speed');
            const dlEta = get('dl-eta');
            const dlSize = get('dl-size');

            if (dlProgressRing) dlProgressRing.style.strokeDashoffset = 502;
            if (dlProgressPercent) dlProgressPercent.textContent = '0%';
            if (dlStatusText) dlStatusText.textContent = 'Starting download...';
            if (dlSpeed) dlSpeed.textContent = '--';
            if (dlEta) dlEta.textContent = '--:--';
            if (dlSize) dlSize.textContent = '--';

            window.api.downloadVideo(options);
        });
    }

    if (dlOpenFileBtn) {
        dlOpenFileBtn.addEventListener('click', () => {
            if (currentDlOutputPath && currentDlOutputPath.trim() !== '') {
                window.api.openFile(currentDlOutputPath);
            } else {
                showPopup('No file path available. Please wait for download to complete.');
            }
        });
    }

    if (dlOpenFolderBtn) {
        dlOpenFolderBtn.addEventListener('click', () => {
            if (currentDlOutputPath && currentDlOutputPath.trim() !== '') {
                window.api.openFolder(currentDlOutputPath);
            } else {
                showPopup('No file path available. Please wait for download to complete.');
            }
        });
    }

    if (dlNewDownloadBtn) {
        dlNewDownloadBtn.addEventListener('click', () => {
            currentDownloadUrl = '';
            selectedFormatId = null;
            const dlUrlInput = get('dl-url');
            if (dlUrlInput) dlUrlInput.value = '';
            showDownloader();
        });
    }

    const dlCancelBtn = get('dl-cancel-btn');
    if (dlCancelBtn) {
        dlCancelBtn.addEventListener('click', () => {
            if (window.api && window.api.cancelDownload) {
                window.api.cancelDownload();
            }
            // Return to main URL input view and re-enable sidebar
            toggleSidebar(false);
            showDownloader();
            showPopup('Download cancelled.');
        });
    }
}
