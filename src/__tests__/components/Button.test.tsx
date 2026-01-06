import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../../components/ui/shared/Button';

// Mock CSS modules
vi.mock('../../components/ui/shared/Button.module.css', () => ({
  default: {
    btn: 'btn',
    primary: 'primary',
    secondary: 'secondary',
    danger: 'danger',
    sm: 'sm',
  },
}));

describe('Button', () => {
  it('should render with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('should apply primary variant by default', () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('primary');
  });

  it('should apply secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('secondary');
  });

  it('should apply danger variant', () => {
    render(<Button variant="danger">Danger</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('danger');
  });

  it('should apply small size', () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('sm');
  });

  it('should merge custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
  });

  it('should handle click events', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Clickable</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should pass through other button props', () => {
    render(<Button type="submit" data-testid="submit-btn">Submit</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('data-testid', 'submit-btn');
  });
});
