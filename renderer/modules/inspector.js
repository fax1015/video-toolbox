// Media Inspector Module

import { get, showPopup, formatBytes, formatDurationFromSeconds, renderLoaders } from './ui-utils.js';
import { showView } from './ui-utils.js';

let currentInspectorFilePath = null;
let currentInspectorData = null;
let currentInspectorFileType = null;
let inspectorRawToggleBound = false;

function setupInspectorRawJsonToggle() {
    if (inspectorRawToggleBound) return;

    const rawToggle = document.querySelector('.inspector-raw-toggle');
    if (!rawToggle) return;

    inspectorRawToggleBound = true;
    rawToggle.addEventListener('toggle', () => {
        if (!rawToggle.open || !currentInspectorData) return;
        const inspectorContent = get('inspector-content');
        if (inspectorContent) {
            inspectorContent.textContent = JSON.stringify(currentInspectorData, null, 2);
        }
    });
}

// Detect file type (video, audio, or image) from metadata
function detectFileType(data) {
    console.log('[DEBUG detectFileType] Input data:', JSON.stringify(data, null, 2));
    
    if (!data) {
        console.log('[DEBUG detectFileType] No data, returning unknown');
        return 'unknown';
    }
    
    const format = data.format;
    const streams = data.streams;
    
    console.log('[DEBUG detectFileType] format:', format);
    console.log('[DEBUG detectFileType] streams:', streams);
    
    if (!format || !streams || streams.length === 0) {
        console.log('[DEBUG detectFileType] Missing format or streams, returning unknown');
        return 'unknown';
    }
    
    const formatName = format.format_name?.toLowerCase() || '';
    console.log('[DEBUG detectFileType] formatName:', formatName);
    
    // Check for image formats
    const imageFormats = ['image', 'jpeg', 'jpg', 'png', 'bmp', 'gif', 'tiff', 'webp', 'heif', 'heic', 'avif'];
    const imageCodecs = ['mjpeg', 'jpeg', 'jpg', 'png', 'bmp', 'gif', 'tiff', 'webp', 'heif', 'heic', 'avif'];
    
    // Check format name
    const formatMatch = imageFormats.some(f => formatName.includes(f));
    console.log('[DEBUG detectFileType] formatName.includes check:', formatMatch, 'for formats:', imageFormats);
    if (formatMatch) {
        console.log('[DEBUG detectFileType] Detected as IMAGE from format name');
        return 'image';
    }
    
    // Check stream codecs
    for (const stream of streams) {
        const codecType = stream.codec_type;
        const codecName = stream.codec_name?.toLowerCase();
        
        console.log('[DEBUG detectFileType] Checking stream:', { codecType, codecName });
        
        if (codecType === 'video') {
            const isImageCodec = codecName && imageCodecs.includes(codecName);
            console.log('[DEBUG detectFileType] Video stream - isImageCodec:', isImageCodec, 'checking against:', imageCodecs);
            if (isImageCodec) {
                console.log('[DEBUG detectFileType] Detected as IMAGE from codec name');
                return 'image';
            }
        }
    }
    
    // Check for audio-only files (no video stream)
    const hasVideo = streams.some(s => s.codec_type === 'video');
    console.log('[DEBUG detectFileType] hasVideo:', hasVideo);
    if (!hasVideo) {
        const hasAudio = streams.some(s => s.codec_type === 'audio');
        console.log('[DEBUG detectFileType] hasAudio:', hasAudio);
        if (hasAudio) {
            console.log('[DEBUG detectFileType] Detected as AUDIO');
            return 'audio';
        }
    }
    
    // Default to video (for files with video streams)
    console.log('[DEBUG detectFileType] Defaulting to VIDEO');
    return 'video';
}

