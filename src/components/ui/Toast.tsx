import { useState, useCallback } from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type Toast as ToastType } from '../../store/toastStore';
import styles from './Toast.module.css';

function ToastIcon({ type }: { type: ToastType['type'] }) {
  switch (type) {
    case 'error':
      return <AlertCircle size={18} />;
    case 'success':
      return <CheckCircle size={18} />;
    case 'warning':
      return <AlertTriangle size={18} />;
    case 'info':
    default:
      return <Info size={18} />;
  }
}

function ToastItem({ toast }: { toast: ToastType }) {
  const [isExiting, setIsExiting] = useState(false);
  const removeToast = useToastStore((s) => s.removeToast);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 200); // Match animation duration
  }, [toast.id, removeToast]);

  const handleAction = useCallback(() => {
    toast.action?.onClick();
    handleDismiss();
  }, [toast.action, handleDismiss]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.type]} ${isExiting ? styles.exiting : ''}`}
      role="alert"
    >
      <div className={styles.toastIcon}>
        <ToastIcon type={toast.type} />
      </div>

      <div className={styles.toastContent}>
        {toast.title && <div className={styles.toastTitle}>{toast.title}</div>}
        <div className={styles.toastMessage}>{toast.message}</div>
      </div>

      <div className={styles.toastActions}>
        {toast.action && (
          <button className={styles.toastBtn} onClick={handleAction}>
            {toast.action.label}
          </button>
        )}
        <button
          className={`${styles.toastBtn} ${styles.dismissBtn}`}
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={styles.toastContainer} aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
