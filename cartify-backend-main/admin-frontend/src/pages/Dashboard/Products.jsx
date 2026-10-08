import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import StatusBadge from '../../components/common/StatusBadge';
import { productService } from '../../services/productService';
import { vendorService } from '../../services/vendorService';
import { analyticsService } from '../../services/analyticsService';
import { useToast } from '../../context/ToastContext';
import { Package, Search, Eye, Edit2, Trash2 } from 'lucide-react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import Pagination from '../../components/common/Pagination';
import { usePrompt } from '../../components/common/CustomPrompt';
import ProductImageManager from '../../components/common/ProductImageManager';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';
import { getImageUrl as resolveImageUrl } from '../../utils/image';

const PAGE_SIZE = 10;

// ProductImageManager renders live previews of newly-selected files via blob:
// URLs before they're uploaded. The shared resolver only understands http(s)
// and backend-relative paths, so keep that one exception here instead of
// re-implementing the whole backend-URL resolution it already covers.
const getImageUrl = (imagePath) => (imagePath && imagePath.startsWith('blob:') ? imagePath : resolveImageUrl(imagePath));

const Products = () => {
    const { prompt } = usePrompt();
    const { showToast } = useToast();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [products, setProducts] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [vendors, setVendors] = useState([]);
    const [categories, setCategories] = useState([]);
    const [subcategories, setSubcategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [vendorFilter, setVendorFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [formErrors, setFormErrors] = useState({});
    const [productForm, setProductForm] = useState({
        vendor_id: '',
        name: '',
        product_type: '',
        description: '',
        price: '',
        original_price: '',
        discount: '',
        category: '',
        subcategory: '',
        images: [],
        is_active: true,
        purchase_link: '',
        is_premium: false,
    });
    const [imagePreviews, setImagePreviews] = useState([]);
    const [editingProduct, setEditingProduct] = useState(null);

    // Analytics modal states
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

    const resetProductForm = () => {
        setProductForm({
            vendor_id: '',
            name: '',
            product_type: '',
            description: '',
            price: '',
            original_price: '',
            discount: '',
            category: '',
            subcategory: '',
            images: [],
            is_active: true,
            purchase_link: '',
            is_premium: false,
        });
        setImagePreviews([]);
        setFormErrors({});
        setEditingProduct(null);
        setExistingImagesList([]);
        setDeletedImages([]);
        setNewImageFiles([]);
        setImageOrder([]);
    };

    const handleViewProduct = (product) => {
        navigate(`/admin/dashboard/products/${product.id}`);
    };

    useEffect(() => {
        return () => {
            imagePreviews.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [imagePreviews]);

    const fetchAnalyticsDetails = async (type, productId, page = 1, title) => {
        try {
            setAnalyticsLoading(true);
            setAnalyticsModalTitle(title);
            const params = {
                product_id: productId,
                limit: ANALYTICS_PAGE_SIZE,
                page,
            };
            const isVendor = user?.role === 'vendor' || user?.role === 'VENDOR';
            let res;

            switch (type) {
                case 'views':
                    // "Total Views" shows individual view events (own timestamp
                    // each); "Visitor Details" shows one row per visitor summed up.
                    if (title === 'Total Views') params.granularity = 'event';
                    res = isVendor
                        ? await analyticsService.getVendorDetailedViews(params)
                        : await analyticsService.getAdminDetailedViews(params);
                    break;
                case 'favorites':
                    res = isVendor
                        ? await analyticsService.getVendorDetailedFavorites(params)
                        : await analyticsService.getAdminDetailedFavorites(params);
                    break;
                case 'clicks':
                    res = isVendor
                        ? await analyticsService.getVendorDetailedClicks(params)
                        : await analyticsService.getAdminDetailedClicks(params);
                    break;
                case 'cart':
                    res = isVendor
                        ? await analyticsService.getVendorDetailedCart(params)
                        : await analyticsService.getAdminDetailedCart(params);
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
            showToast(`Failed to load ${type} analytics`, 'error');
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
        await fetchAnalyticsDetails('cart', productId, page, 'Cart Details');
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
            price: product.price ?? '',
            original_price: product.original_price ?? '',
            discount: product.discount ?? '',
            category: category?.id || '',
            subcategory: subcategory?.id || '',
            images: [],
            is_active: product.is_active,
            purchase_link: product.purchase_link || '',
            is_premium: product.is_premium || false,
        });

        setSubcategories(category?.subcategories || []);
        setImagePreviews([]);

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

    const fetchProducts = async (page = currentPage) => {
        try {
            setLoading(true);
            const params = {
                page,
                limit: PAGE_SIZE,
                search: searchTerm || undefined,
                status: statusFilter || undefined,
                vendor_id: vendorFilter !== 'ALL' ? vendorFilter : undefined
            };
            const res = await productService.getProducts(params);
            // Expecting backend to return structure with results and pagination keys
            const items = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
            setProducts(items);
            setTotalPages(res.total_pages || Math.max(1, Math.ceil((res.total_items || items.length) / PAGE_SIZE)));
            setTotalItems(res.total_items ?? items.length);
            setCurrentPage(res.current_page || page);
        } catch (error) {
            console.error('Error fetching products:', error);
            showToast('Failed to fetch products', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchVendors = async () => {
        try {
            const data = await vendorService.getVendors({ limit: 1000 });
            const list = Array.isArray(data) ? data : (data.results || []);
            setVendors(list);
        } catch (error) {
            console.error('Error fetching vendors:', error);
            showToast('Failed to load vendors', 'error');
        }
    };

    const fetchCategories = async () => {
        try {
            const data = await productService.getCategories();
            setCategories(data);
        } catch (error) {
            console.error('Error fetching categories:', error);
            showToast('Failed to load categories', 'error');
        }
    };

    useEffect(() => {
        fetchProducts();
        fetchVendors();
        fetchCategories();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Refetch when page, search or status change
    useEffect(() => {
        fetchProducts(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, searchTerm, statusFilter, vendorFilter]);

    // Reset to first page when filters/search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, vendorFilter]);

    const handleFormChange = (event) => {
        const { name, value, type, checked, files } = event.target;

        if (name === 'images') {
            const imageFiles = files ? Array.from(files) : [];
            setProductForm((prev) => ({ ...prev, images: imageFiles }));
            setImagePreviews(imageFiles.map((file) => URL.createObjectURL(file)));
            return;
        }

        const fieldValue = type === 'checkbox' ? checked : value;

        setProductForm((prev) => {
            const updated = { ...prev, [name]: fieldValue };

            // Automatic Discount/Price calculation
            const p = parseFloat(updated.price);
            const op = parseFloat(updated.original_price);
            const d = parseFloat(updated.discount);

            if (name === 'price' || name === 'original_price') {
                if (!isNaN(p) && !isNaN(op) && op > 0) {
                    updated.discount = Math.round(((op - p) / op) * 100);
                } else if (isNaN(p) && !isNaN(op) && !isNaN(d)) {
                    updated.price = (op * (1 - d / 100)).toFixed(2);
                }
            } else if (name === 'discount') {
                if (!isNaN(d) && !isNaN(op) && op > 0) {
                    updated.price = (op * (1 - d / 100)).toFixed(2);
                }
            }

            return updated;
        });

        setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormErrors({});
        setSubmitting(true);

        const requiredFields = ['vendor_id', 'name', 'product_type', 'description', 'price', 'category'];
        const errors = {};

        requiredFields.forEach((field) => {
            if (!productForm[field]?.toString().trim()) {
                errors[field] = 'This field is required';
            }
        });

        const selectedCategory = categories.find((item) => item.id.toString() === productForm.category.toString());
        if (selectedCategory?.subcategories?.length > 0 && !productForm.subcategory) {
            errors.subcategory = 'Please select a subcategory for this category';
        }

        if (productForm.price && parseFloat(productForm.price) <= 0) {
            errors.price = 'Price must be greater than 0';
        }
        if (productForm.original_price && parseFloat(productForm.original_price) <= 0) {
            errors.original_price = 'Original price must be greater than 0';
        }
        if (productForm.original_price && parseFloat(productForm.price) > parseFloat(productForm.original_price)) {
            errors.price = 'Price cannot be greater than original price';
        }
        if (productForm.discount && (parseFloat(productForm.discount) < 0 || parseFloat(productForm.discount) > 100)) {
            errors.discount = 'Discount must be between 0 and 100';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setSubmitting(false);
            return;
        }

        try {
            const formData = new FormData();
            Object.entries(productForm).forEach(([key, value]) => {
                if (value === null || value === undefined) return;
                if (key === 'images') return;
                if (key === 'is_active') {
                    formData.append(key, value ? 'true' : 'false');
                    return;
                }
                if (value !== '') {
                    formData.append(key, value);
                }
            });

            newImageFiles.forEach((file) => {
                formData.append('images', file);
            });
            formData.append('image_order', JSON.stringify(imageOrder));
            formData.append('deleted_images', JSON.stringify(deletedImages));

            if (editingProduct) {
                await productService.updateProduct(editingProduct.id, formData);
                showToast('Product updated successfully');
            } else {
                await productService.createProduct(formData);
                showToast('Product added successfully');
            }

            resetProductForm();
            closeProductModal();
            fetchProducts();
        } catch (error) {
            console.error('Product save error:', error);
            const serverErrors = error.response?.data || {};
            setFormErrors(serverErrors);
            showToast(serverErrors.error || 'Failed to save product', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteProduct = async (productId) => {
        const confirmed = await prompt({
            title: 'Delete Product',
            message: 'Are you sure you want to delete this product?',
            showInput: false
        });
        if (!confirmed) return;
        try {
            await productService.deleteProduct(productId);
            showToast('Product deleted successfully');
            fetchProducts();
        } catch (error) {
            console.error('Product delete error:', error);
            showToast('Unable to delete product', 'error');
        }
    };

    const selectedCategory = categories.find((item) => item.id.toString() === productForm.category.toString());
    const subcategorie = selectedCategory?.subcategories || [];
    // With server-side pagination, `products` already contains current page items
    const displayedProducts = products;
    const getFavoriteCount = (item) => (
        item?.favorites ?? item?.favorites_count ?? item?.favorite_count ?? item?.favoritesCount ?? '—'
    );

    const columns = ['Image', 'Name', 'Vendor', 'Price', 'Visitors', 'Total Views', 'Favorites', 'Clicks', 'Cart Adds', 'Status', 'Actions'];
    const renderRow = (product) => (
        <>
            <td>
                {(product.images?.length > 0 || product.image) ? (
                    <div className="vendor-avatar">
                        <img
                            src={getImageUrl(product.images?.[0] || product.image)}
                            alt={product.name || 'Product image'}
                        />
                    </div>
                ) : (
                    <div className="vendor-avatar" style={{ fontSize: '0.65rem' }}>N/A</div>
                )}
            </td>
            <td>{product.name}</td>
            <td>{product.vendor_name || product.vendor}</td>
            <td>Rs. {product.price}</td>
            <td>
                <button
                    type="button"
                    className="status-badge analytics-badge"
                    onClick={() => fetchVisitorAnalyticsData(product.id, 1, 'Visitor Details')}
                >
                    {product.unique_visitors != null ? product.unique_visitors : '—'}
                </button>
            </td>
            <td>
                <button
                    type="button"
                    className="status-badge analytics-badge"
                    onClick={() => fetchVisitorAnalyticsData(product.id, 1, 'Total Views')}
                >
                    {product.total_views != null ? product.total_views : '—'}
                </button>
            </td>
            <td>
                <button
                    type="button"
                    className="status-badge analytics-badge"
                    onClick={() => fetchFavoriteAnalyticsData(product.id, 1)}
                >
                    {getFavoriteCount(product)}
                </button>
            </td>
            <td>
                <button
                    type="button"
                    className="status-badge analytics-badge"
                    onClick={() => fetchClickAnalyticsData(product.id, 1)}
                >
                    {product.purchase_click_count != null ? product.purchase_click_count : '—'}
                </button>
            </td>
            <td>
                <button
                    type="button"
                    className="status-badge analytics-badge"
                    onClick={() => fetchCartAnalyticsData(product.id, 1)}
                >
                    {product.cart_count != null ? product.cart_count : '—'}
                </button>
            </td>
            <td>
                <StatusBadge
                    status={product.is_active ? 'ACTIVE' : 'CANCELLED'}
                    label={product.is_active ? 'ACTIVE' : 'INACTIVE'}
                />
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
                    <button
                        className="action-btn"
                        onClick={() => handleEditProduct(product)}
                        title="Edit Product"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        className="action-btn"
                        onClick={() => handleDeleteProduct(product.id)}
                        title="Delete Product"
                        style={{ color: 'var(--dash-danger)' }}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </td>
        </>
    );



    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Package size={20} /> Products</h3>
                    <p>Monitor and manage your product listings, update details, and ensure everything looks perfect for your customers.</p>
                </div>
                <button className="btn btn-primary page-action-btn" onClick={() => setSearchParams({ modal: 'add' })}>
                    Add Product
                </button>
            </div>

            <div className="data-section" style={{ marginBottom: '1rem' }}>
                <div className="section-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
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
                        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="filter-select">
                            <option value="ALL">All Vendors</option>
                            {[...vendors]
                                .sort((a, b) => (a.brand_name || a.username || '').localeCompare(b.brand_name || b.username || ''))
                                .map((vendor) => (
                                    <option key={vendor.id} value={vendor.id}>
                                        {vendor.brand_name || vendor.username}
                                    </option>
                                ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={displayedProducts}
                    renderRow={renderRow}
                    keyExtractor={(product) => product.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={totalItems}
                    loading={loading}
                />
            </div>

            <Modal
                isOpen={showAddProductModal || showEditProductModal}
                onClose={closeProductModal}
                title={editingProduct ? 'Edit Product' : 'Add Product'}
                maxWidth="920px"
            >
                <form onSubmit={handleSubmit}>
                    <div className="product-form-grid">
                        <div className="product-form-main">
                            <div className="product-form-section">
                                <h4 className="product-form-section-title">Basic Details</h4>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Vendor</label>
                                        <select
                                            name="vendor_id"
                                            value={productForm.vendor_id}
                                            onChange={handleFormChange}
                                        >
                                            <option value="">Select vendor</option>
                                            {vendors.map((vendor) => (
                                                <option key={vendor.id} value={vendor.id}>
                                                    {vendor.brand_name || vendor.username}
                                                </option>
                                            ))}
                                        </select>
                                        {formErrors.vendor_id && <small className="error-text">{formErrors.vendor_id}</small>}
                                    </div>
                                    <div className="form-group">
                                        <label>Name</label>
                                        <input name="name" value={productForm.name} onChange={handleFormChange} />
                                        {formErrors.name && <small className="error-text">{formErrors.name}</small>}
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Product Type</label>
                                        <input name="product_type" value={productForm.product_type} onChange={handleFormChange} />
                                        {formErrors.product_type && <small className="error-text">{formErrors.product_type}</small>}
                                    </div>
                                    <div className="form-group">
                                        <label>Category</label>
                                        <select
                                            name="category"
                                            value={productForm.category}
                                            onChange={handleFormChange}
                                        >
                                            <option value="">Select category</option>
                                            {categories.map((category) => (
                                                <option key={category.id} value={category.id}>
                                                    {category.name}
                                                </option>
                                            ))}
                                        </select>
                                        {formErrors.category && <small className="error-text">{formErrors.category}</small>}
                                    </div>
                                </div>
                                {subcategorie.length > 0 && (
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Subcategory</label>
                                            <select
                                                name="subcategory"
                                                value={productForm.subcategory}
                                                onChange={handleFormChange}
                                            >
                                                <option value="">Select subcategory</option>
                                                {subcategorie.map((sub) => (
                                                    <option key={sub.id} value={sub.id}>
                                                        {sub.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {formErrors.subcategory && <small className="error-text">{formErrors.subcategory}</small>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="product-form-section">
                                <h4 className="product-form-section-title">Pricing</h4>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Price</label>
                                        <input name="price" type="number" min="0.01" step="0.01" value={productForm.price} onChange={handleFormChange} />
                                        {formErrors.price && <small className="error-text">{formErrors.price}</small>}
                                    </div>
                                    <div className="form-group">
                                        <label>Original Price</label>
                                        <input name="original_price" type="number" min="0.01" step="0.01" value={productForm.original_price} onChange={handleFormChange} />
                                        {formErrors.original_price && <small className="error-text">{formErrors.original_price}</small>}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Discount (%)</label>
                                    <input name="discount" type="number" min="0" max="100" step="0.01" value={productForm.discount} onChange={handleFormChange} />
                                    {formErrors.discount && <small className="error-text">{formErrors.discount}</small>}
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
                                {formErrors.description && <small className="error-text">{formErrors.description}</small>}
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
                                <div className="dash-toggle-row">
                                    <div>
                                        <div className="dash-toggle-label">Premium Product</div>
                                        <div className="dash-toggle-hint">Sponsors this listing across the marketplace</div>
                                    </div>
                                    <label className="dash-toggle">
                                        <input name="is_premium" type="checkbox" checked={productForm.is_premium} onChange={handleFormChange} />
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
            </Modal>


            {/* Visitor Analytics Modal */}
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
                onPageChange={(p) => fetchCartAnalyticsData(analyticsModalProductId, p)}
            />
        </div>
    );
};

export default Products;