function renderStreamInfo(streams, format) {
    const inspectorStreams = get('inspector-streams');

    if (!inspectorStreams || !streams) {
        if (inspectorStreams) inspectorStreams.innerHTML = '<p style="color:var(--text-muted)">No stream information available</p>';
        return;
    }

    const isImageCodec = (codecName) => {
        if (!codecName) return false;
        const imageCodecs = ['mjpeg', 'jpeg', 'jpg', 'png', 'bmp', 'gif', 'tiff', 'webp', 'heif', 'heic'];
        return imageCodecs.includes(codecName.toLowerCase());
    };
    const isImageFormat = (formatName) => {
        if (!formatName) return false;
        return formatName.toLowerCase().includes('image');
    };

    inspectorStreams.innerHTML = streams.map((stream, index) => {
        const type = stream.codec_type || 'unknown';
        const codec = stream.codec_name || 'Unknown';
        const displayType = type === 'video' && (isImageCodec(stream.codec_name) || isImageFormat(format?.format_name))
            ? 'image'
            : type;
        const details = [];
        const addDetail = (value) => {
            if (value) details.push(value);
        };
        const addBitRate = (bitRate) => {
            if (!bitRate) return;
            const rate = Math.round(parseInt(bitRate, 10) / 1000);
            if (Number.isFinite(rate)) details.push(`${rate} kbps`);
        };
        const addDuration = (duration) => {
            if (!duration) return;
            const seconds = parseFloat(duration);
            if (Number.isFinite(seconds)) details.push(formatDurationFromSeconds(seconds));
        };
        const addLanguage = () => addDetail(stream.tags?.language);

        if (type === 'video') {
            if (stream.width && stream.height) details.push(`${stream.width}×${stream.height}`);
            if (stream.r_frame_rate && displayType !== 'image') {
                const [num, den] = stream.r_frame_rate.split('/');
                const fps = parseFloat(num) / parseFloat(den);
                if (Number.isFinite(fps)) details.push(`${fps.toFixed(2)} fps`);
            }
            addBitRate(stream.bit_rate);
            addDetail(stream.pix_fmt);
            addDetail(stream.color_space);
            addDuration(stream.duration);
        } else if (type === 'audio') {
            addDetail(stream.sample_rate ? `${stream.sample_rate} Hz` : null);
            addDetail(stream.channels ? `${stream.channels} ch` : null);
            addBitRate(stream.bit_rate);
            addDetail(stream.channel_layout);
            addDuration(stream.duration);
        } else if (type === 'subtitle') {
            addLanguage();
            addDetail(stream.tags?.title);
            addDetail(stream.codec_tag_string);
        } else {
            addLanguage();
            addDetail(stream.codec_long_name);
            addDetail(stream.codec_tag_string);
            addDetail(stream.profile);
            addBitRate(stream.bit_rate);
            addDuration(stream.duration);
            addDetail(stream.tags?.title);
            addDetail(stream.tags?.filename);
            addDetail(stream.tags?.mimetype);
        }

        return `
            <div class="stream-card container-loaded">
                <div class="stream-card-header">
                    <span class="stream-type-badge ${displayType}">${displayType.toUpperCase()}</span>
                    <span class="stream-codec">${codec.toUpperCase()}</span>
                    <span style="color:var(--text-muted);font-size:0.8em;">Stream #${index}</span>
                </div>
                <div class="stream-details">
                    ${details.map(d => `<span class="stream-detail">${d}</span>`).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function populateMetadataFields(data) {
    console.log('[DEBUG populateMetadataFields] Called with data:', data);
    
    const metaTitle = get('meta-title');
    const metaArtist = get('meta-artist');
    const metaAlbum = get('meta-album');
    const metaYear = get('meta-year');
    const metaGenre = get('meta-genre');
    const metaTrack = get('meta-track');
    const metaComment = get('meta-comment');
    const inspectorFormat = get('inspector-format');
    const inspectorDuration = get('inspector-duration');
    const inspectorSize = get('inspector-size');
    const inspectorBitrate = get('inspector-bitrate');
    const metadataPanel = document.querySelector('.settings-panel');
    
    console.log('[DEBUG populateMetadataFields] metadataPanel element:', metadataPanel);
    console.log('[DEBUG populateMetadataFields] All .settings-panel elements:', document.querySelectorAll('.settings-panel'));

    // Reset metadata panel to visible by default (will be hidden for images after detection)
    if (metadataPanel) {
        metadataPanel.style.display = 'block';
    }
    
    // Reset buttons to enabled state
    let saveBtn = get('inspector-save-btn');
    let clearBtn = get('inspector-clear-btn');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.title = '';
    }
    if (clearBtn) {
        clearBtn.disabled = false;
        clearBtn.style.opacity = '1';
        clearBtn.title = '';
    }

    // Detect file type based on format and streams
    const fileType = detectFileType(data);
    currentInspectorFileType = fileType;
    console.log('[DEBUG populateMetadataFields] Detected fileType:', fileType);
    
    // Show/hide metadata editor based on file type
    // Images don't support standard metadata tags, only EXIF
    if (metadataPanel) {
        console.log('[DEBUG populateMetadataFields] Setting metadataPanel.display for fileType:', fileType);
        if (fileType === 'image') {
            // Hide metadata editor for images - they use EXIF instead
            metadataPanel.style.display = 'none';
            console.log('[DEBUG populateMetadataFields] HIDING metadata panel (image detected)');
        } else {
            // Show metadata editor for video and audio files
            metadataPanel.style.display = 'block';
            console.log('[DEBUG populateMetadataFields] SHOWING metadata panel (non-image detected)');
        }
    } else {
        console.log('[DEBUG populateMetadataFields] WARNING: metadataPanel is null!');
    }
    
    // Also handle save button visibility for images
    if (saveBtn) {
        saveBtn.disabled = fileType === 'image';
        saveBtn.style.opacity = fileType === 'image' ? '0.5' : '1';
        if (fileType === 'image') {
            saveBtn.title = 'Metadata editing is not supported for image files';
        } else {
            saveBtn.title = '';
        }
    }
    if (clearBtn) {
        clearBtn.disabled = fileType === 'image';
        clearBtn.style.opacity = fileType === 'image' ? '0.5' : '1';
        if (fileType === 'image') {
            clearBtn.title = 'Metadata editing is not supported for image files';
        } else {
            clearBtn.title = '';
        }
    }
    
    // Add file type indicator to the file card if not present
    const inspectorView = get('inspector-view');
    let typeIndicator = inspectorView?.querySelector('.file-type-indicator');
    if (!typeIndicator && inspectorView) {
        typeIndicator = document.createElement('span');
        typeIndicator.className = 'file-type-indicator meta-tag';
        const fileMeta = inspectorView.querySelector('.file-meta');
        if (fileMeta) {
            fileMeta.insertBefore(typeIndicator, fileMeta.firstChild);
        }
    }
    if (typeIndicator) {
        typeIndicator.textContent = fileType === 'image' ? 'IMAGE' : (fileType === 'audio' ? 'AUDIO' : 'VIDEO');
    }

    if (metaTitle) metaTitle.value = '';
    if (metaArtist) metaArtist.value = '';
    if (metaAlbum) metaAlbum.value = '';
    if (metaYear) metaYear.value = '';
    if (metaGenre) metaGenre.value = '';
    if (metaTrack) metaTrack.value = '';
    if (metaComment) metaComment.value = '';

    // Only populate metadata fields for video/audio files
    if (fileType !== 'image' && data.format) {
        const fmt = data.format;
        if (inspectorFormat) inspectorFormat.textContent = (fmt.format_name || 'Unknown').toUpperCase().split(',')[0];
        if (inspectorDuration) inspectorDuration.textContent = fmt.duration ? formatDurationFromSeconds(parseFloat(fmt.duration)) : 'Unknown';
        if (inspectorSize) inspectorSize.textContent = fmt.size ? formatBytes(parseInt(fmt.size)) : 'Unknown';
        if (inspectorBitrate) inspectorBitrate.textContent = fmt.bit_rate ? `${Math.round(parseInt(fmt.bit_rate) / 1000)} kbps` : 'Unknown';

        const tags = fmt.tags || {};
        if (metaTitle) metaTitle.value = tags.title || tags.TITLE || '';
        if (metaArtist) metaArtist.value = tags.artist || tags.ARTIST || tags.author || '';
        if (metaAlbum) metaAlbum.value = tags.album || tags.ALBUM || '';
        if (metaYear) metaYear.value = tags.date || tags.DATE || tags.year || '';
        if (metaGenre) metaGenre.value = tags.genre || tags.GENRE || '';
        if (metaTrack) metaTrack.value = tags.track || tags.TRACK || '';
        if (metaComment) metaComment.value = tags.comment || tags.COMMENT || tags.description || '';
    }

    renderStreamInfo(data.streams, data.format);
}

function clearMetadataFields() {
    const metaTitle = get('meta-title');
    const metaArtist = get('meta-artist');
    const metaAlbum = get('meta-album');
    const metaYear = get('meta-year');
    const metaGenre = get('meta-genre');
    const metaTrack = get('meta-track');
    const metaComment = get('meta-comment');

    if (metaTitle) metaTitle.value = '';
    if (metaArtist) metaArtist.value = '';
    if (metaAlbum) metaAlbum.value = '';
    if (metaYear) metaYear.value = '';
    if (metaGenre) metaGenre.value = '';
    if (metaTrack) metaTrack.value = '';
    if (metaComment) metaComment.value = '';
}

export async function loadInspectorFile(filePath) {
    const inspectorFilename = get('inspector-filename');
    const inspectorFileIcon = get('inspector-file-icon');
    const inspectorContent = get('inspector-content');
    const inspectorStreams = get('inspector-streams');
    const inspectorView = get('inspector-view');
    const rawToggle = document.querySelector('.inspector-raw-toggle');

    currentInspectorFilePath = filePath;
    currentInspectorData = null;
    currentInspectorFileType = null;
    showView(inspectorView);

    const filename = filePath.split(/[\\/]/).pop();
    const ext = filename.split('.').pop().toUpperCase();

    if (inspectorFilename) inspectorFilename.textContent = filename;
    if (inspectorFileIcon) inspectorFileIcon.textContent = ext;
    if (inspectorContent) {
        inspectorContent.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;color:var(--text-muted)">
                <span class="loader-shell" data-loader data-loader-size="18"></span>
                Loading metadata...
            </div>
        `;
    }
    if (inspectorStreams) {
        inspectorStreams.innerHTML = `
            <div style="display:flex;justify-content:center;padding:40px;width:100%">
                <span class="loader-shell" data-loader data-loader-size="40"></span>
            </div>
        `;
    }
    renderLoaders({ selector: '#inspector-view [data-loader]' });

    try {
        if (window.api?.logInfo) window.api.logInfo('[Inspector] Loading metadata for:', filePath); else console.log('[Inspector] Loading metadata for:', filePath);

        let data;
        try {
            data = await window.api.getMetadataFull(filePath);
            if (window.api?.logInfo) window.api.logInfo('[Inspector] API call succeeded, data type:', typeof data); else console.log('[Inspector] API call succeeded, data type:', typeof data);
            if (window.api?.logInfo) window.api.logInfo('[Inspector] Raw metadata response:', data); else console.log('[Inspector] Raw metadata response:', data);
        } catch (apiError) {
            if (window.api?.logError) window.api.logError('[Inspector] API call failed:', apiError); else console.error('[Inspector] API call failed:', apiError);
            if (inspectorContent) inspectorContent.textContent = 'Error loading metadata: ' + apiError.message;
            showPopup('Error loading metadata: ' + apiError.message);
            return;
        }

        if (!data) {
            if (window.api?.logError) window.api.logError('[Inspector] No data returned'); else console.error('[Inspector] No data returned');
            if (inspectorContent) inspectorContent.textContent = 'Error: No data returned';
            showPopup('No metadata returned');
            return;
        }

        if (window.api?.logInfo) window.api.logInfo('[Inspector] Has format:', !!data.format); else console.log('[Inspector] Has format:', !!data.format);
        if (window.api?.logInfo) window.api.logInfo('[Inspector] Has streams:', !!data.streams); else console.log('[Inspector] Has streams:', !!data.streams);
        if (data.streams) {
            if (window.api?.logInfo) window.api.logInfo('[Inspector] Number of streams:', data.streams.length); else console.log('[Inspector] Number of streams:', data.streams.length);
        }

        // Note: data.error check removed - Tauri errors are thrown, not returned as objects
        // The try-catch above handles errors properly

        currentInspectorData = data;
        populateMetadataFields(data);
        if (window.api?.logInfo) window.api.logInfo('[Inspector] Metadata populated successfully'); else console.log('[Inspector] Metadata populated successfully');
        if (rawToggle && rawToggle.open && inspectorContent) {
            inspectorContent.textContent = JSON.stringify(data, null, 2);
        }

    } catch (e) {
        // This catch block is now redundant since we handle errors in the inner try-catch
        // Keeping it as a fallback for unexpected errors
        if (window.api?.logError) window.api.logError('[Inspector] Unexpected error:', e); else console.error('[Inspector] Unexpected error:', e);
        if (inspectorContent) inspectorContent.textContent = 'Error loading metadata: ' + (e.message || String(e));
    }
}

export function setupInspectorHandlers() {
    const inspectorDropZone = get('inspector-drop-zone');
    const inspectorBackBtn = get('inspector-back-btn');
    const inspectorSaveBtn = get('inspector-save-btn');
    const inspectorClearBtn = get('inspector-clear-btn');

    setupInspectorRawJsonToggle();

    if (inspectorDropZone) {
        inspectorDropZone.addEventListener('click', async () => {
            const filePath = await window.api.selectFile({ allowAll: true });
            if (filePath) loadInspectorFile(filePath);
        });

        inspectorDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            inspectorDropZone.classList.add('drag-over');
        });

        inspectorDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            inspectorDropZone.classList.remove('drag-over');
        });

        inspectorDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            inspectorDropZone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                loadInspectorFile(files[0].path);
            }
        });
    }

    if (inspectorBackBtn) {
        inspectorBackBtn.addEventListener('click', () => {
            showView(get('inspector-drop-zone'));
            // Reset metadata panel display when going back
            const metadataPanel = document.querySelector('.settings-panel');
            if (metadataPanel) {
                metadataPanel.style.display = 'block';
            }
            // Reset buttons
            const saveBtn = get('inspector-save-btn');
            const clearBtn = get('inspector-clear-btn');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.title = '';
            }
            if (clearBtn) {
                clearBtn.disabled = false;
                clearBtn.style.opacity = '1';
                clearBtn.title = '';
            }
            // Remove file type indicator
            const inspectorView = get('inspector-view');
            const typeIndicator = inspectorView?.querySelector('.file-type-indicator');
            if (typeIndicator) {
                typeIndicator.remove();
            }
        });
    }

    if (inspectorSaveBtn) {
        inspectorSaveBtn.addEventListener('click', async () => {
            const metaTitle = get('meta-title');
            const metaArtist = get('meta-artist');
            const metaAlbum = get('meta-album');
            const metaYear = get('meta-year');
            const metaGenre = get('meta-genre');
            const metaTrack = get('meta-track');
            const metaComment = get('meta-comment');

            if (!currentInspectorFilePath) {
                showPopup('No file loaded');
                return;
            }

            // Prevent saving metadata for image files
            if (currentInspectorFileType === 'image') {
                showPopup('Metadata editing is not supported for image files');
                return;
            }

            const metadata = {
                title: metaTitle?.value?.trim() || '',
                artist: metaArtist?.value?.trim() || '',
                album: metaAlbum?.value?.trim() || '',
                year: metaYear?.value?.trim() || '',
                genre: metaGenre?.value?.trim() || '',
                track: metaTrack?.value?.trim() || '',
                comment: metaComment?.value?.trim() || ''
            };

            inspectorSaveBtn.disabled = true;
            inspectorSaveBtn.innerHTML = `<span class="loader-shell" data-loader data-loader-size="18"></span> Saving...`;
            renderLoaders({ selector: '#inspector-save-btn [data-loader]' });

            try {
                await window.api.saveMetadata({
                    filePath: currentInspectorFilePath,
                    metadata
                });

                inspectorSaveBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Saved!
                `;
                setTimeout(() => {
                    loadInspectorFile(currentInspectorFilePath);
                    inspectorSaveBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                        Save Metadata
                    `;
                    inspectorSaveBtn.disabled = false;
                }, 1500);
            } catch (e) {
                if (window.api?.logError) window.api.logError('Error saving metadata:', e); else console.error('Error saving metadata:', e);
                showPopup('Error saving metadata: ' + e.message);
                inspectorSaveBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Save Metadata
                `;
                inspectorSaveBtn.disabled = false;
            }
        });
    }

    if (inspectorClearBtn) {
        inspectorClearBtn.addEventListener('click', () => {
            clearMetadataFields();
        });
    }
}
