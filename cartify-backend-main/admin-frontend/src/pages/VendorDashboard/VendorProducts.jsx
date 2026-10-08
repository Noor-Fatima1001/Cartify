import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import { productService } from '../../services/productService';
import { vendorService } from '../../services/vendorService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import { Plus, Edit, Trash2, Package, Eye, Search } from 'lucide-react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import { analyticsService } from '../../services/analyticsService';
import ProductImageManager from '../../components/common/ProductImageManager';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';

const PAGE_SIZE = 10;

const getImageUrl = (imagePath) => {
    const fallbackImage = 'https://via.placeholder.com/300x300?text=No+Image';
    if (!imagePath) return fallbackImage;
    // support image objects returned by some APIs (e.g. { image: 'path' } or { url: '...' })
    if (typeof imagePath === 'object' && imagePath !== null) {
        imagePath = imagePath.url || imagePath.image || imagePath.path || imagePath.file || '';
    }
    if (!imagePath) return fallbackImage;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('blob:')) {
        return imagePath;
    }
    const backendUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : 'https://cartifyapi.dbitsdemo.com/api';
    const normalizedPath = imagePath.startsWith('/') ? imagePath : `/media/${imagePath}`;
    return `${backendUrl}${normalizedPath}`;
};

const VendorProducts = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { prompt } = usePrompt();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [submitting, setSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [subcategories, setSubcategories] = useState([]);
    const [formErrors, setFormErrors] = useState({});
    const [editingProduct, setEditingProduct] = useState(null);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [showVisitorAnalyticsModal, setShowVisitorAnalyticsModal] = useState(false);
    const [showFavoriteAnalyticsModal, setShowFavoriteAnalyticsModal] = useState(false);
    const [showClickAnalyticsModal, setShowClickAnalyticsModal] = useState(false);
    const [showCartAnalyticsModal, setShowCartAnalyticsModal] = useState(false);
    const [analyticsModalData, setAnalyticsModalData] = useState([]);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsModalPage, setAnalyticsModalPage] = useState(1);
    const [analyticsModalTotalPages, setAnalyticsModalTotalPages] = useState(1);
    const [analyticsModalTotalItems, setAnalyticsModalTotalItems] = useState(0);
    const [analyticsModalTotalViews, setAnalyticsModalTotalViews] = useState(null);
    const [analyticsModalProductId, setAnalyticsModalProductId] = useState(null);
    const [analyticsModalTitle, setAnalyticsModalTitle] = useState('Visitor Details');
    const [analyticsModalVisitorLimit, setAnalyticsModalVisitorLimit] = useState(null);
    const [analyticsModalLockedCount, setAnalyticsModalLockedCount] = useState(0);
    const canAccessAnalytics = user?.analytics_permission?.can_access_analytics ?? user?.can_access_analytics ?? true;
    const getFavoriteCount = (product) => {
        if (!product) return '—';
        if (typeof product.favorites === 'number') return product.favorites;
        if (typeof product.favorites_count === 'number') return product.favorites_count;
        return product.total_favorites ?? '—';
    };
    const [productForm, setProductForm] = useState({
        name: '',
        product_type: '',
        description: '',
        price: '',
        original_price: '',
        discount: '',
        category: '',
        subcategory: '',
        purchase_link: '',
        images: [],
        is_active: true,
    });
    const [imageOrder, setImageOrder] = useState([]);
    const [deletedImages, setDeletedImages] = useState([]);
    const [newImageFiles, setNewImageFiles] = useState([]);
    const [existingImagesList, setExistingImagesList] = useState([]);

    const showAddProductModal = searchParams.get('modal') === 'add';
    const showEditProductModal = searchParams.get('modal') === 'edit';

    const closeProductModal = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('modal');
        setSearchParams(nextParams);
        resetProductForm();
    };

    const vendorHasCategories = categories && categories.length > 0;

    const resetProductForm = () => {
        setProductForm({
            name: '',
            product_type: '',
            description: '',
            price: '',
            original_price: '',
            discount: '',
            category: '',
            subcategory: '',
            purchase_link: '',
            images: [],
            is_active: true,
        });
        setFormErrors({});
        setEditingProduct(null);
        setExistingImagesList([]);
        setDeletedImages([]);
        setNewImageFiles([]);
        setImageOrder([]);
    };

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const data = await vendorService.getVendorProducts();
            setProducts(data);
            setTotalPages(Math.max(1, Math.ceil(data.length / PAGE_SIZE)));
        } catch (error) {
            console.error('Error fetching products:', error);
            showToast('Failed to fetch products', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            if (user?.id) {
                const data = await vendorService.getVendorCategories(user.id);
                setCategories(data);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    useEffect(() => {
        fetchProducts();
        fetchCategories();
    }, [user?.id]);

    useEffect(() => {
        return () => {
            imagePreviews.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [imagePreviews]);
    const handleViewProduct = (product) => {
        navigate(`/admin/vendor-dashboard/products/${product.id}`);
    };

    const fetchAnalyticsDetails = async (type, productId, page = 1, title) => {
        if (!canAccessAnalytics) {
            showToast('Analytics access is disabled for your account', 'error');
            return;
        }
        try {
            setAnalyticsLoading(true);
            setAnalyticsModalTitle(title);
            const params = { product_id: productId, limit: ANALYTICS_PAGE_SIZE, page };
            let res;

            switch (type) {
                case 'views':
                    // "Total Views" shows individual view events (own timestamp
                    // each); "Visitor Details" shows one row per visitor summed up.
                    if (title === 'Total Views') params.granularity = 'event';
                    res = await analyticsService.getVendorDetailedViews(params);
                    break;
                case 'favorites':
                    res = await analyticsService.getVendorDetailedFavorites(params);
                    break;
                case 'clicks':
                    res = await analyticsService.getVendorDetailedClicks(params);
                    break;
                case 'cart':
                    res = await analyticsService.getVendorDetailedCart(params);
                    break;
                default:
                    throw new Error('Unsupported analytics type');
            }

            const pagination = normalizeAnalyticsPagination(res, page, ANALYTICS_PAGE_SIZE);
            setAnalyticsModalData(pagination.results);
            setAnalyticsModalTotalPages(pagination.totalPages);
            setAnalyticsModalTotalItems(pagination.totalItems);
            setAnalyticsModalPage(pagination.currentPage);
            setAnalyticsModalProductId(productId);
            setAnalyticsModalVisitorLimit(res.visitor_limit ?? null);
            setAnalyticsModalLockedCount(res.locked_count || 0);
            setAnalyticsModalTotalViews(type === 'views' ? (res.total_views ?? null) : null);

            if (type === 'views') {
                setShowVisitorAnalyticsModal(true);
                setShowFavoriteAnalyticsModal(false);
                setShowClickAnalyticsModal(false);
                setShowCartAnalyticsModal(false);
            } else if (type === 'favorites') {
                setShowVisitorAnalyticsModal(false);
                setShowFavoriteAnalyticsModal(true);
                setShowClickAnalyticsModal(false);
                setShowCartAnalyticsModal(false);
            } else if (type === 'clicks') {
                setShowVisitorAnalyticsModal(false);
                setShowFavoriteAnalyticsModal(false);
                setShowClickAnalyticsModal(true);
                setShowCartAnalyticsModal(false);
            } else {
                setShowVisitorAnalyticsModal(false);
                setShowFavoriteAnalyticsModal(false);
                setShowClickAnalyticsModal(false);
                setShowCartAnalyticsModal(true);
            }
        } catch (err) {
            console.error(`Failed to load ${type} analytics:`, err);
            if (err.response?.status === 403) {
                showToast(err.response?.data?.error || 'Analytics access is disabled for your account', 'error');
            } else {
                showToast(`Failed to load ${type} analytics`, 'error');
            }
        } finally {
            setAnalyticsLoading(false);
        }
    };

    const fetchVisitorAnalyticsData = async (productId, page = 1, title = 'Visitor Details') => {
        await fetchAnalyticsDetails('views', productId, page, title);
    };

    const fetchFavoriteAnalyticsData = async (productId, page = 1) => {
        await fetchAnalyticsDetails('favorites', productId, page, 'Favorite Details');
    };

    const fetchClickAnalyticsData = async (productId, page = 1) => {
        await fetchAnalyticsDetails('clicks', productId, page, 'Purchase Link Clicks');
    };

    const fetchCartAnalyticsData = async (productId, page = 1) => {
        if (!canAccessAnalytics) {
            showToast('Analytics access is disabled for your account', 'error');
            return;
        }
        try {
            await fetchAnalyticsDetails('cart', productId, page, 'Cart Details');
        } catch (err) {
            console.error('Failed to load cart analytics:', err);
            if (err.response?.status === 403) {
                showToast(err.response?.data?.error || 'Analytics access is disabled for your account', 'error');
            } else {
                showToast('Failed to load cart analytics', 'error');
            }
        }
    };

    const handleEditProduct = (product) => {
        setEditingProduct(product);

        const category = product.categories?.[0] || null;
        const subcategory = category?.subcategories?.[0] || null;

        setProductForm({
            vendor_id: product.vendor || '',
            name: product.name || '',
            product_type: product.product_type || '',
            description: product.description || '',
            price: product.price || '',
            original_price: product.original_price || '',
            discount: product.discount || '',
            category: category?.id || '',
            subcategory: subcategory?.id || '',
            purchase_link: product.purchase_link || '',
            images: [],
            is_active: product.is_active,
        });

        setSubcategories(category?.subcategories || []);

        setExistingImagesList(product.images || []);
        setDeletedImages([]);
        setNewImageFiles([]);
        const normalizeKey = (url) => {
            try {
                if (typeof url !== 'string') return url;
                const parts = url.split('/media/');
                if (parts.length > 1 && parts[1]) return parts[1];
                return url;
            } catch (e) {
                return url;
            }
        };
        setImageOrder((product.images || []).map(normalizeKey));

        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('modal', 'edit');
        setSearchParams(nextParams);
    };

    // ProductDetail's "Edit" button links back here with ?modal=edit&edit_id=X
    // (it can't open the edit form itself — that flow lives entirely in this
    // list page's own state/handlers). consumedEditIdRef stops this from
    // re-firing every time `products` refetches while the modal is open.
    const consumedEditIdRef = useRef(null);
    useEffect(() => {
        const editId = searchParams.get('edit_id');
        if (!editId || editId === consumedEditIdRef.current || products.length === 0) return;
        consumedEditIdRef.current = editId;
        const product = products.find((p) => String(p.id) === editId);
        if (product) handleEditProduct(product);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('edit_id');
        if (product) nextParams.set('modal', 'edit');
        setSearchParams(nextParams, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products, searchParams]);

    const handleFormChange = (event) => {
        const { name, value, type, checked, files } = event.target;
        if (name === 'images') {
            const imageFiles = files ? Array.from(files) : [];
            setProductForm(prev => ({ ...prev, images: imageFiles }));
            setImagePreviews(imageFiles.map((file) => URL.createObjectURL(file)));
            return;
        }
        const fieldValue = type === 'checkbox' ? checked : value;
        setProductForm(prev => {
            const updated = { ...prev, [name]: fieldValue };
            if (name === 'price' || name === 'original_price') {
                const p = parseFloat(updated.price);
                const op = parseFloat(updated.original_price);
                if (p && op && op > 0) {
                    updated.discount = Math.round(((op - p) / op) * 100);
                }
            }
            return updated;
        });
        setFormErrors(prev => ({ ...prev, [name]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormErrors({});

        const errors = {};
        if (!productForm.name?.toString().trim()) errors.name = 'Product name is required';
        if (!productForm.category?.toString().trim()) errors.category = 'Category is required';
        if (selectedCategory?.subcategories?.length > 0 && !productForm.subcategory) {
            errors.subcategory = 'Please select a subcategory for this category';
        }
        if (!productForm.price?.toString().trim()) {
            errors.price = 'Price is required';
        } else if (parseFloat(productForm.price) <= 0) {
            errors.price = 'Price must be greater than 0';
        }
        if (productForm.original_price && parseFloat(productForm.original_price) <= 0) {
            errors.original_price = 'Original price must be greater than 0';
        }
        if (productForm.original_price && parseFloat(productForm.price) > parseFloat(productForm.original_price)) {
            errors.price = 'Price cannot be greater than original price';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            Object.entries(productForm).forEach(([key, value]) => {
                if (key === 'images') return;
                if (value !== null && value !== '') {
                    formData.append(key, value);
                }
            });

            newImageFiles.forEach((file) => {
                formData.append('images', file);
            });
            formData.append('image_order', JSON.stringify(imageOrder));
            formData.append('deleted_images', JSON.stringify(deletedImages));

            if (process.env.NODE_ENV !== 'production') {
                for (const pair of formData.entries()) {
                    console.debug('FormData:', pair[0], pair[1]);
                }
            }

            if (editingProduct) {
                await vendorService.updateVendorProduct(editingProduct.id, formData);
                showToast('Product updated successfully');
            } else {
                await vendorService.createVendorProduct(formData);
                showToast('Product added successfully');
            }
            resetProductForm();
            closeProductModal();
            fetchProducts();
        } catch (error) {
            console.error('Error saving product:', error);
            if (error.response?.data && typeof error.response.data === 'object' && !Array.isArray(error.response.data)) {
                setFormErrors(error.response.data);
            }
            let errorMsg = 'Error saving product';
            if (error.response?.data) {
                if (typeof error.response.data === 'string') {
                    errorMsg = error.response.data;
                } else if (typeof error.response.data === 'object') {
                    errorMsg = Object.entries(error.response.data)
                        .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
                        .join(' | ');
                }
            }
            showToast(errorMsg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const selectedCategory = categories.find(c => c.id.toString() === productForm.category.toString());
    const filteredProducts = products.filter((product) => {
        const matchesSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.product_type?.toLowerCase().includes(searchTerm.toLowerCase());
        const status = product.is_active ? 'ACTIVE' : 'INACTIVE';
        const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    useEffect(() => {
        const pages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
        setTotalPages(pages);
        if (currentPage > pages) {
            setCurrentPage(pages);
        }
    }, [filteredProducts.length, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    const displayedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const columns = ['Product', 'Price', 'Visitors', 'Total Views', 'Favorites', 'Clicks', 'Cart Adds', 'Status', 'Actions'];
    const renderRow = (product) => (
        <>
            <td>
                <div className="vendor-info">
                    {(product.images?.length > 0 || product.image) && (
                        <div className="vendor-avatar">
                            <img src={getImageUrl(product.images?.[0] || product.image)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} alt="" />
                        </div>
                    )}
                    <span>{product.name}</span>
                </div>
            </td>
            <td>Rs. {product.price}</td>
            <td>
                {canAccessAnalytics ? (
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => fetchVisitorAnalyticsData(product.id, 1, 'Visitor Details')}
                        style={{ padding: '0.4rem 0.8rem' }}
                    >
                        {product.unique_visitors != null ? product.unique_visitors : '—'}
                    </button>
                ) : (
                    <span>{product.unique_visitors != null ? product.unique_visitors : '—'}</span>
                )}
            </td>
            <td>
                {canAccessAnalytics ? (
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => fetchVisitorAnalyticsData(product.id, 1, 'Total Views')}
                        style={{ padding: '0.4rem 0.8rem' }}
                    >
                        {product.total_views != null ? product.total_views : '—'}
                    </button>
                ) : (
                    <span>{product.total_views != null ? product.total_views : '—'}</span>
                )}
            </td>
             <td>
                {canAccessAnalytics ? (
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => fetchFavoriteAnalyticsData(product.id, 1, 'Favorite Details')}
                        style={{ padding: '0.4rem 0.8rem' }}
                    >
                        {getFavoriteCount(product)}
                    </button>
                ) : (
                    <span>{getFavoriteCount(product)}</span>
                )}
            </td>
            <td>
                {canAccessAnalytics ? (
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => fetchClickAnalyticsData(product.id, 1)}
                        style={{ padding: '0.4rem 0.8rem' }}
                    >
                        {product.purchase_click_count != null ? product.purchase_click_count : '—'}
                    </button>
                ) : (
                    <span>{product.purchase_click_count != null ? product.purchase_click_count : '—'}</span>
                )}
            </td>
            <td>
                {canAccessAnalytics ? (
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => fetchCartAnalyticsData(product.id, 1)}
                        style={{ padding: '0.4rem 0.8rem' }}
                    >
                        {product.cart_count != null ? product.cart_count : '—'}
                    </button>
                ) : (
                    <span>{product.cart_count != null ? product.cart_count : '—'}</span>
                )}
            </td>
            <td>
                <span className={`status-badge ${product.is_active ? 'status-active' : 'status-pending'}`}>
                    {product.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
            </td>
            <td>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                        className="action-btn"
                        onClick={() => handleViewProduct(product)}
                        title="View Details"
                    >
                        <Eye size={16} />
                    </button>
                    <button onClick={() => handleEditProduct(product)} className="action-btn" title="Edit">
                        <Edit size={16} />
                    </button>
                    <button onClick={async () => {
                        const ok = await prompt({ title: 'Delete Product', message: 'Are you sure you want to delete this product?', showInput: false });
                        if (!ok) return;
                        try {
                            await vendorService.deleteVendorProduct(product.id);
                            showToast('Product deleted successfully');
                            fetchProducts();
                        } catch (error) {
                            showToast('Failed to delete product', 'error');
                        }
                    }} className="action-btn" title="Delete" style={{ color: 'var(--danger)' }}>
                        <Trash2 size={16} />
                    </button>
                </div>
            </td>
        </>
    );

    return (
        <div className="view active">
            <div className="section-header" style={{ marginBottom: '2rem' }}>
                <div className="header-left">
                    <h3><Package size={20} /> My Products</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Manage your inventory</p>
                </div>
                <button
                    className="btn btn-primary page-action-btn"
                    onClick={() => setSearchParams({ modal: 'add' })}
                    title={!vendorHasCategories ? 'No categories assigned' : ''}
                >
                    <Plus size={18} /> Add Product
                </button>
            </div>

            <Modal
                isOpen={showAddProductModal || showEditProductModal}
                onClose={closeProductModal}
                title={editingProduct ? 'Edit Product' : 'Add Product'}
                maxWidth="920px"
            >
                {(!vendorHasCategories && !editingProduct) ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>No category has been assigned to your account. Please contact the administrator to enable product creation.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={closeProductModal}>Close</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="product-form-grid">
                            <div className="product-form-main">
                                <div className="product-form-section">
                                    <h4 className="product-form-section-title">Basic Details</h4>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Product Name</label>
                                            <input name="name" value={productForm.name} onChange={handleFormChange} required />
                                            {formErrors.name && <small className="error-text">{formErrors.name}</small>}
                                        </div>
                                        <div className="form-group">
                                            <label>Type / Brand</label>
                                            <input name="product_type" value={productForm.product_type} onChange={handleFormChange} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Category</label>
                                            <select name="category" value={productForm.category} onChange={handleFormChange} required>
                                                <option value="">Select Category</option>
                                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                            {formErrors.category && <small className="error-text">{formErrors.category}</small>}
                                        </div>
                                        {selectedCategory?.subcategories?.length > 0 && (
                                            <div className="form-group">
                                                <label>Subcategory</label>
                                                <select name="subcategory" value={productForm.subcategory} onChange={handleFormChange}>
                                                    <option value="">Select Subcategory</option>
                                                    {selectedCategory.subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                                {formErrors.subcategory && <small className="error-text">{formErrors.subcategory}</small>}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="product-form-section">
                                    <h4 className="product-form-section-title">Pricing</h4>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Price (Rs.)</label>
                                            <input type="number" name="price" min="0.01" step="0.01" value={productForm.price} onChange={handleFormChange} required />
                                            {formErrors.price && <small className="error-text">{formErrors.price}</small>}
                                        </div>
                                        <div className="form-group">
                                            <label>Original Price</label>
                                            <input type="number" name="original_price" min="0.01" step="0.01" value={productForm.original_price} onChange={handleFormChange} />
                                            {formErrors.original_price && <small className="error-text">{formErrors.original_price}</small>}
                                        </div>
                                    </div>
                                </div>

                                <div className="product-form-section">
                                    <h4 className="product-form-section-title">Description</h4>
                                    <div className="ckeditor-wrapper">
                                        <CKEditor
                                            editor={ClassicEditor}
                                            data={productForm.description}
                                            onChange={(event, editor) => {
                                                const data = editor.getData();
                                                setProductForm((prev) => ({ ...prev, description: data }));
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="product-form-side">
                                <div className="product-form-section">
                                    <h4 className="product-form-section-title">Media</h4>
                                    <ProductImageManager
                                        existingImages={existingImagesList}
                                        getImageUrl={getImageUrl}
                                        onImagesChange={({ newFiles, imageOrder, deletedImages }) => {
                                            setNewImageFiles(newFiles);
                                            setImageOrder(imageOrder);
                                            setDeletedImages(deletedImages);
                                        }}
                                    />
                                </div>

                                <div className="product-form-section">
                                    <h4 className="product-form-section-title">Settings</h4>
                                    <div className="form-group">
                                        <label>Purchase Link</label>
                                        <input name="purchase_link" type="url" value={productForm.purchase_link} onChange={handleFormChange} placeholder="https://..." />
                                        {formErrors.purchase_link && <small className="error-text">{formErrors.purchase_link}</small>}
                                    </div>
                                    <div className="dash-toggle-row">
                                        <div>
                                            <div className="dash-toggle-label">Active Product</div>
                                            <div className="dash-toggle-hint">Visible to customers when enabled</div>
                                        </div>
                                        <label className="dash-toggle">
                                            <input name="is_active" type="checkbox" checked={productForm.is_active} onChange={handleFormChange} />
                                            <span className="dash-toggle-track"><span className="dash-toggle-thumb" /></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="product-form-actions">
                            <button type="button" className="btn btn-secondary" onClick={closeProductModal}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Saving...' : (editingProduct ? 'Update Product' : 'Save Product')}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
            <div className="data-section" style={{ marginBottom: '1rem' }}>
                <div className="page-toolbar">
                    <div className="toolbar-controls">
                        <div className="search-box">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search products..."
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

            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={displayedProducts}
                    renderRow={renderRow}
                    keyExtractor={(p) => p.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={filteredProducts.length}
                    loading={loading}
                />
            </div>

            <AnalyticsDetailModal
                isOpen={showVisitorAnalyticsModal}
                onClose={() => setShowVisitorAnalyticsModal(false)}
                type="views"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                totalViews={analyticsModalTotalViews}
                eventLevel={analyticsModalTitle === 'Total Views'}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchVisitorAnalyticsData(analyticsModalProductId, p, analyticsModalTitle)}
            />

            <AnalyticsDetailModal
                isOpen={showFavoriteAnalyticsModal}
                onClose={() => setShowFavoriteAnalyticsModal(false)}
                type="favorites"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchFavoriteAnalyticsData(analyticsModalProductId, p)}
            />

            <AnalyticsDetailModal
                isOpen={showClickAnalyticsModal}
                onClose={() => setShowClickAnalyticsModal(false)}
                type="clicks"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchClickAnalyticsData(analyticsModalProductId, p)}
            />

            <AnalyticsDetailModal
                isOpen={showCartAnalyticsModal}
                onClose={() => setShowCartAnalyticsModal(false)}
                type="cart"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchCartAnalyticsData(analyticsModalProductId, p)}
            />
        </div>
    );
};

export default VendorProducts;
