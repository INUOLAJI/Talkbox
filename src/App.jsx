import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

// Route guard component to check if a user session exists
const ProtectedRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Wrapper to cleanly pass the navigation hook and save the background token
const AuthWrapper = ({ onAuthSuccess }) => {
  const navigate = useNavigate();
  
  const handleSuccess = (authPayload) => {
    localStorage.setItem('accessToken', authPayload.access || authPayload.token || '');
    onAuthSuccess(authPayload.user);
    navigate('/dashboard');
  };

  return <Auth onAuthSuccess={handleSuccess} />;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function App() {
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const timeoutRef = useRef(null);

  // Rehydrate user from stored token on hard refresh
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setBootstrapping(false); return; }

    const timeout = setTimeout(() => setBootstrapping(false), 5000); // fallback

    fetch(`${API_BASE}/api/chat/profile/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUser(data); })
      .catch(() => {})
      .finally(() => { clearTimeout(timeout); setBootstrapping(false); });
  }, []);

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('accessToken');
    alert('You have been logged out due to 5 hours of inactivity.');
  };

  // 🕒 5-Hour Rolling Inactivity Tracker
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_TIME = 5 * 60 * 60 * 1000; // 5 Hours in milliseconds

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(handleLogout, INACTIVITY_TIME);
    };

    // Listen silently to regular interactions
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);

    // Start timer immediately upon landing on dashboard
    resetTimer();

    // Cleanup event hooks on logout or unmount
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
    };
  }, [user]);

  if (bootstrapping) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f0f2f5', gap: '12px' }}>
      <div style={{ fontSize: '2.5rem' }}>💬</div>
      <div style={{ color: '#00a884', fontWeight: 600, fontSize: '1.1rem', fontFamily: 'Segoe UI, sans-serif' }}>Talkbox</div>
      <div style={{ width: '32px', height: '32px', border: '3px solid #e1e9eb', borderTop: '3px solid #00a884', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <Router>
      <Routes>
        {/* Public Login/Signup Route */}
        <Route path="/" element={<AuthWrapper onAuthSuccess={setUser} />} />

        {/* Guarded Dashboard Route */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute user={user}>
              <Dashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        {/* Fallback Catch-All */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;