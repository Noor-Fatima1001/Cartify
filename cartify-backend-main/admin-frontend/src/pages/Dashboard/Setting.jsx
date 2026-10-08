import React, { useEffect, useState } from 'react';
import { Globe, MessageSquare, Coins, Settings as SettingsIcon } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { campaignService } from '../../services/campaignService';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonText, SkeletonButton } from '../../components/common/Skeleton';

export default function Setting() {
    const { showToast } = useToast();
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';
    const [loading, setLoading] = useState(true);

    const [platformName, setPlatformName] = useState('');
    const [popup, setPopup] = useState({ enabled: true, popup_delay_days: 60, message: '', cta_text: '' });
    const [savingSys, setSavingSys] = useState(false);
    const [savingPop, setSavingPop] = useState(false);
    const [pricing, setPricing] = useState({ cost_per_view: '', cost_per_favorite: '', cost_per_cart_add: '', cost_per_link_click: '' });
    const [savingPricing, setSavingPricing] = useState(false);

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const [sysRes, popRes] = await Promise.all([
                    api.get('/auth/admin/system-settings/'),
                    api.get('/auth/admin/popup-settings/')
                ]);
                if (sysRes?.data) setPlatformName(sysRes.data.platform_name || '');
                if (popRes?.data) setPopup((p) => ({ ...p, ...popRes.data }));
                if (isAdmin) {
                    try {
                        const pricingRes = await campaignService.adminGetPricing();
                        if (pricingRes?.pricing) setPricing(pricingRes.pricing);
                    } catch (err) {
                        console.error('Load pricing error', err);
                    }
                }
            } catch (err) {
                console.error('Load settings error', err);
                showToast('Failed to load settings', 'error');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const submitPricing = async (e) => {
        e.preventDefault();
        setSavingPricing(true);
        try {
            const res = await campaignService.adminUpdatePricing({
                cost_per_view: pricing.cost_per_view,
                cost_per_favorite: pricing.cost_per_favorite,
                cost_per_cart_add: pricing.cost_per_cart_add,
                cost_per_link_click: pricing.cost_per_link_click,
            });
            showToast('Campaign pricing saved');
            if (res?.pricing) setPricing(res.pricing);
        } catch (err) {
            showToast(err.response?.data?.error || 'Failed to save campaign pricing', 'error');
        } finally { setSavingPricing(false); }
    };

    const submitSystem = async (e) => {
        e.preventDefault();
        setSavingSys(true);
        try {
            const res = await api.post('/auth/admin/system-settings/save/', { platform_name: platformName });
            showToast('Platform settings saved');
            if (res.data?.settings?.platform_name) setPlatformName(res.data.settings.platform_name);
        } catch (err) {
            console.error('Save system error', err);
            showToast('Failed to save platform settings', 'error');
        } finally { setSavingSys(false); }
    };

    const submitPopup = async (e) => {
        e.preventDefault();
        setSavingPop(true);
        try {
            const payload = {
                enabled: popup.enabled,
                popup_delay_days: Number(popup.popup_delay_days || 0),
                message: popup.message,
                cta_text: popup.cta_text
            };
            const res = await api.post('/auth/admin/popup-settings/save/', payload);
            showToast('Popup settings saved');
            if (res.data?.settings) setPopup((p) => ({ ...p, ...res.data.settings }));
        } catch (err) {
            console.error('Save popup error', err);
            showToast('Failed to save popup settings', 'error');
        } finally { setSavingPop(false); }
    };

    if (loading) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="page-header">
                    <div className="header-left">
                        <SkeletonText width="150px" height="20px" />
                        <SkeletonText width="340px" height="13px" style={{ marginBottom: 0 }} />
                    </div>
                </div>
                <div className="dash-settings-grid">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div className="dash-section" key={i}>
                            <div className="dash-section-header">
                                <SkeletonText width="45%" height="16px" style={{ marginBottom: 0 }} />
                            </div>
                            <div style={{ padding: '1.35rem 1.5rem' }}>
                                <SkeletonText width="90%" />
                                <SkeletonText width="70%" />
                                <SkeletonButton />
                            </div>
                        </div>
                    ))}
                </div>
                <PageLoaderOverlay label="Loading settings…" />
            </div>
        );
    }

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><SettingsIcon size={20} /> Settings</h3>
                    <p>Configure platform-wide behaviour, engagement popups, and pricing rules.</p>
                </div>
            </div>

            <div className="dash-settings-grid">
                <div className="dash-section">
                    <div className="dash-section-header">
                        <h3><Globe size={16} style={{ marginRight: '0.5rem', verticalAlign: '-3px', color: 'var(--dash-accent)' }} />Platform &amp; Global</h3>
                    </div>
                    <form onSubmit={submitSystem} style={{ padding: '1.35rem 1.5rem' }}>
                        <div className="form-group">
                            <label>Platform Name</label>
                            <input type="text" name="platform_name" value={platformName} onChange={(e) => setPlatformName(e.target.value)} />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={savingSys}>
                            {savingSys ? 'Saving...' : 'Save Platform Settings'}
                        </button>
                    </form>
                </div>

                <div className="dash-section">
                    <div className="dash-section-header">
                        <h3><MessageSquare size={16} style={{ marginRight: '0.5rem', verticalAlign: '-3px', color: 'var(--dash-accent)' }} />Popup &amp; Engagement</h3>
                    </div>
                    <form onSubmit={submitPopup} style={{ padding: '1.35rem 1.5rem' }}>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Status</label>
                                <select name="enabled" value={popup.enabled ? 'true' : 'false'} onChange={(e) => setPopup((p) => ({ ...p, enabled: e.target.value === 'true' }))}>
                                    <option value="true">Enabled</option>
                                    <option value="false">Disabled</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Delay (Days)</label>
                                <input type="number" name="popup_delay_days" value={popup.popup_delay_days} onChange={(e) => setPopup((p) => ({ ...p, popup_delay_days: Number(e.target.value) }))} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Message Content</label>
                            <textarea name="message" rows="3" placeholder="Enter popup message..." value={popup.message} onChange={(e) => setPopup((p) => ({ ...p, message: e.target.value }))}></textarea>
                        </div>
                        <div className="form-group">
                            <label>CTA Button Text</label>
                            <input type="text" name="cta_text" value={popup.cta_text} onChange={(e) => setPopup((p) => ({ ...p, cta_text: e.target.value }))} />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={savingPop}>
                            {savingPop ? 'Saving...' : 'Save Popup Logic'}
                        </button>
                    </form>
                </div>

                {isAdmin && (
                    <div className="dash-section">
                        <div className="dash-section-header">
                            <h3><Coins size={16} style={{ marginRight: '0.5rem', verticalAlign: '-3px', color: 'var(--dash-accent)' }} />Campaign Pricing (credits per action)</h3>
                        </div>
                        <form onSubmit={submitPricing} style={{ padding: '1.35rem 1.5rem' }}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Cost per View</label>
                                    <input type="number" min="0" step="0.0001" value={pricing.cost_per_view}
                                        onChange={(e) => setPricing((p) => ({ ...p, cost_per_view: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label>Cost per Favorite</label>
                                    <input type="number" min="0" step="0.0001" value={pricing.cost_per_favorite}
                                        onChange={(e) => setPricing((p) => ({ ...p, cost_per_favorite: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Cost per Cart Add</label>
                                    <input type="number" min="0" step="0.0001" value={pricing.cost_per_cart_add}
                                        onChange={(e) => setPricing((p) => ({ ...p, cost_per_cart_add: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label>Cost per Link Click</label>
                                    <input type="number" min="0" step="0.0001" value={pricing.cost_per_link_click}
                                        onChange={(e) => setPricing((p) => ({ ...p, cost_per_link_click: e.target.value }))} />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={savingPricing}>
                                {savingPricing ? 'Saving...' : 'Save Campaign Pricing'}
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
