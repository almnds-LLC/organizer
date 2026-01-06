import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'xs' | 'sm' | 'md';
}

export function Switch({ checked, onChange, disabled = false, label, size = 'md' }: SwitchProps) {
  return (
    <label className={`${styles.switch} ${styles[size]} ${disabled ? styles.disabled : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={styles.input}
      />
      <span className={styles.slider} />
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
