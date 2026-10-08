import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { vendorService } from '../../services/vendorService';
import { useToast } from '../../context/ToastContext';
import { Store, Mail, Phone, MapPin, Upload, Loader2, Save, Undo2 } from 'lucide-react';

const getImageUrl = (imagePath) => {
    if (!imagePath) return '';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('blob:')) {
        return imagePath;
    }
    const backendUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : 'https://cartifyapi.dbitsdemo.com/api';
    return `${backendUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};

const VendorProfile = () => {
    const { user, updateUser } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const [profileData, setProfileData] = useState({
        brand_name: user?.brand_name || '',
        email: user?.email || '',
        phone_number: user?.phone_number || '',
        address: user?.address || '',
        logo: null
    });

    const [logoPreview, setLogoPreview] = useState(user?.logo ? getImageUrl(user.logo) : null);
    const [hasChanges, setHasChanges] = useState(false);

    // Track user prop changes
    useEffect(() => {
        if (user) {
            setProfileData({
                brand_name: user.brand_name || '',
                email: user.email || '',
                phone_number: user.phone_number || '',
                address: user.address || '',
                logo: null
            });
            setLogoPreview(user.logo ? getImageUrl(user.logo) : null);
            setHasChanges(false);
        }
    }, [user]);

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        setHasChanges(true);
        if (name === 'logo') {
            const file = files[0];
            if (file) {
                setProfileData(prev => ({ ...prev, logo: file }));
                setLogoPreview(URL.createObjectURL(file));
            }
        } else {
            setProfileData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDiscard = () => {
        if (user) {
            setProfileData({
                brand_name: user.brand_name || '',
                email: user.email || '',
                phone_number: user.phone_number || '',
                address: user.address || '',
                logo: null
            });
            setLogoPreview(user.logo ? getImageUrl(user.logo) : null);
            setHasChanges(false);
            showToast('Changes discarded', 'info');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const formData = new FormData();
            Object.entries(profileData).forEach(([key, value]) => {
                if (key === 'logo' && !value) return;
                formData.append(key, value);
            });

            const response = await vendorService.updateProfile(formData);

            // Sync context state
            updateUser({
                brand_name: response.brand_name,
                logo: response.logo,
                phone_number: response.phone_number,
                address: response.address
            });

            setHasChanges(false);
            showToast('Profile updated successfully!', 'success');
        } catch (error) {
            console.error('Update profile error:', error);
            showToast('Failed to update profile', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3>Store Profile</h3>
                    <p>Customize your business identity and store presentation</p>
                </div>
            </div>

            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

                    {/* Immersive store presentation card */}
                    <div className="dash-profile-hero">
                        <div className="dash-profile-hero-banner">
                            <div>
                                <div className="dash-profile-hero-name">{profileData.brand_name || 'Your Store Brand'}</div>
                                <div className="dash-profile-hero-email">{profileData.email || 'Configure business contact email'}</div>
                            </div>
                        </div>

                        <div className="dash-profile-hero-body">
                            <div className="dash-profile-avatar">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Store Logo" />
                                ) : (
                                    <div className="dash-profile-avatar-placeholder">
                                        <Store size={44} />
                                    </div>
                                )}

                                <label className="dash-profile-avatar-overlay">
                                    <Upload size={20} />
                                    <span>Change Logo</span>
                                    <input
                                        type="file"
                                        name="logo"
                                        onChange={handleChange}
                                        accept="image/*"
                                    />
                                </label>
                            </div>

                            <div className="dash-profile-meta">
                                <h5>Brand Logo</h5>
                                <p>Recommend PNG/JPG with square aspect ratio up to 2MB</p>
                            </div>
                        </div>
                    </div>

                    {/* Information inputs card */}
                    <div className="dash-profile-card">
                        <div className="dash-profile-card-title">
                            <Store size={18} />
                            Business Settings
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Brand Name</label>
                                <div className="dash-field-icon-row">
                                    <div className="dash-field-icon"><Store size={18} /></div>
                                    <input
                                        name="brand_name"
                                        value={profileData.brand_name}
                                        onChange={handleChange}
                                        placeholder="Liberty Foods Co."
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Business Email</label>
                                <div className="dash-field-icon-row">
                                    <div className="dash-field-icon"><Mail size={18} /></div>
                                    <input
                                        type="email"
                                        name="email"
                                        value={profileData.email}
                                        onChange={handleChange}
                                        placeholder="contact@libertyfood.com"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Phone Number</label>
                            <div className="dash-field-icon-row">
                                <div className="dash-field-icon"><Phone size={18} /></div>
                                <input
                                    name="phone_number"
                                    value={profileData.phone_number}
                                    onChange={handleChange}
                                    placeholder="+92 300 1234567"
                                />
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Business Address</label>
                            <div className="dash-field-icon-row align-top">
                                <div className="dash-field-icon"><MapPin size={18} /></div>
                                <textarea
                                    name="address"
                                    value={profileData.address}
                                    onChange={handleChange}
                                    rows="3"
                                    placeholder="Suite 404, Liberty Commercial Plaza, Lahore, Pakistan"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        {hasChanges && (
                            <button type="button" className="btn btn-secondary" onClick={handleDiscard}>
                                <Undo2 size={16} />
                                Discard
                            </button>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} />
                                    <span>Saving Settings...</span>
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    <span>Save Profile Settings</span>
                                </>
                            )}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default VendorProfile;
