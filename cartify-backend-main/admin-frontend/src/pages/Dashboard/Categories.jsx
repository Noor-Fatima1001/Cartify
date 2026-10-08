import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { categoryService } from '../../services/categoryService';
import { useToast } from '../../context/ToastContext';
import { Plus, Edit2, Trash2, Layers, Check, X, Search } from 'lucide-react';
import { usePrompt } from '../../components/common/CustomPrompt';
import { getImageUrl } from '../../utils/image';

const PAGE_SIZE = 10;

const Categories = () => {
    const { showToast } = useToast();
    const { prompt } = usePrompt();
    const [searchParams, setSearchParams] = useSearchParams();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryForm, setCategoryForm] = useState({
        name: '',
        subcategories: [],
        is_active: true
    });
    const [imageFile, setImageFile] = useState(null);
    const [newSubName, setNewSubName] = useState('');
    const [lightboxSrc, setLightboxSrc] = useState(null);

    const showModal = searchParams.get('modal') === 'category';

    const openModal = (category = null) => {
        if (category) {
            setEditingCategory(category);
            setCategoryForm({
                name: category.name,
                subcategories: category.subcategories || [],
                is_active: category.is_active ?? true
            });
            setImageFile(null);
        } else {
            setEditingCategory(null);
            setCategoryForm({ name: '', subcategories: [], is_active: true });
            setImageFile(null);
        }
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('modal', 'category');
        setSearchParams(nextParams);
    };

    const closeModal = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('modal');
        setSearchParams(nextParams);
        setEditingCategory(null);
        setCategoryForm({ name: '', subcategories: [] });
    };

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const response = await categoryService.getCategories({
                page: currentPage,
                limit: PAGE_SIZE,
                search: searchTerm,
                status: statusFilter
            });
            setCategories(response.results || []);
            setTotalPages(response.total_pages || 1);
            setTotalItems(response.total_items || 0);
        } catch (error) {
            console.error('Error fetching categories:', error);
            showToast('Failed to fetch categories', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, [currentPage, searchTerm, statusFilter]);

    const handleAddSubcategory = () => {
        if (!newSubName.trim()) return;
        setCategoryForm(prev => ({
            ...prev,
            subcategories: [...prev.subcategories, { name: newSubName.trim() }]
        }));
        setNewSubName('');
    };

    const handleRemoveSubcategory = (index) => {
        setCategoryForm(prev => ({
            ...prev,
            subcategories: prev.subcategories.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!categoryForm.name.trim()) {
            showToast('Category name is required', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                ...categoryForm,
                is_active: !!categoryForm.is_active,
            };

            // When creating a new category, image is required
            if (!editingCategory && !imageFile) {
                showToast('Category image is required', 'error');
                setSubmitting(false);
                return;
            }

            let sendData = payload;
            if (imageFile) {
                const fd = new FormData();
                fd.append('name', payload.name);
                fd.append('is_active', payload.is_active);
                fd.append('image', imageFile);
                if (payload.subcategories) fd.append('subcategories', JSON.stringify(payload.subcategories));
                sendData = fd;
            }

            if (editingCategory) {
                await categoryService.updateCategory(editingCategory.id, sendData);
                showToast('Category updated successfully');
            } else {
                await categoryService.createCategory(sendData);
                showToast('Category created successfully');
            }
            fetchCategories();
            closeModal();
        } catch (error) {
            console.error('Error saving category:', error);
            showToast(error.response?.data?.error || 'Failed to save category', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await prompt({
            title: 'Delete Category',
            message: 'Are you sure you want to delete this category?',
            showInput: false
        });
        if (!confirmed) return;
        try {
            await categoryService.deleteCategory(id);
            showToast('Category deleted successfully');
            fetchCategories();
        } catch (error) {
            console.error('Error deleting category:', error);
            showToast('Failed to delete category', 'error');
        }
    };

    const handleToggleStatus = async (id, currentStatus) => {
        try {
            await categoryService.toggleCategoryStatus(id);
            showToast(`Category ${currentStatus ? 'deactivated' : 'activated'} successfully`);
            fetchCategories();
        } catch (error) {
            console.error('Error toggling category status:', error);
            showToast('Failed to update status', 'error');
        }
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    const columns = ['Image', 'Category Name', 'Subcategories', 'Status', 'Actions'];

    const renderRow = (category) => (
        <>
            <td>
                {category.image ? (
                    <div className="vendor-avatar">
                        <img
                            src={getImageUrl(category.image)}
                            alt={category.name || 'Category image'}
                            style={{ cursor: 'zoom-in' }}
                            onClick={() => setLightboxSrc(getImageUrl(category.image))}
                        />
                    </div>
                ) : (
                    <div className="vendor-avatar" style={{ fontSize: '0.65rem' }}>N/A</div>
                )}
            </td>
            <td style={{ fontWeight: 600 }}>{category.name}</td>
            <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {category.subcategories?.length > 0 ? (
                        category.subcategories.map(sub => (
                            <span key={sub.id} className="dash-tag">
                                {sub.name}
                            </span>
                        ))
                    ) : (
                        <span style={{ color: 'var(--dash-ink-faint)', fontSize: '0.85rem' }}>None</span>
                    )}
                </div>
            </td>
            <td>
                <StatusBadge status={category.is_active ? 'ACTIVE' : 'CANCELLED'} label={category.is_active ? 'Active' : 'Inactive'} />
            </td>
            <td>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                        className="action-btn"
                        onClick={() => openModal(category)}
                        title="Edit"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        className="action-btn"
                        onClick={() => handleToggleStatus(category.id, category.is_active)}
                        title={category.is_active ? 'Deactivate' : 'Activate'}
                        style={{ color: category.is_active ? 'var(--dash-danger)' : 'var(--dash-success)' }}
                    >
                        {category.is_active ? <X size={14} /> : <Check size={14} />}
                    </button>
                    <button
                        className="action-btn"
                        onClick={() => handleDelete(category.id)}
                        title="Delete"
                        style={{ color: 'var(--dash-danger)' }}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </td>
        </>
    );

    const previewSrc = imageFile
        ? URL.createObjectURL(imageFile)
        : (editingCategory?.image ? getImageUrl(editingCategory.image) : null);

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Layers size={20} /> Categories Management</h3>
                    <p>Manage marketplace categories and subcategories.</p>
                </div>
                <button className="btn btn-primary page-action-btn" onClick={() => openModal()}>
                    <Plus size={18} /> Add Category
                </button>
            </div>

            <div className="data-section" style={{ marginBottom: '1rem' }}>
                <div className="section-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="toolbar-controls">
                        <div className="search-box">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search Categories..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                            <option value="ALL">All Status</option>
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                        </select>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={showModal}
                onClose={closeModal}
                title={editingCategory ? 'Edit Category' : 'Add New Category'}
                maxWidth="820px"
            >
                <form onSubmit={handleSubmit}>
                    <div className="product-form-grid">
                        <div className="product-form-main">
                            <div className="product-form-section">
                                <h4 className="product-form-section-title">Category Details</h4>
                                <div className="form-group">
                                    <label>Category Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Electronics"
                                        value={categoryForm.name}
                                        onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="product-form-section">
                                <h4 className="product-form-section-title">Subcategories</h4>
                                <div className="form-group" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                                    <input
                                        type="text"
                                        placeholder="Add subcategory..."
                                        value={newSubName}
                                        onChange={(e) => setNewSubName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubcategory())}
                                        style={{ flex: '1 1 240px', width: 'auto' }}
                                    />
                                    <button type="button" className="btn btn-secondary" onClick={handleAddSubcategory}>
                                        Add
                                    </button>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '0.25rem',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    padding: categoryForm.subcategories.length > 0 ? '0.75rem' : '0',
                                    background: categoryForm.subcategories.length > 0 ? 'var(--dash-surface)' : 'transparent',
                                    borderRadius: 'var(--dash-radius-sm)',
                                    border: categoryForm.subcategories.length > 0 ? '1px solid var(--dash-border)' : 'none',
                                }}>
                                    {categoryForm.subcategories.length > 0 ? (
                                        categoryForm.subcategories.map((sub, index) => (
                                            <span key={index} className="subcat-tag">
                                                <span>{sub.name}</span>
                                                <X
                                                    size={13}
                                                    onClick={() => handleRemoveSubcategory(index)}
                                                />
                                            </span>
                                        ))
                                    ) : (
                                        <div style={{ width: '100%', textAlign: 'center', color: 'var(--dash-ink-soft)', padding: '0.5rem' }}>
                                            No subcategories added
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="product-form-side">
                            <div className="product-form-section">
                                <h4 className="product-form-section-title">Image</h4>
                                {previewSrc && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '140px',
                                        background: 'var(--dash-surface)',
                                        borderRadius: 'var(--dash-radius-sm)',
                                        border: '1px solid var(--dash-border)',
                                        marginBottom: '0.9rem',
                                        overflow: 'hidden',
                                    }}>
                                        <img
                                            src={previewSrc}
                                            alt="Category preview"
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in' }}
                                            onClick={() => setLightboxSrc(previewSrc)}
                                        />
                                    </div>
                                )}
                                <div className="form-group">
                                    <label>Category Image {editingCategory ? '(leave empty to keep current)' : ''}</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setImageFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                                    />
                                </div>
                            </div>

                            <div className="product-form-section">
                                <h4 className="product-form-section-title">Settings</h4>
                                <div className="dash-toggle-row">
                                    <div>
                                        <div className="dash-toggle-label">Active</div>
                                        <div className="dash-toggle-hint">Visible in the marketplace when enabled</div>
                                    </div>
                                    <label className="dash-toggle">
                                        <input
                                            type="checkbox"
                                            checked={!!categoryForm.is_active}
                                            onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })}
                                        />
                                        <span className="dash-toggle-track"><span className="dash-toggle-thumb" /></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="product-form-actions">
                        <button type="button" className="btn btn-secondary" onClick={closeModal}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : (editingCategory ? 'Update Category' : 'Create Category')}
                        </button>
                    </div>
                </form>
            </Modal>

            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={categories}
                    renderRow={renderRow}
                    keyExtractor={(category) => category.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={totalItems}
                    loading={loading}
                />
            </div>

            {lightboxSrc && (
                <div className="image-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
                    <img src={lightboxSrc} alt="Full size" className="image-lightbox-img" />
                </div>
            )}
        </div>
    );
};

export default Categories;
