// Media Inspector Module

import { get, getLoaderHTML, showPopup, formatBytes, formatDurationFromSeconds } from './ui-utils.js';
import { showView } from './ui-utils.js';

let currentInspectorFilePath = null;
let currentInspectorData = null;
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

function renderStreamInfo(streams) {
    const inspectorStreams = get('inspector-streams');
    
    if (!inspectorStreams || !streams) {
        if (inspectorStreams) inspectorStreams.innerHTML = '<p style="color:var(--text-muted)">No stream information available</p>';
        return;
    }

    inspectorStreams.innerHTML = streams.map((stream, index) => {
        const type = stream.codec_type || 'unknown';
        const codec = stream.codec_name || 'Unknown';
        const details = [];

        if (type === 'video') {
            if (stream.width && stream.height) details.push(`${stream.width}×${stream.height}`);
            if (stream.r_frame_rate) {
                const [num, den] = stream.r_frame_rate.split('/');
                const fps = (parseFloat(num) / parseFloat(den)).toFixed(2);
                details.push(`${fps} fps`);
            }
            if (stream.bit_rate) details.push(`${Math.round(stream.bit_rate / 1000)} kbps`);
            if (stream.pix_fmt) details.push(stream.pix_fmt);
        } else if (type === 'audio') {
            if (stream.sample_rate) details.push(`${stream.sample_rate} Hz`);
            if (stream.channels) details.push(`${stream.channels} ch`);
            if (stream.bit_rate) details.push(`${Math.round(stream.bit_rate / 1000)} kbps`);
            if (stream.channel_layout) details.push(stream.channel_layout);
        } else if (type === 'subtitle') {
            if (stream.tags?.language) details.push(stream.tags.language);
        }

        return `
            <div class="stream-card container-loaded">
                <div class="stream-card-header">
                    <span class="stream-type-badge ${type}">${type.toUpperCase()}</span>
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
    
    if (metaTitle) metaTitle.value = '';
    if (metaArtist) metaArtist.value = '';
    if (metaAlbum) metaAlbum.value = '';
    if (metaYear) metaYear.value = '';
    if (metaGenre) metaGenre.value = '';
    if (metaTrack) metaTrack.value = '';
    if (metaComment) metaComment.value = '';

    if (data.format) {
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

    renderStreamInfo(data.streams);
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
    showView(inspectorView);

    const filename = filePath.split(/[\\/]/).pop();
    const ext = filename.split('.').pop().toUpperCase();

    if (inspectorFilename) inspectorFilename.textContent = filename;
    if (inspectorFileIcon) inspectorFileIcon.textContent = ext;
    if (inspectorContent) inspectorContent.innerHTML = `<div style="display:flex;align-items:center;gap:12px;color:var(--text-muted)">${getLoaderHTML(18)} Loading metadata...</div>`;
    if (inspectorStreams) inspectorStreams.innerHTML = `<div style="display:flex;justify-content:center;padding:40px;width:100%">${getLoaderHTML(40)}</div>`;

    try {
        const data = await window.electron.getMetadataFull(filePath);

        if (data.error) {
            if (inspectorContent) inspectorContent.textContent = 'Error: ' + data.error;
            return;
        }

        currentInspectorData = data;
        populateMetadataFields(data);
        if (rawToggle && rawToggle.open && inspectorContent) {
            inspectorContent.textContent = JSON.stringify(data, null, 2);
        }

    } catch (e) {
        console.error('Error loading metadata:', e);
        if (inspectorContent) inspectorContent.textContent = 'Error loading metadata: ' + e.message;
    }
}

export function setupInspectorHandlers() {
    const inspectorDropZone = get('inspector-drop-zone');
    const inspectorBackBtn = get('inspector-back-btn');
    const inspectorSaveBtn = get('inspector-save-btn');

    setupInspectorRawJsonToggle();
    
    if (inspectorDropZone) {
        inspectorDropZone.addEventListener('click', async () => {
            const filePath = await window.electron.selectFile();
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
            inspectorSaveBtn.innerHTML = `${getLoaderHTML(18)} Saving...`;

            try {
                const result = await window.electron.saveMetadata({
                    filePath: currentInspectorFilePath,
                    metadata
                });

                if (result.success) {
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
                } else {
                    showPopup('Failed to save metadata: ' + (result.error || 'Unknown error'));
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
            } catch (e) {
                console.error('Error saving metadata:', e);
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
}
