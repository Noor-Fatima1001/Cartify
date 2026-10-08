import React, { useState, useEffect } from 'react';
import { Trash2, Move, Upload } from 'lucide-react';
import { usePrompt } from './CustomPrompt';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — matches backend MAX_PRODUCT_IMAGE_SIZE_BYTES
const MAX_IMAGES = 8; // matches backend MAX_PRODUCT_IMAGES
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

const ProductImageManager = ({
    existingImages = [],
    onImagesChange,
    getImageUrl
}) => {
    const { prompt } = usePrompt();
    const [items, setItems] = useState([]);
    const [deletedImages, setDeletedImages] = useState([]);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState('');

    // Style block to embed hover effects and custom cursors
    const styleBlock = `
        .image-manager-item {
            cursor: grab;
            transition: all 0.2s ease-in-out;
        }
        .image-manager-item:active {
            cursor: grabbing;
        }
        .image-manager-item:hover .image-manager-overlay {
            opacity: 1 !important;
        }
        .image-manager-item:hover {
            transform: scale(1.03);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
        }
    `;

    // Sync from props on initial edit load or when existing images change
    useEffect(() => {
        const normalizeKey = (url) => {
            try {
                if (typeof url !== 'string') return url;
                // If URL contains /media/, use the path after it to match backend storage paths
                const parts = url.split('/media/');
                if (parts.length > 1 && parts[1]) return parts[1];
                return url;
            } catch (e) {
                return url;
            }
        };

        const initialItems = existingImages.map((url, idx) => ({
            id: `existing-${idx}-${String(url)}`,
            type: 'existing',
            url: url,
            key: normalizeKey(url)
        }));
        setItems(initialItems);
        setDeletedImages([]);
        setError('');
    }, [existingImages]);

    // Notify parent on any changes
    const notifyParent = (newItems, currentDeleted) => {
        const imageOrder = newItems.map(item => {
            if (item.type === 'existing') {
                return item.key;
            } else {
                return item.file.name;
            }
        });

        const newFiles = newItems
            .filter(item => item.type === 'new')
            .map(item => item.file);

        onImagesChange({
            items: newItems,
            newFiles: newFiles,
            imageOrder: imageOrder,
            deletedImages: currentDeleted
        });
    };

    const handleFileChange = (e) => {
        if (!e.target.files) return;
        addFiles(Array.from(e.target.files));
        e.target.value = ''; // Reset file input
    };

    const addFiles = (files) => {
        const rejected = [];
        const accepted = [];

        files.forEach((file) => {
            const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                rejected.push(`${file.name} — unsupported file type`);
                return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                rejected.push(`${file.name} — larger than ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
                return;
            }
            accepted.push(file);
        });

        if (items.length + accepted.length > MAX_IMAGES) {
            const room = Math.max(0, MAX_IMAGES - items.length);
            rejected.push(`Only ${MAX_IMAGES} images are allowed per product — ${accepted.length - room} image(s) not added`);
            accepted.splice(room);
        }

        setError(rejected.length > 0 ? rejected.join('; ') : '');
        if (accepted.length === 0) return;

        const newItems = accepted.map((file, idx) => ({
            id: `new-${Date.now()}-${idx}-${file.name}`,
            type: 'new',
            url: URL.createObjectURL(file),
            file: file,
            key: file.name
        }));

        const updatedItems = [...items, ...newItems];
        setItems(updatedItems);
        notifyParent(updatedItems, deletedImages);
    };

    const handleRemove = async (index, item) => {
        const confirmed = await prompt({
            title: 'Delete Image',
            message: 'Are you sure you want to remove this image from the product?',
            showInput: false
        });
        if (!confirmed) return;

        let updatedDeleted = [...deletedImages];
        if (item.type === 'existing') {
            updatedDeleted.push(item.key);
            setDeletedImages(updatedDeleted);
        } else {
            URL.revokeObjectURL(item.url);
        }

        const updatedItems = items.filter((_, idx) => idx !== index);
        setItems(updatedItems);
        notifyParent(updatedItems, updatedDeleted);
    };

    // HTML5 Drag and Drop Handlers
    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) return;

        const updatedItems = [...items];
        const [draggedItem] = updatedItems.splice(draggedIndex, 1);
        updatedItems.splice(targetIndex, 0, draggedItem);

        setItems(updatedItems);
        setDraggedIndex(null);
        notifyParent(updatedItems, deletedImages);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    // Dropzone drag over handlers (for drag & drop upload)
    const handleDropzoneDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDropzoneDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDropzoneDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addFiles(Array.from(e.dataTransfer.files));
        }
    };

    return (
        <div style={{ display: 'grid', gap: '1rem', width: '100%' }}>
            <style dangerouslySetInnerHTML={{ __html: styleBlock }} />
            
            {/* Upload Zone */}
            <div
                onDragOver={handleDropzoneDragOver}
                onDragLeave={handleDropzoneDragLeave}
                onDrop={handleDropzoneDrop}
                style={{
                    border: isDragOver ? '2px dashed var(--dash-accent)' : '2px dashed var(--dash-border)',
                    borderRadius: 'var(--dash-radius-md)',
                    padding: '1.5rem',
                    textAlign: 'center',
                    background: isDragOver ? 'var(--dash-accent-soft)' : 'var(--dash-surface-alt)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                }}
                onClick={() => document.getElementById('product-image-uploader').click()}
            >
                <input
                    id="product-image-uploader"
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Upload size={24} style={{ color: 'var(--dash-ink-soft)' }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--dash-ink)' }}>
                        Drag & Drop or Click to Upload
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--dash-ink-soft)' }}>
                        JPG, PNG or WEBP · up to {MAX_IMAGE_BYTES / (1024 * 1024)}MB each · max {MAX_IMAGES} images
                    </span>
                </div>
            </div>

            {error && (
                <div style={{ fontSize: '0.8rem', color: 'var(--dash-danger)' }}>{error}</div>
            )}

            {/* Gallery Grid */}
            {items.length > 0 && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                        gap: '0.75rem',
                        marginTop: '0.5rem'
                    }}
                >
                    {items.map((item, index) => {
                        const isMain = index === 0;
                        const isDragging = draggedIndex === index;

                        return (
                            <div
                                key={item.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                style={{
                                    position: 'relative',
                                    aspectRatio: '1',
                                    borderRadius: 'var(--dash-radius-sm)',
                                    overflow: 'hidden',
                                    border: isMain ? '2px solid var(--dash-accent)' : '1px solid var(--dash-border)',
                                    opacity: isDragging ? 0.4 : 1,
                                    transform: isDragging ? 'scale(0.95)' : 'none',
                                    background: 'var(--dash-surface)'
                                }}
                                className="image-manager-item"
                            >
                                <img
                                    src={getImageUrl ? getImageUrl(item.url) : item.url}
                                    alt={`Product ${index + 1}`}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        pointerEvents: 'none'
                                    }}
                                />

                                {/* Drag Overlay / Indicator */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'rgba(0, 0, 0, 0.35)',
                                        opacity: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'opacity 0.2s ease',
                                        pointerEvents: 'none'
                                    }}
                                    className="image-manager-overlay"
                                >
                                    <Move size={16} color="#fff" />
                                </div>

                                {/* Main Image Badge */}
                                {isMain && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            bottom: '6px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            background: 'var(--dash-accent)',
                                            color: '#fff',
                                            fontSize: '0.65rem',
                                            fontWeight: '700',
                                            padding: '2px 8px',
                                            borderRadius: 'var(--dash-radius-pill)',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                            whiteSpace: 'nowrap',
                                            pointerEvents: 'none',
                                            zIndex: 2
                                        }}
                                    >
                                        Main Image
                                    </div>
                                )}

                                {/* Delete button (X) */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemove(index, item);
                                    }}
                                    style={{
                                        position: 'absolute',
                                        top: '6px',
                                        right: '6px',
                                        background: 'var(--dash-danger)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '22px',
                                        height: '22px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                        zIndex: 3,
                                        fontSize: '0.9rem',
                                        fontWeight: 'bold'
                                    }}
                                    title="Delete Image"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ProductImageManager;
