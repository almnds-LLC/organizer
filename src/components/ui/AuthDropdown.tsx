import { useState, useRef, useEffect, useCallback } from 'react';
import Turnstile from 'react-turnstile';
import { useAuthStore } from '../../store/authStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import styles from './AuthDropdown.module.css';

type AuthMode = 'login' | 'register';

export function AuthDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { login, register, isLoading } = useAuthStore();
  const isMobile = useIsMobile();

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setUsername('');
    setPassword('');
    setError(null);
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isMobile, closeDropdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!turnstileToken) {
      setError('Please complete the verification');
      return;
    }

    try {
      if (mode === 'login') {
        await login(username, password, turnstileToken);
      } else {
        await register(username, password, turnstileToken);
      }
      closeDropdown();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setTurnstileToken(null);
      // Force Turnstile to reset so user can re-verify
      setTurnstileKey((k) => k + 1);
    }
  };

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const formContent = (
    <form onSubmit={handleSubmit}>
      <div className={styles.authTabs}>
        <button
          type="button"
          className={`${styles.authTab} ${mode === 'login' ? styles.active : ''}`}
          onClick={() => {
            setMode('login');
            setError(null);
          }}
        >
          Login
        </button>
        <button
          type="button"
          className={`${styles.authTab} ${mode === 'register' ? styles.active : ''}`}
          onClick={() => {
            setMode('register');
            setError(null);
          }}
        >
          Register
        </button>
      </div>

      <div className={styles.authFormContent}>
        <div className={styles.formGroup}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={mode === 'register' ? 3 : undefined}
            autoComplete="username"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
          {mode === 'register' && (
            <span className={styles.formHint}>At least 8 characters</span>
          )}
        </div>


          <Turnstile
            key={turnstileKey}
            sitekey={siteKey}
            onVerify={(token: string) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
            className={styles.turnstileContainer}
            // appearance="interaction-only"
            size="flexible"
            theme="light"
          />

        {error && <p className={styles.authError}>{error}</p>}

        <button
          type="submit"
          className={styles.authSubmit}
          disabled={isLoading || !turnstileToken}
        >
          {isLoading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </div>
    </form>
  );

  return (
    <div className={styles.authDropdown} ref={dropdownRef}>
      <button
        className={styles.authTrigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Sign In</span>
      </button>

      {/* Desktop dropdown */}
      {isOpen && !isMobile && (
        <div className={styles.authDropdownMenu}>
          {formContent}
        </div>
      )}

      {/* Mobile modal */}
      {isOpen && isMobile && (
        <div className={styles.authModalOverlay} onClick={closeDropdown}>
          <div className={styles.authModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.authModalHeader}>
              <h2>{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
              <button
                className={styles.authModalClose}
                onClick={closeDropdown}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {formContent}
          </div>
        </div>
      )}
    </div>
  );
}
