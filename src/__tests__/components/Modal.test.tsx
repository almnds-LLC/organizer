import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../../components/ui/shared/Modal';

vi.mock('../../components/ui/shared/Modal.module.css', () => ({
  default: {
    overlay: 'overlay',
    sheetOverlay: 'sheetOverlay',
    sheet: 'sheet',
    sheetHandle: 'sheetHandle',
    sheetHandleBar: 'sheetHandleBar',
    modal: 'modal',
    header: 'header',
    closeBtn: 'closeBtn',
    body: 'body',
  },
}));

const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => mockIsMobile(),
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

describe('Modal mobile view', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(true);
  });

  afterEach(() => {
    mockIsMobile.mockReturnValue(false);
  });

  it('should render mobile sheet when isMobile is true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Mobile Modal">
        Mobile Content
      </Modal>
    );

    expect(screen.getByText('Mobile Modal')).toBeInTheDocument();
    expect(screen.getByText('Mobile Content')).toBeInTheDocument();
  });

  it('should call onClose when clicking overlay on mobile', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );

    const overlay = container.querySelector('.sheetOverlay');
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('should not call onClose when clicking sheet content on mobile', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );

    fireEvent.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should call onClose when close button is clicked on mobile', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('should apply custom className on mobile', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test" className="custom-sheet">
        Content
      </Modal>
    );

    const sheet = screen.getByText('Content').parentElement;
    expect(sheet?.className).toContain('custom-sheet');
  });

  it('should render sheet handle on mobile', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={() => {}} title="Test">
        Content
      </Modal>
    );

    expect(container.querySelector('.sheetHandle')).toBeInTheDocument();
    expect(container.querySelector('.sheetHandleBar')).toBeInTheDocument();
  });
});

describe('Modal without className', () => {
  it('should render without optional className', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test">
        Content
      </Modal>
    );

    const modalElement = screen.getByText('Content').parentElement;
    expect(modalElement).toBeInTheDocument();
  });
});

describe('Modal.Container without optional props', () => {
  it('should render without className', () => {
    render(
      <Modal.Container>
        <div>Content</div>
      </Modal.Container>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should render without onClick', () => {
    render(
      <Modal.Container>
        <div>Content</div>
      </Modal.Container>
    );
    fireEvent.click(screen.getByText('Content').parentElement!);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});

describe('Modal.Body without className', () => {
  it('should render without optional className', () => {
    render(<Modal.Body>Body Content</Modal.Body>);
    const body = screen.getByText('Body Content');
    expect(body.className).toContain('body');
  });
});
