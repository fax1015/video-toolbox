// Image to PDF Module

import { get, showPopup, showView, renderLoaders, formatBytes, animateAutoHeight, updateTextContent } from './ui-utils.js';
import * as state from './state.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);

let selectedImages = [];
let dragIndex = null;
let autoScrollFrame = null;
let autoScrollVelocity = 0;
let isDragging = false;
let compressionQuality = 80;
let upscaleToMax = false;
const EDGE_SIZE = 140;
const EDGE_OVERFLOW = 90;

function isSupportedImage(path) {
    if (!path || typeof path !== 'string') return false;
    const lower = path.toLowerCase();
    const idx = lower.lastIndexOf('.');
    if (idx === -1) return false;
    return IMAGE_EXTENSIONS.has(lower.slice(idx));
}

function normalizeImagePaths(paths) {
    if (!Array.isArray(paths)) return [];
    return paths.filter((path) => isSupportedImage(path));
}

function uniqueAppendImages(paths) {
    const existing = new Set(selectedImages.map((img) => img.path));
    const toAdd = [];
    paths.forEach((path) => {
        if (existing.has(path)) return;
        const name = path.split(/[\\/]/).pop();
        const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : 'IMG';
        const now = Date.now();
        toAdd.push({ path, name, ext, sizeBytes: 0, dateAdded: now, mtimeMs: 0 });
        existing.add(path);

        // Fetch size asymmetrically
        if (window.electron?.getImageInfo) {
            window.electron.getImageInfo(path).then(result => {
                if (result?.success && result.info) {
                    const img = selectedImages.find(i => i.path === path);
                    if (img) {
                        img.sizeBytes = result.info.sizeBytes || 0;
                        img.mtimeMs = result.info.mtimeMs || 0;
                        updateEstSize();
                    }
                }
            });
        }
    });
    if (toAdd.length > 0) {
        selectedImages = selectedImages.concat(toAdd);
        updateEstSize();
    }
}

function updateConvertState(convertBtn, emptyMessage) {
    const hasItems = selectedImages.length > 0;
    if (convertBtn) convertBtn.disabled = !hasItems;
    const controls = get('image-to-pdf-controls');

    if (controls) {
        if (selectedImages.length > 0) {
            controls.classList.remove('hidden');
        } else {
            controls.classList.add('hidden');
        }
    }
}

export function updateEstSize() {
    const estSizeEl = get('image-to-pdf-est-size');
    if (!estSizeEl) return;

    if (selectedImages.length === 0) {
        estSizeEl.textContent = '--';
        return;
    }

    let totalOriginalSize = 0;
    selectedImages.forEach(img => {
        totalOriginalSize += img.sizeBytes || 0;
    });

    if (totalOriginalSize === 0) {
        estSizeEl.textContent = 'Calculating...';
        return;
    }

    // Heuristical estimation:
    // PDF overhead + image compression effect
    // We assume the PDF compressor/embedder works at the target quality.
    // Quality 100 might be slightly larger than original due to overhead, 
    // but usually PDFs are smaller if we re-compress.
    // For now, let's use a conservative reduction.
    const qualityFactor = compressionQuality / 100;

    // Simple heuristic: most images in PDFs are JPEGs.
    // Size reduction isn't strictly linear but this gives a good feedback loop.
    let estimated = totalOriginalSize * qualityFactor * 0.95;

    // Add small overhead
    estimated += selectedImages.length * 1024;

    estSizeEl.textContent = formatBytes(estimated);
}

function toFileUrl(filePath) {
    if (!filePath) return '';
    let normalized = filePath.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) normalized = `/${normalized}`;
    return encodeURI(`file://${normalized}`);
}

