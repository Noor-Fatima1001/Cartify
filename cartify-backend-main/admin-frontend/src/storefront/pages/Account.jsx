import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LocateFixed, MapPin, ShoppingBag, Store, Check } from 'lucide-react';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontToast } from '../context/StorefrontToastContext';
import { authService } from '../../services/authService';
import { getCurrentPosition, reverseGeocodeAddress } from '../services/locationService';

const flattenErrors = (errors) => {
    if (!errors) return [];
    const messages = [];
    Object.values(errors).forEach((value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            messages.push(...Object.values(value));
        } else {
            messages.push(value);
        }
    });
    return messages;
};

const Account = () => {
    const { user, convertToCustomer, registerVendor, login, isAuthenticated, updateUserProfile } = useStorefrontAuth();
    const { showToast } = useStorefrontToast();
    const navigate = useNavigate();

    const [tab, setTab] = useState('register');
    const [accountType, setAccountType] = useState('CUSTOMER');
    const [loading, setLoading] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [profileForm, setProfileForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        username: '',
        mobile_number: '',
        profile_image: null,
    });
    const [profileErrors, setProfileErrors] = useState({});

    const [registerForm, setRegisterForm] = useState({
        username: '', email: '', firstName: '', lastName: '', password: '', confirmPassword: '',
    });
    const [loginForm, setLoginForm] = useState({ usernameOrEmail: '', password: '' });

    const [vendorForm, setVendorForm] = useState({ brandName: '', phoneNumber: '', address: '' });
    const [vendorLogo, setVendorLogo] = useState(null);
    const [location, setLocation] = useState(null);
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState('');

    useEffect(() => {
        if (!isAuthenticated || !user) return;
        setProfileForm((prev) => ({
            ...prev,
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            email: user?.email || '',
            username: user?.username || '',
            mobile_number: user?.mobile_number || '',
        }));
    }, [isAuthenticated, user]);

    if (isAuthenticated) {
        const handleProfileChange = (field) => (e) => {
            const value = e.target.value;
            setProfileForm((prev) => ({ ...prev, [field]: value }));
            setProfileErrors((prev) => ({ ...prev, [field]: '' }));
        };

        const handleProfileImage = (e) => {
            const file = e.target.files?.[0] || null;
            setProfileForm((prev) => ({ ...prev, profile_image: file }));
            setProfileErrors((prev) => ({ ...prev, profile_image: '' }));
        };

        const handleSaveProfile = async (e) => {
            e.preventDefault();
            setSavingProfile(true);
            setSuccess('');
            setError('');
            setProfileErrors({});

            try {
                const payload = new FormData();
                Object.entries(profileForm).forEach(([key, value]) => {
                    if (value === null || value === undefined || value === '') return;
                    if (key === 'profile_image' && value instanceof File) {
                        payload.append('profile_image', value);
                    } else {
                        payload.append(key, value);
                    }
                });

                const data = await authService.updateProfile(payload);
                const updatedUser = data?.user || data;
                if (updatedUser) {
                    updateUserProfile(updatedUser);
                    showToast(data?.message || 'Profile updated');
                    setSuccess(data?.message || 'Profile updated');
                    setProfileForm((prev) => ({ ...prev, first_name: updatedUser.first_name || '', last_name: updatedUser.last_name || '', email: updatedUser.email || '', username: updatedUser.username || '', mobile_number: updatedUser.mobile_number || '' }));
                }
            } catch (err) {
                const serverMessage = err?.response?.data?.error || err?.response?.data?.message || 'Could not update profile';
                const fieldErrors = err?.response?.data?.errors || {};
                setProfileErrors(fieldErrors);
                setError(serverMessage);
            } finally {
                setSavingProfile(false);
            }
        };

        const handleCancelProfile = () => {
            setProfileForm((prev) => ({
                ...prev,
                first_name: user?.first_name || '',
                last_name: user?.last_name || '',
                email: user?.email || '',
                username: user?.username || '',
                mobile_number: user?.mobile_number || '',
                profile_image: null,
            }));
            setProfileErrors({});
            setError('');
            setSuccess('');
        };

        return (
            <div className="sf-page">
                <div className="sf-container" style={{ maxWidth: 560 }}>
                    <div className="sf-section-title" style={{ marginBottom: 16 }}>My Account</div>
                    <div style={{ background: 'var(--sf-surface)', borderRadius: 'var(--sf-radius-md)', padding: 20, boxShadow: 'var(--sf-shadow)' }}>
                        <div style={{ marginBottom: 6 }}><strong>Username:</strong> {user?.username || '—'}</div>
                        <div style={{ marginBottom: 6 }}><strong>Role:</strong> {user?.role || '—'}</div>
                        <div style={{ marginBottom: 18 }}><strong>Email:</strong> {user?.email || '—'}</div>
                        <form onSubmit={handleSaveProfile}>
                            {error && <div className="sf-form-error" style={{ marginBottom: 12 }}>{error}</div>}
                            {success && <div className="sf-form-success" style={{ marginBottom: 12 }}>{success}</div>}
                            <div className="sf-field">
                                <label htmlFor="profile-username">Username</label>
                                <input id="profile-username" value={profileForm.username} onChange={handleProfileChange('username')} />
                                {profileErrors.username && <div className="sf-field-error">{profileErrors.username}</div>}
                            </div>
                            <div className="sf-field">
                                <label htmlFor="profile-first-name">First name</label>
                                <input id="profile-first-name" value={profileForm.first_name} onChange={handleProfileChange('first_name')} />
                                {profileErrors.first_name && <div className="sf-field-error">{profileErrors.first_name}</div>}
                            </div>
                            <div className="sf-field">
                                <label htmlFor="profile-last-name">Last name</label>
                                <input id="profile-last-name" value={profileForm.last_name} onChange={handleProfileChange('last_name')} />
                                {profileErrors.last_name && <div className="sf-field-error">{profileErrors.last_name}</div>}
                            </div>
                            <div className="sf-field">
                                <label htmlFor="profile-email">Email</label>
                                <input id="profile-email" type="email" value={profileForm.email} onChange={handleProfileChange('email')} />
                                {profileErrors.email && <div className="sf-field-error">{profileErrors.email}</div>}
                            </div>
                            <div className="sf-field">
                                <label htmlFor="profile-phone">Phone number</label>
                                <input id="profile-phone" value={profileForm.mobile_number} onChange={handleProfileChange('mobile_number')} />
                                {profileErrors.mobile_number && <div className="sf-field-error">{profileErrors.mobile_number}</div>}
                            </div>
                            <div className="sf-field">
                                <label htmlFor="profile-image">Profile image</label>
                                <input id="profile-image" type="file" accept="image/*" onChange={handleProfileImage} />
                                {profileErrors.profile_image && <div className="sf-field-error">{profileErrors.profile_image}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                                <button type="submit" className="sf-btn sf-btn-primary" disabled={savingProfile}>
                                    {savingProfile ? 'Saving...' : 'Save changes'}
                                </button>
                                <button type="button" className="sf-btn sf-btn-ghost" onClick={handleCancelProfile}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    const handleRegisterField = (field) => (e) => setRegisterForm((f) => ({ ...f, [field]: e.target.value }));
    const handleLoginField = (field) => (e) => setLoginForm((f) => ({ ...f, [field]: e.target.value }));
    const handleVendorField = (field) => (e) => setVendorForm((f) => ({ ...f, [field]: e.target.value }));

    const handleDetectLocation = async () => {
        setLocating(true);
        setLocationError('');
        try {
            const { latitude, longitude } = await getCurrentPosition();
            const detected = await reverseGeocodeAddress(latitude, longitude);
            if (!detected.city || !detected.country) {
                setLocationError('Could not determine your city/country from that location. Please try again.');
                return;
            }
            setLocation({ ...detected, latitude, longitude });
        } catch {
            setLocationError('We could not access your location. Please allow location access in your browser and try again — it is required to register as a vendor.');
        } finally {
            setLocating(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        if (registerForm.password !== registerForm.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            await convertToCustomer({
                username: registerForm.username,
                email: registerForm.email,
                firstName: registerForm.firstName,
                lastName: registerForm.lastName,
                password: registerForm.password,
            });
            showToast('Account created — your favourites and cart came with you!');
            navigate('/');
        } catch (err) {
            const errors = err.response?.data?.errors;
            setError(errors ? Object.values(errors).join(' ') : err.response?.data?.error || 'Could not create account.');
        } finally {
            setLoading(false);
        }
    };

    const handleVendorRegister = async (e) => {
        e.preventDefault();
        setError('');

        if (!location) {
            setError('Please share your location before creating a vendor account.');
            return;
        }
        if (registerForm.password !== registerForm.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (!vendorLogo) {
            setError('A brand logo is required.');
            return;
        }

        setLoading(true);
        try {
            const payload = new FormData();
            payload.append('role', 'VENDOR');
            payload.append('username', registerForm.username);
            payload.append('email', registerForm.email);
            payload.append('first_name', registerForm.firstName);
            payload.append('last_name', registerForm.lastName);
            payload.append('password', registerForm.password);
            payload.append('brand_name', vendorForm.brandName);
            payload.append('phone_number', vendorForm.phoneNumber);
            payload.append('address', vendorForm.address);
            payload.append('logo', vendorLogo);
            payload.append('country', location.country);
            payload.append('state', location.state || '');
            payload.append('city', location.city);
            payload.append('latitude', location.latitude);
            payload.append('longitude', location.longitude);

            await registerVendor(payload);
            showToast('Vendor account created — pending admin approval before you can list products.');
            navigate('/');
        } catch (err) {
            const messages = flattenErrors(err.response?.data?.errors);
            setError(messages.length ? messages.join(' ') : err.response?.data?.error || 'Could not create vendor account.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(loginForm.usernameOrEmail, loginForm.password);
            showToast('Welcome back!');
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="sf-page">
            <div className="sf-container" style={{ maxWidth: 480 }}>
                <div className="sf-section-title" style={{ marginBottom: 6 }}>Your Account</div>
                <div className="sf-section-sub" style={{ marginBottom: 20 }}>
                    Create an account to save your favourites and cart permanently.
                </div>

                <div className="sf-filter-bar" style={{ marginBottom: tab === 'register' ? 10 : 20 }}>
                    <button className={`sf-chip ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>Create account</button>
                    <button className={`sf-chip ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>Log in</button>
                </div>

                {tab === 'register' && (
                    <>
                        <div className="sf-type-label">Select account type</div>
                        <div className="sf-type-select">
                            <button
                                type="button"
                                className={`sf-type-card ${accountType === 'CUSTOMER' ? 'active' : ''}`}
                                onClick={() => { setAccountType('CUSTOMER'); setError(''); }}
                            >
                                <span className="sf-type-card-check"><Check size={13} /></span>
                                <span className="sf-type-card-icon"><ShoppingBag size={18} /></span>
                                <span className="sf-type-card-title">Customer</span>
                                <span className="sf-type-card-desc">Shop products from vendors near you.</span>
                            </button>
                            <button
                                type="button"
                                className={`sf-type-card ${accountType === 'VENDOR' ? 'active' : ''}`}
                                onClick={() => { setAccountType('VENDOR'); setError(''); }}
                            >
                                <span className="sf-type-card-check"><Check size={13} /></span>
                                <span className="sf-type-card-icon"><Store size={18} /></span>
                                <span className="sf-type-card-title">Vendor</span>
                                <span className="sf-type-card-desc">Sell your products to shoppers near you.</span>
                            </button>
                        </div>
                    </>
                )}

                {error && <div className="sf-form-error" style={{ marginBottom: 14 }}>{error}</div>}

                {tab === 'register' && accountType === 'CUSTOMER' && (
                    <form onSubmit={handleRegister}>
                        <div className="sf-field">
                            <label htmlFor="sf-reg-username">Username</label>
                            <input id="sf-reg-username" value={registerForm.username} onChange={handleRegisterField('username')} required />
                        </div>
                        <div className="sf-field">
                            <label htmlFor="sf-reg-email">Email</label>
                            <input id="sf-reg-email" type="email" value={registerForm.email} onChange={handleRegisterField('email')} required />
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div className="sf-field" style={{ flex: 1 }}>
                                <label htmlFor="sf-reg-first-name">First name</label>
                                <input id="sf-reg-first-name" value={registerForm.firstName} onChange={handleRegisterField('firstName')} required />
                            </div>
                            <div className="sf-field" style={{ flex: 1 }}>
                                <label htmlFor="sf-reg-last-name">Last name</label>
                                <input id="sf-reg-last-name" value={registerForm.lastName} onChange={handleRegisterField('lastName')} required />
                            </div>
                        </div>
                        <div className="sf-field">
                            <label htmlFor="sf-reg-password">Password</label>
                            <input id="sf-reg-password" type="password" value={registerForm.password} onChange={handleRegisterField('password')} required minLength={8} />
                        </div>
                        <div className="sf-field">
                            <label htmlFor="sf-reg-confirm-password">Confirm password</label>
                            <input id="sf-reg-confirm-password" type="password" value={registerForm.confirmPassword} onChange={handleRegisterField('confirmPassword')} required minLength={8} />
                        </div>
                        <button type="submit" className="sf-btn sf-btn-primary sf-btn-block" disabled={loading}>
                            {loading ? 'Creating account...' : 'Create account'}
                        </button>
                    </form>
                )}

                {tab === 'register' && accountType === 'VENDOR' && (
                    <>
                        <div style={{ background: 'var(--sf-surface)', borderRadius: 'var(--sf-radius-md)', padding: 20, boxShadow: 'var(--sf-shadow)', marginBottom: 20 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>Step 1 · Confirm your business location</div>
                            <div className="sf-section-sub" style={{ marginBottom: 14 }}>
                                We use this to match your shop to nearby shoppers. Location access is required to register as a vendor.
                            </div>

                            {location ? (
                                <>
                                    <div className="sf-form-success" style={{ marginBottom: 10 }}>
                                        <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                        Detected: {[location.city, location.state, location.country].filter(Boolean).join(', ')}
                                    </div>
                                    <button type="button" className="sf-btn sf-btn-ghost" onClick={handleDetectLocation} disabled={locating}>
                                        {locating ? 'Detecting...' : 'Re-detect location'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    {locationError && <div className="sf-form-error" style={{ marginBottom: 10 }}>{locationError}</div>}
                                    <button type="button" className="sf-btn sf-btn-dark" onClick={handleDetectLocation} disabled={locating}>
                                        <LocateFixed size={16} />
                                        {locating ? 'Detecting your location...' : 'Share my location'}
                                    </button>
                                </>
                            )}
                        </div>

                        <fieldset disabled={!location} style={{ border: 'none', padding: 0, margin: 0, opacity: location ? 1 : 0.5 }}>
                            <div style={{ fontWeight: 600, marginBottom: 14 }}>Step 2 · Your details</div>
                            <form onSubmit={handleVendorRegister}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div className="sf-field" style={{ flex: 1 }}>
                                        <label htmlFor="sf-vendor-first-name">First name</label>
                                        <input id="sf-vendor-first-name" value={registerForm.firstName} onChange={handleRegisterField('firstName')} required />
                                    </div>
                                    <div className="sf-field" style={{ flex: 1 }}>
                                        <label htmlFor="sf-vendor-last-name">Last name</label>
                                        <input id="sf-vendor-last-name" value={registerForm.lastName} onChange={handleRegisterField('lastName')} required />
                                    </div>
                                </div>
                                <div className="sf-field">
                                    <label htmlFor="sf-vendor-username">Username</label>
                                    <input id="sf-vendor-username" value={registerForm.username} onChange={handleRegisterField('username')} required />
                                </div>
                                <div className="sf-field">
                                    <label htmlFor="sf-vendor-email">Email</label>
                                    <input id="sf-vendor-email" type="email" value={registerForm.email} onChange={handleRegisterField('email')} required />
                                </div>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div className="sf-field" style={{ flex: 1 }}>
                                        <label htmlFor="sf-vendor-password">Password</label>
                                        <input id="sf-vendor-password" type="password" value={registerForm.password} onChange={handleRegisterField('password')} required minLength={8} />
                                    </div>
                                    <div className="sf-field" style={{ flex: 1 }}>
                                        <label htmlFor="sf-vendor-confirm-password">Confirm password</label>
                                        <input id="sf-vendor-confirm-password" type="password" value={registerForm.confirmPassword} onChange={handleRegisterField('confirmPassword')} required minLength={8} />
                                    </div>
                                </div>

                                <div style={{ fontWeight: 600, margin: '20px 0 14px' }}>Business details</div>
                                <div className="sf-field">
                                    <label htmlFor="sf-vendor-brand-name">Brand / shop name</label>
                                    <input id="sf-vendor-brand-name" value={vendorForm.brandName} onChange={handleVendorField('brandName')} required />
                                </div>
                                <div className="sf-field">
                                    <label htmlFor="sf-vendor-phone">Business phone number</label>
                                    <input id="sf-vendor-phone" value={vendorForm.phoneNumber} onChange={handleVendorField('phoneNumber')} required />
                                </div>
                                <div className="sf-field">
                                    <label htmlFor="sf-vendor-address">Business address</label>
                                    <input id="sf-vendor-address" value={vendorForm.address} onChange={handleVendorField('address')} required />
                                </div>
                                <div className="sf-field">
                                    <label htmlFor="sf-vendor-logo">Brand logo</label>
                                    <input id="sf-vendor-logo" type="file" accept="image/*" onChange={(e) => setVendorLogo(e.target.files?.[0] || null)} required />
                                </div>

                                <button type="submit" className="sf-btn sf-btn-primary sf-btn-block" disabled={!location || loading}>
                                    {loading ? 'Creating vendor account...' : 'Create vendor account'}
                                </button>
                            </form>
                        </fieldset>
                    </>
                )}

                {tab === 'login' && (
                    <form onSubmit={handleLogin}>
                        <div className="sf-field">
                            <label htmlFor="sf-login-username">Username or email</label>
                            <input id="sf-login-username" value={loginForm.usernameOrEmail} onChange={handleLoginField('usernameOrEmail')} required />
                        </div>
                        <div className="sf-field">
                            <label htmlFor="sf-login-password">Password</label>
                            <input id="sf-login-password" type="password" value={loginForm.password} onChange={handleLoginField('password')} required />
                        </div>
                        <button type="submit" className="sf-btn sf-btn-primary sf-btn-block" disabled={loading}>
                            {loading ? 'Logging in...' : 'Log in'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Account;
