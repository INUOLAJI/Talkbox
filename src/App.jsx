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
    // 1. Silently save the JWT access token in background storage
    localStorage.setItem('accessToken', authPayload.access);
    
    // 2. Save only the user's profile info to state
    onAuthSuccess(authPayload.user);
    
    // 3. Move to the dashboard
    navigate('/dashboard');
  };

  return <Auth onAuthSuccess={handleSuccess} />;
};

function App() {
  const [user, setUser] = useState(null);
  const timeoutRef = useRef(null);

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