function openImageViewer(image) {
    const overlay = get('image-viewer-overlay');
    const imgEl = get('image-viewer-img');
    const nameEl = get('image-viewer-name');
    const tagsEl = get('image-viewer-tags');
    const infoEl = get('image-viewer-info');
    if (!overlay || !imgEl || !nameEl || !infoEl || !image) return;

    imgEl.src = toFileUrl(image.path);
    imgEl.alt = image.name || '';
    nameEl.textContent = image.name || '';
    if (tagsEl) tagsEl.innerHTML = '';
    infoEl.textContent = 'Loading...';

    // Add entrance animations
    [imgEl, nameEl, infoEl, tagsEl].forEach(el => {
        if (!el) return;
        el.classList.remove('text-loaded');
        el.style.opacity = '0';
        void el.offsetWidth; // Force reflow to restart animation
    });

    nameEl.classList.add('text-loaded');
    nameEl.style.animationDelay = '100ms';

    imgEl.classList.add('text-loaded');
    imgEl.style.animationDelay = '200ms';

    imgEl.onload = () => {
        const width = imgEl.naturalWidth || 0;
        const height = imgEl.naturalHeight || 0;
        infoEl.textContent = width && height ? `${width} x ${height}px` : 'Dimensions unavailable';
        infoEl.classList.remove('text-loaded');
        void infoEl.offsetWidth;
        infoEl.classList.add('text-loaded');
        infoEl.style.animationDelay = '300ms';
    };

    if (window.electron?.getImageInfo) {
        window.electron.getImageInfo(image.path).then((result) => {
            if (!result || !result.success) {
                infoEl.textContent = result?.error || 'Image info unavailable';
                return;
            }
            const info = result.info || {};
            const tags = [];
            if (info.width && info.height) tags.push({ label: `${info.width} x ${info.height}`, animate: true });
            if (info.format) tags.push({ label: info.format });
            if (info.codec) tags.push({ label: info.codec });
            if (info.pixelFormat) tags.push({ label: info.pixelFormat });
            if (info.colorSpace) tags.push({ label: info.colorSpace });
            if (info.bitDepth) tags.push({ label: `${info.bitDepth}-bit` });
            if (info.sizeBytes) tags.push({ label: formatBytes(info.sizeBytes), animate: true });

            if (tagsEl) {
                tagsEl.innerHTML = tags.map((tag, i) => {
                    const animateAttr = tag.animate ? ' data-animate-number' : '';
                    return `<span class="meta-tag text-loaded"${animateAttr} style="animation-delay: ${400 + (i * 50)}ms">${tag.label}</span>`;
                }).join('');
                tagsEl.style.opacity = '1';
            }

            if (info.width && info.height) {
                infoEl.textContent = '';
                infoEl.classList.remove('text-loaded');
            }
        }).catch((err) => {
            infoEl.textContent = err?.message || 'Image info unavailable';
        });
    }

    const content = overlay.querySelector('.image-viewer-content');
    if (content) {
        content.classList.remove('container-loaded');
        void content.offsetWidth;
        content.classList.add('container-loaded');
    }

    overlay.classList.remove('hidden');
}

function closeImageViewer() {
    const overlay = get('image-viewer-overlay');
    if (!overlay || overlay.classList.contains('hidden') || overlay.classList.contains('closing')) return;

    overlay.classList.add('closing');

    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('closing');

        // Clear animations for next open
        const elements = ['image-viewer-img', 'image-viewer-name', 'image-viewer-info', 'image-viewer-tags'];
        elements.forEach(id => {
            const el = get(id);
            if (el) {
                el.classList.remove('text-loaded');
                el.style.animationDelay = '';
                el.style.opacity = '';
            }
        });
        const imgEl = get('image-viewer-img');
        if (imgEl) imgEl.src = '';
    }, 200); // Slightly less than 250ms to ensure it feels snappy
}

function createDropIndicator(index) {
    const indicator = document.createElement('div');
    indicator.className = 'image-drop-indicator';
    indicator.dataset.index = index.toString();
    return indicator;
}

