import { Check } from 'lucide-react';
import type { InventoryItem as InventoryItemType } from '../../../utils/inventoryHelpers';
import type { Category } from '../../../types/drawer';
import { getCategoryColor } from '../../../store/drawerStore';

interface InventoryItemProps {
  item: InventoryItemType;
  category: Category | null;
  onClick: (e: React.MouseEvent) => void;
  onCheckboxClick?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  showDrawerName?: boolean;
  showCategory?: boolean;
}

export function InventoryItem({
  item,
  category,
  onClick,
  onCheckboxClick,
  isSelected = false,
  showDrawerName = true,
  showCategory = true
}: InventoryItemProps) {
  const categoryColor = category ? getCategoryColor(category) : null;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%',
        padding: '0.75rem',
        background: isSelected ? '#eff6ff' : '#f9fafb',
        border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        textAlign: 'left',
        minHeight: 48, // Touch-friendly
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = '#f9fafb';
        }
      }}
    >
      {onCheckboxClick && (
        <div
          onClick={onCheckboxClick}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: isSelected ? 'none' : '2px solid #d1d5db',
            backgroundColor: isSelected ? '#3b82f6' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {isSelected && <Check size={12} color="white" strokeWidth={3} />}
        </div>
      )}

      <div
        style={{
          width: 8,
          height: 32,
          borderRadius: 4,
          backgroundColor: categoryColor || '#d1d5db',
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: '#111827',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.item.label}
        </div>
        <div
          style={{
            fontSize: '0.8125rem',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {showDrawerName && <span>{item.drawerName}</span>}
          {showDrawerName && <span style={{ color: '#d1d5db' }}>•</span>}
          <span>{item.location}</span>
          {showCategory && category && (
            <>
              <span style={{ color: '#d1d5db' }}>•</span>
              <span style={{ color: categoryColor || '#6b7280' }}>{category.name}</span>
            </>
          )}
        </div>
      </div>

      {item.item.quantity !== undefined && item.item.quantity > 1 && (
        <div
          style={{
            padding: '0.25rem 0.5rem',
            background: '#e5e7eb',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 500,
            color: '#374151',
            flexShrink: 0,
          }}
        >
          ×{item.item.quantity}
        </div>
      )}

      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
