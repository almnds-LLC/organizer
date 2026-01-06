import { useDrawerStore } from '../../../store/drawerStore';
import { useIsMobile } from '../../../hooks/useMediaQuery';
import { BottomSheet } from './BottomSheet';
import { InventoryView } from './InventoryView';
import { EditView } from './EditView';
import { PanelLeft, PanelLeftClose } from 'lucide-react';
import './UnifiedPanel.css';

export function UnifiedPanel() {
  const isMobile = useIsMobile();
  const panelMode = useDrawerStore((s) => s.panelMode);
  const isPanelVisible = useDrawerStore((s) => s.isPanelVisible);
  const togglePanel = useDrawerStore((s) => s.togglePanel);

  const content = (
    <div className="panel-content">
      <div className={`panel-view ${panelMode === 'inventory' ? 'active' : ''}`}>
        <InventoryView />
      </div>
      <div className={`panel-view ${panelMode === 'edit' ? 'active' : ''}`}>
        <EditView />
      </div>
    </div>
  );

  if (isMobile) {
    return <BottomSheet>{content}</BottomSheet>;
  }

  return (
    <aside className={`unified-panel-desktop ${isPanelVisible ? 'visible' : ''}`}>
      {/* Toggle button - inside panel, positioned outside via negative left */}
      <button
        className="panel-toggle-btn"
        onClick={togglePanel}
        title={isPanelVisible ? 'Hide panel' : 'Show panel'}
      >
        {isPanelVisible ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
      </button>
      <div className="panel-inner">
        {content}
      </div>
    </aside>
  );
}
