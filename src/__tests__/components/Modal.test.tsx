import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../../components/ui/shared/Modal';

vi.mock('../../components/ui/shared/Modal.module.css', () => ({
  default: {
    overlay: 'overlay',
    modal: 'modal',
    header: 'header',
    closeBtn: 'closeBtn',
    body: 'body',
  },
}));

describe('Modal', () => {
  it('should not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test">
        Content
      </Modal>
    );
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        Modal Content
      </Modal>
    );
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('should call onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );

    fireEvent.click(screen.getByText('Content').parentElement!.parentElement!);
    expect(onClose).toHaveBeenCalled();
  });

  it('should not call onClose when modal content is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );

    fireEvent.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('should apply custom className', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test" className="custom-modal">
        Content
      </Modal>
    );

    const modalElement = screen.getByText('Content').parentElement;
    expect(modalElement?.className).toContain('custom-modal');
  });
});

describe('Modal.Overlay', () => {
  it('should render children and call onClose on click', () => {
    const onClose = vi.fn();
    render(
      <Modal.Overlay onClose={onClose}>
        <div>Overlay Content</div>
      </Modal.Overlay>
    );

    expect(screen.getByText('Overlay Content')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Overlay Content').parentElement!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Modal.Container', () => {
  it('should render children with className', () => {
    render(
      <Modal.Container className="test-container">
        <div>Container Content</div>
      </Modal.Container>
    );

    expect(screen.getByText('Container Content')).toBeInTheDocument();
    const container = screen.getByText('Container Content').parentElement;
    expect(container?.className).toContain('test-container');
  });

  it('should call onClick handler', () => {
    const onClick = vi.fn();
    render(
      <Modal.Container onClick={onClick}>
        <div>Click Me</div>
      </Modal.Container>
    );

    fireEvent.click(screen.getByText('Click Me').parentElement!);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Modal.Header', () => {
  it('should render title and close button', () => {
    const onClose = vi.fn();
    render(<Modal.Header title="Header Title" onClose={onClose} />);

    expect(screen.getByText('Header Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<Modal.Header title="Test" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Modal.Body', () => {
  it('should render children', () => {
    render(<Modal.Body>Body Content</Modal.Body>);
    expect(screen.getByText('Body Content')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<Modal.Body className="custom-body">Content</Modal.Body>);
    const body = screen.getByText('Content');
    expect(body.className).toContain('custom-body');
  });
});
