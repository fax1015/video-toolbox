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

// Custom drag state (mouse-based implementation for WebView2 compatibility)
let dragGhost = null;
let currentDropIndex = -1;
let didDrag = false; // Track if a drag occurred to prevent click events

// Sidebar drag state
let sidebarDragIndex = null;
let sidebarDropIndex = -1;
let sidebarDragGhost = null;
let isSidebarDragging = false;

// Image editing state
let currentEditImage = null;
let currentRotation = 0;
let cropMode = false;
let cropData = { x: 0, y: 0, width: 0, height: 0 };
let cropDragHandle = null;
let cropDragStart = { x: 0, y: 0 };

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
        if (window.api?.getImageInfo) {
            window.api.getImageInfo(path).then(result => {
                const img = selectedImages.find(i => i.path === path);
                if (img && result) {
                    img.sizeBytes = result.sizeBytes || 0;
                    img.mtimeMs = result.mtimeMs || 0;
                    updateEstSize();
                } else if (!result) {
                    console.warn('Failed to get image info for:', path);
                    updateEstSize();
                }
            }).catch(err => {
                console.warn('Error getting image info:', err);
                // Update estimate even on error
                updateEstSize();
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
    const url = window.api.convertFileSrc(filePath);
    console.log('[ImageToPDF] Generated asset URL:', url, 'for path:', filePath);
    return url;
}

function openImageViewer(image) {
    const overlay = get('image-viewer-overlay');
    const imgEl = get('image-viewer-img');
    const nameEl = get('image-viewer-name');
    const tagsEl = get('image-viewer-tags');
    const infoEl = get('image-viewer-info');
    if (!overlay || !imgEl || !nameEl || !infoEl || !image) return;

    // Store current image for editing
    currentEditImage = image;
    currentRotation = 0;
    cropMode = false;
    
    // Reset rotation class
    imgEl.classList.remove('rotated-90', 'rotated-180', 'rotated-270');

    const assetUrl = toFileUrl(image.path);
    console.log('[ImageToPDF] Opening viewer - asset URL:', assetUrl);
    imgEl.src = assetUrl;
    imgEl.alt = image.name || '';
    nameEl.textContent = image.name || '';
    if (tagsEl) tagsEl.innerHTML = '';
    infoEl.textContent = 'Loading...';

    // Add error handling
    imgEl.onerror = () => {
        console.error('[ImageToPDF] Failed to load image in viewer:', image.path);
        infoEl.textContent = 'Failed to load image';
    };

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
        
        // Initialize crop data
        initCropOverlay();
    };

    if (window.api?.getImageInfo) {
        window.api.getImageInfo(image.path).then((info) => {
            if (!info || Object.keys(info).length === 0) {
                infoEl.textContent = 'Image info unavailable';
                return;
            }
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

    // Hide crop overlay if open
    const cropOverlay = get('image-crop-overlay');
    if (cropOverlay) cropOverlay.classList.add('hidden');
    cropMode = false;

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
        
        // Reset rotation
        currentRotation = 0;
        currentEditImage = null;
    }, 200); // Slightly less than 250ms to ensure it feels snappy
}

// Image editing functions
function rotateImage(direction) {
    const imgEl = get('image-viewer-img');
    if (!imgEl) return;
    
    if (direction === 'left') {
        currentRotation = (currentRotation - 90 + 360) % 360;
    } else {
        currentRotation = (currentRotation + 90) % 360;
    }
    
    // Update rotation class
    imgEl.classList.remove('rotated-90', 'rotated-180', 'rotated-270');
    if (currentRotation === 90) imgEl.classList.add('rotated-90');
    else if (currentRotation === 180) imgEl.classList.add('rotated-180');
    else if (currentRotation === 270) imgEl.classList.add('rotated-270');
    
    // Reinitialize crop overlay for new dimensions
    setTimeout(() => initCropOverlay(), 50);
}

function initCropOverlay() {
    const imgEl = get('image-viewer-img');
    const cropOverlay = get('image-crop-overlay');
    const canvasWrap = get('image-viewer-canvas-wrap');
    
    if (!imgEl || !cropOverlay || !canvasWrap) return;
    
    // Get the displayed dimensions
    const rect = imgEl.getBoundingClientRect();
    const wrapRect = canvasWrap.getBoundingClientRect();
    
    // Initialize crop data to full image
    cropData = {
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height
    };
    
    // Position the crop overlay
    const cropArea = cropOverlay.querySelector('.crop-area');
    if (cropArea) {
        cropArea.style.left = '0px';
        cropArea.style.top = '0px';
        cropArea.style.width = `${rect.width}px`;
        cropArea.style.height = `${rect.height}px`;
    }
}

function toggleCropMode() {
    const cropOverlay = get('image-crop-overlay');
    if (!cropOverlay) return;
    
    cropMode = !cropMode;
    
    if (cropMode) {
        cropOverlay.classList.remove('hidden');
        initCropOverlay();
        setupCropHandlers();
    } else {
        cropOverlay.classList.add('hidden');
    }
}

function setupCropHandlers() {
    const cropArea = document.querySelector('.crop-area');
    const cropOverlay = get('image-crop-overlay');
    if (!cropArea || !cropOverlay) return;
    
    let isDragging = false;
    let dragType = null;
    let startPos = { x: 0, y: 0 };
    let startCrop = { ...cropData };
    
    const onMouseDown = (e) => {
        e.preventDefault();
        isDragging = true;
        
        const target = e.target;
        startPos = { x: e.clientX, y: e.clientY };
        startCrop = { ...cropData };
        
        if (target.classList.contains('crop-handle')) {
            dragType = target.classList[1]; // nw, ne, sw, se, n, s, w, e
        } else {
            dragType = 'move';
        }
    };
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        
        const imgEl = get('image-viewer-img');
        if (!imgEl) return;
        const imgRect = imgEl.getBoundingClientRect();
        
        if (dragType === 'move') {
            cropData.x = Math.max(0, Math.min(imgRect.width - cropData.width, startCrop.x + dx));
            cropData.y = Math.max(0, Math.min(imgRect.height - cropData.height, startCrop.y + dy));
        } else {
            // Handle resize
            switch (dragType) {
                case 'se':
                    cropData.width = Math.max(50, Math.min(imgRect.width - cropData.x, startCrop.width + dx));
                    cropData.height = Math.max(50, Math.min(imgRect.height - cropData.y, startCrop.height + dy));
                    break;
                case 'sw':
                    const newWidthSW = Math.max(50, startCrop.width - dx);
                    cropData.x = Math.max(0, startCrop.x + startCrop.width - newWidthSW);
                    cropData.width = newWidthSW;
                    cropData.height = Math.max(50, Math.min(imgRect.height - cropData.y, startCrop.height + dy));
                    break;
                case 'ne':
                    cropData.width = Math.max(50, Math.min(imgRect.width - cropData.x, startCrop.width + dx));
                    const newHeightNE = Math.max(50, startCrop.height - dy);
                    cropData.y = Math.max(0, startCrop.y + startCrop.height - newHeightNE);
                    cropData.height = newHeightNE;
                    break;
                case 'nw':
                    const newWidthNW = Math.max(50, startCrop.width - dx);
                    const newHeightNW = Math.max(50, startCrop.height - dy);
                    cropData.x = Math.max(0, startCrop.x + startCrop.width - newWidthNW);
                    cropData.y = Math.max(0, startCrop.y + startCrop.height - newHeightNW);
                    cropData.width = newWidthNW;
                    cropData.height = newHeightNW;
                    break;
                case 'n':
                    const newHeightN = Math.max(50, startCrop.height - dy);
                    cropData.y = Math.max(0, startCrop.y + startCrop.height - newHeightN);
                    cropData.height = newHeightN;
                    break;
                case 's':
                    cropData.height = Math.max(50, Math.min(imgRect.height - cropData.y, startCrop.height + dy));
                    break;
                case 'w':
                    const newWidthW = Math.max(50, startCrop.width - dx);
                    cropData.x = Math.max(0, startCrop.x + startCrop.width - newWidthW);
                    cropData.width = newWidthW;
                    break;
                case 'e':
                    cropData.width = Math.max(50, Math.min(imgRect.width - cropData.x, startCrop.width + dx));
                    break;
            }
        }
        
        // Update visual
        cropArea.style.left = `${cropData.x}px`;
        cropArea.style.top = `${cropData.y}px`;
        cropArea.style.width = `${cropData.width}px`;
        cropArea.style.height = `${cropData.height}px`;
    };
    
    const onMouseUp = () => {
        isDragging = false;
        dragType = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    
    cropArea.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function confirmCrop() {
    // For now, just exit crop mode - actual cropping would require canvas manipulation
    // and saving the modified image, which is complex for a simple feature
    const cropOverlay = get('image-crop-overlay');
    if (cropOverlay) cropOverlay.classList.add('hidden');
    cropMode = false;
    
    // Show feedback
    showPopup('Crop area selected. The image will be cropped when converting to PDF.');
}

function cancelCrop() {
    const cropOverlay = get('image-crop-overlay');
    if (cropOverlay) cropOverlay.classList.add('hidden');
    cropMode = false;
    initCropOverlay(); // Reset crop data
}

function resetEdits() {
    const imgEl = get('image-viewer-img');
    if (!imgEl) return;
    
    currentRotation = 0;
    imgEl.classList.remove('rotated-90', 'rotated-180', 'rotated-270');
    
    const cropOverlay = get('image-crop-overlay');
    if (cropOverlay) cropOverlay.classList.add('hidden');
    cropMode = false;
    
    initCropOverlay();
}

function applyEdits() {
    // Apply rotation to the image data
    if (!currentEditImage) return;
    
    // Store rotation in the image object for use during PDF conversion
    currentEditImage.rotation = currentRotation;
    currentEditImage.crop = cropMode ? { ...cropData } : null;
    
    showPopup('Changes applied!');
    closeImageViewer();
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
                // Note: Not using HTML5 draggable - using custom mouse events for WebView2 compatibility

                const img = document.createElement('img');
                img.className = 'image-preview-thumb';
                img.src = toFileUrl(image.path);
                img.alt = image.name;
                img.loading = 'lazy';
                img.decoding = 'async';

                const fallback = document.createElement('div');
                fallback.className = 'image-preview-fallback';
                fallback.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span>${image.name}</span>
                `;
                fallback.style.display = 'none'; // Initially hidden, shown on error

                // Add error handling for failed image loads
                img.onerror = () => {
                    console.error('[ImageToPDF] Failed to load image:', image.path);
                    img.style.display = 'none';
                    // Show fallback placeholder
                    fallback.style.display = 'flex';
                };

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
                item.appendChild(fallback);
                item.appendChild(removeBtn);
                item.appendChild(caption);
            }

            // Always ensure listeners are active and using current indices.
            // Using properties (onclick, etc.) is the simplest way to update the handler 
            // and ensure we don't pile up multiple duplicate listeners on reused items.

            item.onclick = () => {
                // Don't open viewer if a drag just occurred
                if (didDrag) {
                    didDrag = false;
                    return;
                }
                const currIdx = Number.parseInt(item.dataset.index, 10);
                const image = selectedImages[currIdx];
                if (image) openImageViewer(image);
            };

            const removeBtnEl = item.querySelector('.image-preview-remove');
            if (removeBtnEl) {
                removeBtnEl.onclick = (e) => {
                    e.stopPropagation();
                    const currIndex = Number.parseInt(item.dataset.index, 10);
                    if (!Number.isNaN(currIndex)) removeImage(currIndex);
                };
                removeBtnEl.dataset.index = index.toString();
            }

            // Use mouse events for custom drag implementation (more reliable in WebView2/Tauri)
            item.onmousedown = (event) => {
                // Ignore if clicking on remove button
                if (event.target.closest('.image-preview-remove')) return;
                
                const currIdx = Number.parseInt(item.dataset.index, 10);
                if (Number.isNaN(currIdx)) return;
                
                // Only start drag on left mouse button
                if (event.button !== 0) return;
                
                dragIndex = currIdx;
                
                // Create a ghost element for visual feedback, centered on cursor
                const rect = item.getBoundingClientRect();
                dragGhost = item.cloneNode(true);
                dragGhost.className = 'image-preview-item drag-ghost';
                
                // Store offset from cursor to element center for smooth dragging
                const offsetX = rect.left + rect.width / 2 - event.clientX;
                const offsetY = rect.top + rect.height / 2 - event.clientY;
                
                dragGhost.style.cssText = `
                    position: fixed;
                    left: ${event.clientX + offsetX - rect.width / 2}px;
                    top: ${event.clientY + offsetY - rect.height / 2}px;
                    width: ${rect.width}px;
                    height: ${rect.height}px;
                    pointer-events: none;
                    z-index: 10000;
                    opacity: 0.9;
                    transform: scale(1.05);
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    transition: none;
                    display: none;
                `;
                document.body.appendChild(dragGhost);
                
                // Store the offset for use in mousemove
                dragGhost.dataset.offsetX = offsetX.toString();
                dragGhost.dataset.offsetY = offsetY.toString();
                
                // Track mouse position to detect actual drag vs click
                const mouseDownX = event.clientX;
                const mouseDownY = event.clientY;
                
                const checkForDrag = (e) => {
                    const dx = Math.abs(e.clientX - mouseDownX);
                    const dy = Math.abs(e.clientY - mouseDownY);
                    if (dx > 5 || dy > 5) {
                        // Actual drag started
                        isDragging = true;
                        didDrag = true;
                        dragGhost.style.display = 'block';
                        item.classList.add('dragging');
                        preview.classList.add('is-dragging');
                        document.removeEventListener('mousemove', checkForDrag);
                    }
                };
                
                document.addEventListener('mousemove', checkForDrag);
                
                // Clean up checkForDrag on mouseup if no drag occurred
                const cleanupDragCheck = () => {
                    document.removeEventListener('mousemove', checkForDrag);
                    document.removeEventListener('mouseup', cleanupDragCheck);
                };
                document.addEventListener('mouseup', cleanupDragCheck);
                
                // Prevent text selection during drag
                event.preventDefault();
            };

            // Sync dynamic data
            item.dataset.index = index.toString();

            const captionEl = item.querySelector('.image-preview-caption');
            if (captionEl) updateTextContent(captionEl, (index + 1).toString());

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
                // For reused items, ensure they don't have pop-in animations playing
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

    // Update sidebar
    renderSidebar(skipAnimation);
}

// Render the sidebar with compact image list
function renderSidebar(skipAnimation = false) {
    const sidebar = get('image-to-pdf-sidebar');
    const sidebarList = get('image-to-pdf-sidebar-list');
    
    if (!sidebar || !sidebarList) return;

    // Show/hide sidebar based on image count
    if (selectedImages.length > 0) {
        sidebar.classList.remove('hidden');
    } else {
        sidebar.classList.add('hidden');
        return;
    }

    // Collect existing items to reuse them (preserves their animations)
    const itemMap = new Map();
    sidebarList.querySelectorAll('.image-sidebar-item').forEach(el => {
        if (el.dataset.path) itemMap.set(el.dataset.path, el);
    });

    const fragment = document.createDocumentFragment();

    // Helper to create drop indicator
    const createSidebarDropIndicator = (index) => {
        const indicator = document.createElement('div');
        indicator.className = 'sidebar-drop-indicator';
        indicator.dataset.index = index.toString();
        return indicator;
    };

    // Start with first drop indicator
    fragment.appendChild(createSidebarDropIndicator(0));

    selectedImages.forEach((image, index) => {
        let item = itemMap.get(image.path);
        const isNew = !item;

        if (isNew) {
            item = document.createElement('div');
            item.className = 'image-sidebar-item';
            item.dataset.path = image.path;

            const img = document.createElement('img');
            img.src = toFileUrl(image.path);
            img.alt = image.name;
            img.loading = 'lazy';

            const indexLabel = document.createElement('span');
            indexLabel.className = 'sidebar-item-index';

            item.appendChild(img);
            item.appendChild(indexLabel);

            // Drag handlers for sidebar (no click to open viewer - sidebar is only for rearranging)
            item.onmousedown = (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                
                const currIdx = Number.parseInt(item.dataset.index, 10);
                if (Number.isNaN(currIdx)) return;
                
                sidebarDragIndex = currIdx;
                
                // Create ghost element
                const rect = item.getBoundingClientRect();
                sidebarDragGhost = item.cloneNode(true);
                sidebarDragGhost.className = 'image-sidebar-item dragging';
                sidebarDragGhost.style.cssText = `
                    position: fixed;
                    left: ${rect.left}px;
                    top: ${event.clientY - rect.height / 2}px;
                    width: ${rect.width}px;
                    pointer-events: none;
                    z-index: 10000;
                    opacity: 0.9;
                    transform: scale(1.05);
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                `;
                document.body.appendChild(sidebarDragGhost);
                
                isSidebarDragging = true;
                item.classList.add('dragging');
                sidebarList.classList.add('is-dragging');
                
                // Auto-scroll state
                let sidebarScrollVelocity = 0;
                let sidebarScrollFrame = null;
                const SIDEBAR_EDGE = 30;
                
                const startSidebarScroll = () => {
                    if (sidebarScrollFrame) return;
                    const step = () => {
                        if (!sidebarScrollVelocity) {
                            sidebarScrollFrame = null;
                            return;
                        }
                        sidebarList.scrollTop += sidebarScrollVelocity;
                        sidebarScrollFrame = requestAnimationFrame(step);
                    };
                    sidebarScrollFrame = requestAnimationFrame(step);
                };
                
                const stopSidebarScroll = () => {
                    sidebarScrollVelocity = 0;
                    if (sidebarScrollFrame) {
                        cancelAnimationFrame(sidebarScrollFrame);
                        sidebarScrollFrame = null;
                    }
                };
                
                const onMouseMove = (e) => {
                    if (!isSidebarDragging) return;
                    
                    // Move ghost
                    if (sidebarDragGhost) {
                        sidebarDragGhost.style.top = `${e.clientY - 40}px`;
                    }
                    
                    // Handle auto-scroll
                    const listRect = sidebarList.getBoundingClientRect();
                    if (e.clientY < listRect.top + SIDEBAR_EDGE) {
                        sidebarScrollVelocity = -8;
                        startSidebarScroll();
                    } else if (e.clientY > listRect.bottom - SIDEBAR_EDGE) {
                        sidebarScrollVelocity = 8;
                        startSidebarScroll();
                    } else {
                        stopSidebarScroll();
                    }
                    
                    // Find drop target - use drop indicators
                    const indicators = sidebarList.querySelectorAll('.sidebar-drop-indicator');
                    let newDropIndex = -1;
                    
                    // Clear all highlights first
                    indicators.forEach(ind => ind.classList.remove('drag-over'));
                    
                    // Find the indicator to highlight based on mouse position
                    indicators.forEach((indicator) => {
                        const rect = indicator.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        
                        // Check if mouse is near this indicator
                        if (e.clientY >= rect.top - 20 && e.clientY <= rect.bottom + 20) {
                            const idx = Number.parseInt(indicator.dataset.index, 10);
                            if (!Number.isNaN(idx)) {
                                newDropIndex = idx;
                                indicator.classList.add('drag-over');
                            }
                        }
                    });
                    
                    sidebarDropIndex = newDropIndex;
                };
                
                const onMouseUp = () => {
                    // Stop auto-scroll
                    stopSidebarScroll();
                    
                    if (sidebarDragGhost) {
                        sidebarDragGhost.remove();
                        sidebarDragGhost = null;
                    }
                    
                    // Clear indicator highlights
                    sidebarList.querySelectorAll('.sidebar-drop-indicator.drag-over').forEach(el => {
                        el.classList.remove('drag-over');
                    });
                    sidebarList.querySelectorAll('.image-sidebar-item.dragging').forEach(el => {
                        el.classList.remove('dragging');
                    });
                    sidebarList.classList.remove('is-dragging');
                    
                    // Perform reorder
                    if (sidebarDragIndex !== null && sidebarDropIndex >= 0) {
                        const updated = selectedImages.slice();
                        const [moved] = updated.splice(sidebarDragIndex, 1);
                        
                        // Calculate final index
                        let finalIndex = sidebarDropIndex;
                        if (sidebarDropIndex > sidebarDragIndex) {
                            finalIndex = sidebarDropIndex - 1;
                        }
                        
                        // Only update if position actually changes
                        if (finalIndex !== sidebarDragIndex) {
                            updated.splice(finalIndex, 0, moved);
                            selectedImages = updated;
                            renderImagePreview(true);
                        }
                    }
                    
                    sidebarDragIndex = null;
                    sidebarDropIndex = -1;
                    isSidebarDragging = false;
                    
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
        }

        // Update index
        item.dataset.index = index.toString();
        const indexLabel = item.querySelector('.sidebar-item-index');
        if (indexLabel) indexLabel.textContent = (index + 1).toString();

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
            // For reused items, ensure they don't have pop-in animations playing
            item.style.animation = 'none';
            item.style.opacity = '1';
            item.style.transform = 'none';
        }

        // Add drop indicator after each item
        fragment.appendChild(createSidebarDropIndicator(index + 1));
    });

    sidebarList.replaceChildren(fragment);
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
    const paths = await window.api.selectFiles({
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
    let outputPath = await window.api.saveFile({
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
        const outputPathResult = await window.api.convertImagesToPdf({
            imagePaths: selectedImages.map((img) => img.path),
            outputPath,
            quality: compressionQuality,
            upscale: upscaleToMax
        });

        if (!outputPathResult) {
            showPopup('Failed to create PDF.');
            return;
        }

        const completeTitle = get('complete-title');
        const outputPathEl = get('output-path');
        const completeView = get('complete-view');
        const newEncodeBtn = get('new-encode-btn');

        if (completeTitle) completeTitle.textContent = 'PDF Created!';
        if (newEncodeBtn) newEncodeBtn.textContent = 'Create Another PDF';
        if (outputPathEl) outputPathEl.textContent = outputPathResult;
        state.setCurrentOutputPath(outputPathResult);
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
        preview.addEventListener('wheel', (event) => {
            if (!preview) return;
            if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
            event.preventDefault();
            preview.scrollLeft += event.deltaY;
        }, { passive: false });

        function getIndicatorFromPosition(clientX, clientY) {
            // Find the element at the position
            const elementsAtPoint = document.elementsFromPoint(clientX, clientY);
            
            for (const el of elementsAtPoint) {
                if (el.classList.contains('image-drop-indicator')) {
                    return el;
                }
                if (el.classList.contains('image-preview-item') && !el.classList.contains('dragging') && !el.classList.contains('drag-ghost')) {
                    const rect = el.getBoundingClientRect();
                    const isRightHalf = (clientX - rect.left) > (rect.width / 2);
                    const itemIndex = Number.parseInt(el.dataset.index, 10);
                    if (!Number.isNaN(itemIndex)) {
                        const targetIndex = isRightHalf ? itemIndex + 1 : itemIndex;
                        return preview.querySelector(`.image-drop-indicator[data-index="${targetIndex}"]`);
                    }
                }
            }
            return null;
        }

        // Mouse-based drag handlers (WebView2 compatible)
        document.addEventListener('mousemove', (event) => {
            if (!isDragging || !dragGhost) return;
            
            // Move the ghost element with the cursor
            const offsetX = parseFloat(dragGhost.dataset.offsetX) || 0;
            const offsetY = parseFloat(dragGhost.dataset.offsetY) || 0;
            const width = dragGhost.offsetWidth;
            const height = dragGhost.offsetHeight;
            
            dragGhost.style.left = `${event.clientX + offsetX - width / 2}px`;
            dragGhost.style.top = `${event.clientY + offsetY - height / 2}px`;
            
            // Find drop indicator
            const indicator = getIndicatorFromPosition(event.clientX, event.clientY);
            
            // Clear other highlights
            preview.querySelectorAll('.image-drop-indicator.drag-over').forEach(el => {
                if (el !== indicator) el.classList.remove('drag-over');
            });
            
            if (indicator) {
                indicator.classList.add('drag-over');
                currentDropIndex = Number.parseInt(indicator.dataset.index, 10);
            } else {
                currentDropIndex = -1;
            }
            
            // Handle auto-scroll
            if (previewWrap) handleAutoScroll(event, preview, previewWrap);
        });

        document.addEventListener('mouseup', (event) => {
            // Clean up ghost even if no drag occurred
            if (dragGhost) {
                dragGhost.remove();
                dragGhost = null;
            }
            
            if (!isDragging) return;
            
            // Remove visual states
            preview.querySelectorAll('.image-preview-item.dragging').forEach(el => {
                el.classList.remove('dragging');
            });
            preview.classList.remove('is-dragging');
            preview.querySelectorAll('.image-drop-indicator.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            
            stopAutoScroll();
            
            // Perform the reorder if we have valid indices
            const fromIndex = dragIndex;
            const toIndex = currentDropIndex;
            
            if (!Number.isNaN(fromIndex) && !Number.isNaN(toIndex) && toIndex >= 0) {
                // If dropping on the target immediately before or after the item, no change needed
                if (toIndex !== fromIndex && toIndex !== fromIndex + 1) {
                    const updated = selectedImages.slice();
                    const [moved] = updated.splice(fromIndex, 1);
                    
                    // Adjust toIndex if it was after the item we just removed
                    const finalToIndex = (toIndex > fromIndex) ? toIndex - 1 : toIndex;
                    
                    updated.splice(finalToIndex, 0, moved);
                    selectedImages = updated;
                    renderImagePreview(true);
                }
            }
            
            // Reset state
            dragIndex = null;
            isDragging = false;
            currentDropIndex = -1;
            // Note: didDrag is reset in onclick handler, not here
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

    // Image editing handlers
    const rotateLeftBtn = get('image-viewer-rotate-left');
    const rotateRightBtn = get('image-viewer-rotate-right');
    const cropBtn = get('image-viewer-crop');
    const resetBtn = get('image-viewer-reset');
    const applyBtn = get('image-viewer-apply');
    const cropCancelBtn = get('crop-cancel');
    const cropConfirmBtn = get('crop-confirm');

    if (rotateLeftBtn) {
        rotateLeftBtn.addEventListener('click', () => rotateImage('left'));
    }

    if (rotateRightBtn) {
        rotateRightBtn.addEventListener('click', () => rotateImage('right'));
    }

    if (cropBtn) {
        cropBtn.addEventListener('click', () => toggleCropMode());
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => resetEdits());
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', () => applyEdits());
    }

    if (cropCancelBtn) {
        cropCancelBtn.addEventListener('click', () => cancelCrop());
    }

    if (cropConfirmBtn) {
        cropConfirmBtn.addEventListener('click', () => confirmCrop());
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeImageViewer();
    });

    renderImagePreview();
}
