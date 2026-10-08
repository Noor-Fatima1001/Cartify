import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldCheck, User, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import '../../styles/login.css'; // Make sure this matches the extracted css path

const Login = ({ loginMode: propLoginMode = 'vendor' }) => {
    const { login, isAuthenticated, user } = useAuth();
    const location = useLocation();
    const currentLoginMode = propLoginMode || (location.pathname === '/admin/admin-dbits' ? 'admin' : 'vendor');
    const isAdmin = currentLoginMode === 'admin';
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (isAuthenticated) {
        return <Navigate to={user?.role === 'VENDOR' ? '/admin/vendor-dashboard' : '/admin/dashboard'} replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await login(username, password, currentLoginMode);
            if (!result.success) {
                setError(result.error || 'Invalid credentials');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'An error occurred during login');
        } finally {
            setLoading(false);
        }
    };

    const headerTitle = isAdmin ? 'Admin Login' : 'Vendor Login';
    const headerSubtitle = isAdmin
        ? 'Access the admin portal to manage the platform, users, and settings.'
        : 'Sign in to manage your vendor dashboard, products, and orders.';

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="header">
                    <div className="logo">
                        <ShieldCheck style={{ width: '32px', height: '32px', color: 'white' }} />
                    </div>
                    <h1>{headerTitle}</h1>
                    <p>{headerSubtitle}</p>
                </div>

                {error && (
                    <div className="error-message" style={{ display: 'block' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <div className="input-with-icon">
                            <span className="input-icon"><User /></span>
                            <input
                                type="text"
                                placeholder="Username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <div className="input-with-icon">
                            <span className="input-icon"><Lock /></span>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                                title={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn-login" disabled={loading}>
                        {!loading && <span>Sign In</span>}
                        {loading && <div className="loader" style={{ display: 'block' }}></div>}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