function renderImagePreview(skipAnimation = false) {
    const preview = get('image-to-pdf-preview');
    const previewEmpty = get('image-to-pdf-preview-empty');
    const reorderHint = get('image-to-pdf-reorder-hint');
    const convertBtn = get('image-to-pdf-convert-btn');
    if (!preview) return;

    const currentScroll = preview.scrollLeft;
    const fragment = document.createDocumentFragment();

    const countEl = get('image-to-pdf-count');
    if (countEl) countEl.textContent = selectedImages.length.toString();

    const settingsPanel = preview.closest('.settings-panel');

    // Collect existing items to reuse them (preserves their observers and animations)
    const itemMap = new Map();
    preview.querySelectorAll('.image-preview-item').forEach(el => {
        if (el.dataset.path) itemMap.set(el.dataset.path, el);
    });

    animateAutoHeight(settingsPanel, () => {
        if (selectedImages.length === 0) {
            if (previewEmpty) {
                previewEmpty.classList.remove('hidden');
                if (!skipAnimation) {
                    previewEmpty.classList.remove('text-loaded');
                    void previewEmpty.offsetWidth;
                    previewEmpty.classList.add('text-loaded');
                }
            }
            if (reorderHint) reorderHint.classList.add('hidden');
            updateConvertState(convertBtn, previewEmpty);
        } else {
            if (previewEmpty) previewEmpty.classList.add('hidden');
        }

        if (selectedImages.length > 0) {
            preview.classList.remove('hidden');
        }

        if (reorderHint) {
            if (selectedImages.length > 0) {
                reorderHint.classList.remove('hidden');
                if (!skipAnimation) {
                    reorderHint.classList.remove('text-loaded');
                    void reorderHint.offsetWidth;
                    reorderHint.classList.add('text-loaded');
                }
            } else {
                reorderHint.classList.add('hidden');
            }
        }

        // Start with the first drop indicator
        fragment.appendChild(createDropIndicator(0));

        selectedImages.forEach((image, index) => {
            let item = itemMap.get(image.path);
            const isNew = !item;

            if (isNew) {
                item = document.createElement('div');
                item.className = 'image-preview-item';
                item.title = image.name;
                item.dataset.path = image.path; // Unique ID for reuse
                item.draggable = true;

                const img = document.createElement('img');
                img.className = 'image-preview-thumb';
                img.src = toFileUrl(image.path);
                img.alt = image.name;
                img.loading = 'lazy';
                img.decoding = 'async';

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'image-preview-remove';
                removeBtn.title = 'Remove image';
                removeBtn.setAttribute('aria-label', 'Remove image');
                removeBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                `;

                const caption = document.createElement('div');
                caption.className = 'image-preview-caption';
                caption.dataset.animateNumber = '';

                item.appendChild(img);
                item.appendChild(removeBtn);
                item.appendChild(caption);
            }

            // Sync dynamic data
            item.dataset.index = index.toString();
            const removeBtn = item.querySelector('.image-preview-remove');
            if (removeBtn) removeBtn.dataset.index = index.toString();

            const caption = item.querySelector('.image-preview-caption');
            if (caption) updateTextContent(caption, (index + 1).toString());

            fragment.appendChild(item);

            if (isNew) {
                if (skipAnimation) {
                    item.style.animation = 'none';
                    item.style.opacity = '1';
                    item.style.transform = 'none';
                } else {
                    item.style.animationDelay = `${index * 40}ms`;
                }
            } else {
                // For reused items, ensure they don't have pop-in animations playing unless it's a fresh drag
                item.style.animation = 'none';
                item.style.opacity = '1';
                item.style.transform = 'none';
            }

            // Add indicator after each item
            fragment.appendChild(createDropIndicator(index + 1));
        });

        preview.replaceChildren(fragment);
        updateConvertState(convertBtn, previewEmpty);
    });

    // Restore scroll position
    requestAnimationFrame(() => {
        preview.scrollLeft = currentScroll;
    });
}

function startAutoScroll(preview) {
    if (autoScrollFrame || !preview) return;
    const step = () => {
        if (!autoScrollVelocity) {
            autoScrollFrame = null;
            return;
        }
        preview.scrollLeft += autoScrollVelocity;
        autoScrollFrame = requestAnimationFrame(step);
    };
    autoScrollFrame = requestAnimationFrame(step);
}

function stopAutoScroll() {
    autoScrollVelocity = 0;
    if (autoScrollFrame) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
    }
}

function handleAutoScroll(event, preview, wrap) {
    if (!preview || !wrap) return;
    const bounds = wrap.getBoundingClientRect();
    const leftZone = bounds.left + EDGE_SIZE;
    const rightZone = bounds.right - EDGE_SIZE;

    if (event.clientX <= leftZone) {
        autoScrollVelocity = -16;
        startAutoScroll(preview);
    } else if (event.clientX >= rightZone) {
        autoScrollVelocity = 16;
        startAutoScroll(preview);
    } else {
        stopAutoScroll();
    }
}

function moveImage(index, delta) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= selectedImages.length) return;
    const updated = selectedImages.slice();
    const [moved] = updated.splice(index, 1);
    updated.splice(nextIndex, 0, moved);
    selectedImages = updated;
    renderImagePreview();
}

function removeImage(index) {
    const preview = get('image-to-pdf-preview');
    if (preview) {
        // Child 0 is indicator 0, child 1 is item 0, child 2 is indicator 1...
        // Item i is at children[i*2 + 1]. Indicator i+1 is at children[i*2 + 2].
        const itemEl = preview.children[index * 2 + 1];
        const nextIndicator = preview.children[index * 2 + 2];

        if (itemEl) {
            itemEl.classList.add('removing');
            if (nextIndicator) nextIndicator.classList.add('removing');

            // Wait for animation to finish (matching the 0.3s transition in CSS)
            setTimeout(() => {
                selectedImages = selectedImages.filter((_, idx) => idx !== index);
                renderImagePreview(true); // Skip entrance animations on re-render
            }, 350); // 350ms ensures the 300ms transition is strictly complete
            return;
        }
    }

    // Fallback if DOM not found
    selectedImages = selectedImages.filter((_, idx) => idx !== index);
    renderImagePreview(true);
}

export function clearImages() {
    const preview = get('image-to-pdf-preview');
    if (preview && selectedImages.length > 0) {
        preview.classList.add('clearing');

        setTimeout(() => {
            selectedImages = [];
            renderImagePreview();
            preview.classList.remove('clearing');
        }, 300);
        return;
    }

    selectedImages = [];
    renderImagePreview();
}

function sortImages(criteria) {
    if (selectedImages.length === 0) return;

    const sorted = selectedImages.slice();
    switch (criteria) {
        case 'name-asc':
            sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            break;
        case 'name-desc':
            sorted.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
            break;
        case 'size-asc':
            sorted.sort((a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0));
            break;
        case 'size-desc':
            sorted.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
            break;
        case 'mtime-asc':
            sorted.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));
            break;
        case 'mtime-desc':
            sorted.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
            break;
        case 'ext-asc':
            sorted.sort((a, b) => a.ext.localeCompare(b.ext));
            break;
        case 'ext-desc':
            sorted.sort((a, b) => b.ext.localeCompare(a.ext));
            break;
        case 'added-asc':
            sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
            break;
        case 'added-desc':
            sorted.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
            break;
    }

    selectedImages = sorted;
    renderImagePreview();
}

async function pickImages() {
    const paths = await window.electron.selectFiles({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] }]
    });
    return normalizeImagePaths(paths);
}

async function handleImageSelection(paths) {
    const normalized = normalizeImagePaths(paths);
    if (normalized.length === 0) {
        showPopup('No supported images selected.');
        return false;
    }
    uniqueAppendImages(normalized);
    renderImagePreview();
    return true;
}

async function convertImagesToPdf() {
    if (selectedImages.length === 0) {
        showPopup('Add at least one image first.');
        return;
    }

    const firstName = selectedImages[0]?.name || 'images';
    const baseName = firstName.replace(/\.[^.]+$/, '');
    let outputPath = await window.electron.saveFile({
        title: 'Save PDF',
        defaultPath: `${baseName}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (!outputPath) return;

    if (!outputPath.toLowerCase().endsWith('.pdf')) {
        outputPath += '.pdf';
    }

    const convertBtn = get('image-to-pdf-convert-btn');
    const convertBtnHtml = convertBtn ? convertBtn.innerHTML : '';

    if (convertBtn) {
        convertBtn.disabled = true;
        convertBtn.innerHTML = `<span class="loader-shell" data-loader data-loader-size="18"></span> Converting...`;
        renderLoaders({ selector: '#image-to-pdf-convert-btn [data-loader]' });
    }

    try {
        state.setLastActiveViewId('imageToPdfDropZone');
        const result = await window.electron.convertImagesToPdf({
            imagePaths: selectedImages.map((img) => img.path),
            outputPath,
            quality: compressionQuality,
            upscale: upscaleToMax
        });

        if (!result || !result.success) {
            const message = result?.error || 'Failed to create PDF.';
            showPopup(message);
            return;
        }

        const completeTitle = get('complete-title');
        const outputPathEl = get('output-path');
        const completeView = get('complete-view');
        const newEncodeBtn = get('new-encode-btn');

        if (completeTitle) completeTitle.textContent = 'PDF Created!';
        if (newEncodeBtn) newEncodeBtn.textContent = 'Create Another PDF';
        if (outputPathEl) outputPathEl.textContent = result.outputPath;
        state.setCurrentOutputPath(result.outputPath);
        showView(completeView);
    } catch (err) {
        showPopup(`Failed to create PDF: ${err.message}`);
    } finally {
        if (convertBtn) {
            convertBtn.disabled = false;
            convertBtn.innerHTML = convertBtnHtml;
        }
    }
}

export function setupImageToPdfHandlers() {
    const dropZone = get('image-to-pdf-drop-zone');
    const dashboard = get('image-to-pdf-dashboard');
    const backBtn = get('image-to-pdf-back-btn');
    const addBtn = get('image-to-pdf-add-btn');
    const clearBtn = get('image-to-pdf-clear-btn');
    const convertBtn = get('image-to-pdf-convert-btn');
    const preview = get('image-to-pdf-preview');
    const previewWrap = preview ? preview.closest('.image-preview-wrap') : null;
    const imageViewerOverlay = get('image-viewer-overlay');
    const imageViewerClose = get('image-viewer-close');

    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files || []).map((file) => file.path);
            handleImageSelection(files).then((didAdd) => {
                if (didAdd) showView(dashboard);
            });
        });
        dropZone.addEventListener('click', async () => {
            const paths = await pickImages();
            if (paths.length === 0) return;
            handleImageSelection(paths).then((didAdd) => {
                if (didAdd) showView(dashboard);
            });
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            clearImages();
            showView(dropZone);
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const paths = await pickImages();
            if (paths.length === 0) return;
            handleImageSelection(paths);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearImages();
        });
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', () => {
            convertImagesToPdf();
        });
    }

    const qualitySlider = get('image-to-pdf-quality-slider');
    const qualityValue = get('image-to-pdf-quality-value');
    const upscaleToggle = get('image-to-pdf-upscale');
    const sortContainer = get('image-to-pdf-sort-container');
    const sortBtn = get('image-to-pdf-sort-btn');

    if (qualitySlider) {
        qualitySlider.addEventListener('input', (e) => {
            compressionQuality = parseInt(e.target.value, 10);
            if (qualityValue) {
                updateTextContent(qualityValue, compressionQuality.toString());
            }
            updateEstSize();
        });
    }

    if (upscaleToggle) {
        upscaleToggle.addEventListener('change', (e) => {
            upscaleToMax = e.target.checked;
        });
    }

    if (sortContainer && sortBtn) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = sortContainer.classList.contains('open');
            document.querySelectorAll('.dropdown-container.open').forEach(d => {
                if (d !== sortContainer) d.classList.remove('open');
            });
            sortContainer.classList.toggle('open');
        });

        sortContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item && item.dataset.sort) {
                sortImages(item.dataset.sort);
                sortContainer.classList.remove('open');
            }
        });

        window.addEventListener('click', () => {
            sortContainer.classList.remove('open');
        });
    }

    if (preview) {
        preview.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.image-preview-remove');
            if (!removeBtn) return;
            const index = Number.parseInt(removeBtn.dataset.index, 10);
            if (Number.isNaN(index)) return;
            removeImage(index);
        });

        preview.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.image-preview-remove');
            if (removeBtn) return;
            const item = event.target.closest('.image-preview-item');
            if (!item) return;
            const index = Number.parseInt(item.dataset.index, 10);
            if (Number.isNaN(index)) return;
            const image = selectedImages[index];
            if (image) openImageViewer(image);
        });

        preview.addEventListener('wheel', (event) => {
            if (!preview) return;
            if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
            event.preventDefault();
            preview.scrollLeft += event.deltaY;
        }, { passive: false });

        preview.addEventListener('dragstart', (event) => {
            const item = event.target.closest('.image-preview-item');
            if (!item) return;
            dragIndex = Number.parseInt(item.dataset.index, 10);
            if (Number.isNaN(dragIndex)) return;
            item.classList.add('dragging');
            preview.classList.add('is-dragging');
            isDragging = true;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(dragIndex));
        });

        preview.addEventListener('dragend', (event) => {
            const item = event.target.closest('.image-preview-item');
            if (item) item.classList.remove('dragging');
            preview.classList.remove('is-dragging');
            preview.querySelectorAll('.image-drop-indicator.drag-over').forEach((el) => el.classList.remove('drag-over'));
            dragIndex = null;
            isDragging = false;
            stopAutoScroll();
        });

        preview.addEventListener('dragover', (event) => {
            const indicator = event.target.closest('.image-drop-indicator');
            event.preventDefault();

            // Clear other highlights
            preview.querySelectorAll('.image-drop-indicator.drag-over').forEach(el => {
                if (el !== indicator) el.classList.remove('drag-over');
            });

            if (indicator) indicator.classList.add('drag-over');
            event.dataTransfer.dropEffect = 'move';
            if (previewWrap) handleAutoScroll(event, preview, previewWrap);
        });

        preview.addEventListener('dragenter', (event) => {
            event.preventDefault();
            if (previewWrap) handleAutoScroll(event, preview, previewWrap);
        });

        preview.addEventListener('dragleave', (event) => {
            const indicator = event.target.closest('.image-drop-indicator');
            if (indicator) {
                if (!event.relatedTarget || !indicator.contains(event.relatedTarget)) {
                    indicator.classList.remove('drag-over');
                }
            }
            if (event.relatedTarget && preview.contains(event.relatedTarget)) return;
            stopAutoScroll();
        });

        preview.addEventListener('drop', (event) => {
            const indicator = event.target.closest('.image-drop-indicator');
            event.preventDefault();

            if (indicator) indicator.classList.remove('drag-over');
            preview.classList.remove('is-dragging');
            stopAutoScroll();
            isDragging = false;

            let fromIndex = dragIndex;
            if (!Number.isFinite(fromIndex)) {
                const data = event.dataTransfer.getData('text/plain');
                fromIndex = Number.parseInt(data, 10);
            }

            if (!indicator) return;
            const toIndex = Number.parseInt(indicator.dataset.index, 10);

            if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;

            // If dropping on the target immediately before or after the item, no change needed
            if (toIndex === fromIndex || toIndex === fromIndex + 1) return;

            const updated = selectedImages.slice();
            const [moved] = updated.splice(fromIndex, 1);

            // Adjust toIndex if it was after the item we just removed
            const finalToIndex = (toIndex > fromIndex) ? toIndex - 1 : toIndex;

            updated.splice(finalToIndex, 0, moved);
            selectedImages = updated;
            renderImagePreview(true);
        });
    }
    if (imageViewerOverlay) {
        imageViewerOverlay.addEventListener('click', (event) => {
            if (event.target === imageViewerOverlay) closeImageViewer();
        });
    }

    if (imageViewerClose) {
        imageViewerClose.addEventListener('click', () => {
            closeImageViewer();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeImageViewer();
    });

    if (previewWrap) {
        previewWrap.addEventListener('dragenter', (event) => {
            event.preventDefault();
            if (preview) handleAutoScroll(event, preview, previewWrap);
        });

        previewWrap.addEventListener('dragover', (event) => {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            if (preview) handleAutoScroll(event, preview, previewWrap);
        });

        previewWrap.addEventListener('dragleave', (event) => {
            if (event.relatedTarget && previewWrap.contains(event.relatedTarget)) return;
            stopAutoScroll();
        });

        previewWrap.addEventListener('drop', () => {
            stopAutoScroll();
        });

        window.addEventListener('dragover', (event) => {
            if (!isDragging || !preview) return;
            event.preventDefault();
            handleAutoScroll(event, preview, previewWrap);
        });

        window.addEventListener('dragend', () => {
            isDragging = false;
            stopAutoScroll();
        });

        window.addEventListener('drop', () => {
            isDragging = false;
            stopAutoScroll();
        });
    }

    renderImagePreview();
}
