import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const classNames = [
    styles.btn,
    styles[variant],
    size === 'sm' && styles.sm,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classNames} {...props}>
      {children}
    </button>
  );
}
