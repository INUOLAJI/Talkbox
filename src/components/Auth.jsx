import React, { useState, useEffect } from 'react';

const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
};

const Auth = ({ onAuthSuccess }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    phone_number: '',
    full_name: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegistering
      ? '/api/signup/'
      : '/api/login/';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      if (isRegistering) {
        alert('Registration successful! Please log in.');
        setIsRegistering(false);
      } else {
        onAuthSuccess(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ...styles.container, ...(isMobile ? styles.containerMobile : {}) }}>
      <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
        <div style={styles.brandHeader}>
          <div style={{ ...styles.logoCircle, ...(isMobile ? styles.logoCircleMobile : {}) }}>💬</div>
          <h2 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Talkbox</h2>
          <p style={styles.subtitle}>
            {isRegistering ? 'Create your chat account' : 'Sign in with your Email'}
          </p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {isRegistering && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Full Name</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="John Doe"
                style={{ ...styles.input, ...(isMobile ? styles.inputMobile : {}) }}
                required
              />
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="example@mail.com"
              style={{ ...styles.input, ...(isMobile ? styles.inputMobile : {}) }}
              required
            />
          </div>

          {isRegistering && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Phone Number</label>
              <input
                type="tel"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleChange}
                placeholder="+234..."
                style={{ ...styles.input, ...(isMobile ? styles.inputMobile : {}) }}
                required
              />
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              style={{ ...styles.input, ...(isMobile ? styles.inputMobile : {}) }}
              required
            />
          </div>

          <button
            type="submit"
            style={{ ...styles.submitBtn, ...(isMobile ? styles.submitBtnMobile : {}) }}
            disabled={loading}
          >
            {loading ? 'Processing...' : isRegistering ? 'Register' : 'Log In'}
          </button>
        </form>

        <div style={styles.toggleText}>
          {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span
            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            style={styles.toggleLink}
          >
            {isRegistering ? 'Log In' : 'Register here'}
          </span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f0f2f5',
    fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif',
    padding: '20px',
    boxSizing: 'border-box',
  },
  containerMobile: {
    alignItems: 'flex-start',
    paddingTop: '40px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
    padding: '40px 30px',
    boxSizing: 'border-box',
  },
  cardMobile: {
    padding: '28px 20px',
    borderRadius: '12px',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
  },
  brandHeader: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  logoCircle: {
    fontSize: '3em',
    marginBottom: '10px',
  },
  logoCircleMobile: {
    fontSize: '2.4em',
    marginBottom: '6px',
  },
  title: {
    color: '#008069',
    margin: '0 0 5px 0',
    fontSize: '1.6em',
    fontWeight: '600',
    letterSpacing: '0.5px',
  },
  titleMobile: {
    fontSize: '1.4em',
  },
  subtitle: {
    color: '#667781',
    margin: 0,
    fontSize: '0.95em',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.85em',
    color: '#008069',
    fontWeight: '600',
  },
  input: {
    padding: '12px',
    border: '1px solid #e1e9eb',
    borderRadius: '6px',
    fontSize: '100%',
    outline: 'none',
    backgroundColor: '#fafafa',
    transition: 'border 0.2s',
  },
  inputMobile: {
    padding: '14px 12px',
    fontSize: '16px', // prevents iOS Safari auto-zoom on focus
  },
  submitBtn: {
    backgroundColor: '#00a884',
    color: '#ffffff',
    border: 'none',
    padding: '14px',
    fontSize: '1em',
    fontWeight: '600',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background-color 0.2s',
  },
  submitBtnMobile: {
    padding: '15px',
  },
  errorBox: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    padding: '10px',
    borderRadius: '4px',
    fontSize: '0.9em',
    marginBottom: '20px',
    textAlign: 'center',
    borderLeft: '4px solid #c62828',
  },
  toggleText: {
    textAlign: 'center',
    marginTop: '25px',
    fontSize: '0.9em',
    color: '#667781',
  },
  toggleLink: {
    color: '#002f34',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline',
  }
};

export default Auth;