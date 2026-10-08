import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell } from 'lucide-react';
import { billingService } from '../../services/billingService';

const POLL_MS = 60000;

const NotificationBell = () => {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const containerRef = useRef(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const data = await billingService.getNotifications({ limit: 10 });
            setNotifications(data.results || []);
            setUnreadCount(data.unread_count || 0);
        } catch (e) {
            // silent — the bell must never break the layout
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        const timer = setInterval(fetchNotifications, POLL_MS);
        return () => clearInterval(timer);
    }, [fetchNotifications]);

    useEffect(() => {
        const onClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const toggleOpen = async () => {
        const next = !open;
        setOpen(next);
        if (next && unreadCount > 0) {
            try {
                await billingService.markNotificationsRead({ all: true });
                setUnreadCount(0);
            } catch (e) { /* ignore */ }
        }
    };

    return (
        <div ref={containerRef} className="dash-notif">
            <button type="button" onClick={toggleOpen} title="Notifications" className="action-btn">
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="dash-notif-count">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="dash-notif-panel">
                    <div className="dash-notif-panel-head">Notifications</div>
                    <div className="dash-notif-panel-body">
                        {notifications.length === 0 ? (
                            <div className="dash-empty" style={{ padding: '1.2rem' }}>
                                No notifications yet
                            </div>
                        ) : notifications.map((n) => (
                            <div key={n.id} className={`dash-notif-item${n.is_read ? '' : ' unread'}`}>
                                <div className="dash-notif-item-title">{n.title}</div>
                                <div className="dash-notif-item-message">
                                    {n.message.length > 140 ? `${n.message.slice(0, 140)}…` : n.message}
                                </div>
                                <div className="dash-notif-item-time">
                                    {new Date(n.created_at).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
