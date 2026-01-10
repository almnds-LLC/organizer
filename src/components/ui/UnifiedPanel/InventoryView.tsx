import { useMemo, useCallback } from 'react';
import { Search, X, CheckSquare, Square } from 'lucide-react';
import { useDrawerStore, getCategoryColor } from '../../../store/drawerStore';
import {
  aggregateInventory,
  groupByCategory,
  groupByDrawer,
  type InventoryItem as InventoryItemType,
} from '../../../utils/inventoryHelpers';
import { InventoryItem } from './InventoryItem';

export function InventoryView() {
  const drawers = useDrawerStore((s) => s.drawers);
  const drawerOrder = useDrawerStore((s) => s.drawerOrder);
  const categories = useDrawerStore((s) => s.categories);
  const inventoryGrouping = useDrawerStore((s) => s.inventoryGrouping);
  const setInventoryGrouping = useDrawerStore((s) => s.setInventoryGrouping);
  const navigateToItem = useDrawerStore((s) => s.navigateToItem);
  const searchQuery = useDrawerStore((s) => s.searchQuery);
  const setSearchQuery = useDrawerStore((s) => s.setSearchQuery);
  const searchMatchIds = useDrawerStore((s) => s.searchMatchIds);
  const selectedInventoryIds = useDrawerStore((s) => s.selectedInventoryIds);
  const toggleInventorySelection = useDrawerStore((s) => s.toggleInventorySelection);
  const clearInventorySelection = useDrawerStore((s) => s.clearInventorySelection);
  const selectAllInventory = useDrawerStore((s) => s.selectAllInventory);

  const allItems = useMemo(
    () => aggregateInventory(drawers, drawerOrder),
    [drawers, drawerOrder]
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery) {
      return allItems;
    }
    return allItems.filter((item) =>
      searchMatchIds.has(`${item.compartmentId}:${item.subCompartmentId}`)
    );
  }, [allItems, searchQuery, searchMatchIds]);

  const categoryGroups = useMemo(() => {
    if (inventoryGrouping === 'category') {
      return groupByCategory(filteredItems, categories);
    }
    return null;
  }, [filteredItems, inventoryGrouping, categories]);

  const drawerGroups = useMemo(() => {
    if (inventoryGrouping === 'drawer') {
      return groupByDrawer(filteredItems, drawers, drawerOrder);
    }
    return null;
  }, [filteredItems, inventoryGrouping, drawers, drawerOrder]);

  const getSelectionKey = (item: InventoryItemType) => {
    return `${item.drawerId}:${item.compartmentId}:${item.subCompartmentId}`;
  };

  const selectedCount = useMemo(() => {
    return filteredItems.filter((item) => selectedInventoryIds.has(getSelectionKey(item))).length;
  }, [filteredItems, selectedInventoryIds]);

  const isAllSelected = selectedCount > 0 && selectedCount === filteredItems.length;
  const isSomeSelected = selectedCount > 0 && selectedCount < filteredItems.length;

  const handleItemClick = (item: InventoryItemType, e: React.MouseEvent) => {
    // Shift+click or if in selection mode, toggle selection
    if (e.shiftKey || selectedInventoryIds.size > 0) {
      toggleInventorySelection(item.drawerId, item.compartmentId, item.subCompartmentId);
    } else {
      navigateToItem(item.drawerId, item.compartmentId);
    }
  };

  const handleSelectAll = useCallback(() => {
    // If all are selected, clear selection; otherwise select all filtered items
    if (isAllSelected) {
      clearInventorySelection();
    } else {
      // Select all filtered items
      selectAllInventory(
        filteredItems.map((item) => ({
          drawerId: item.drawerId,
          compartmentId: item.compartmentId,
          subCompartmentId: item.subCompartmentId,
        }))
      );
    }
  }, [isAllSelected, filteredItems, clearInventorySelection, selectAllInventory]);

  const handleCheckboxClick = (item: InventoryItemType, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleInventorySelection(item.drawerId, item.compartmentId, item.subCompartmentId);
  };

  return (
    <div style={{ padding: '0 1rem 1rem' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          marginBottom: '1rem',
          position: 'sticky',
          top: 0,
          background: 'white',
          padding: '0.5rem 0',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
            Inventory
            <span
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 400,
                color: '#6b7280',
              }}
            >
              {searchQuery && filteredItems.length !== allItems.length
                ? `(${filteredItems.length} of ${allItems.length})`
                : `(${allItems.length} ${allItems.length === 1 ? 'item' : 'items'})`}
            </span>
          </h2>

          {filteredItems.length > 0 && (
            <button
              onClick={handleSelectAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.375rem 0.625rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: selectedCount > 0 ? '#3b82f6' : '#6b7280',
                background: 'transparent',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#3b82f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = selectedCount > 0 ? '#3b82f6' : '#6b7280';
              }}
            >
              {isAllSelected ? (
                <>
                  <CheckSquare size={14} />
                  Clear
                </>
              ) : isSomeSelected ? (
                <>
                  <CheckSquare size={14} style={{ opacity: 0.5 }} />
                  Select All
                </>
              ) : (
                <>
                  <Square size={14} />
                  Select All
                </>
              )}
            </button>
          )}
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.75rem',
              color: searchQuery ? (searchMatchIds.size > 0 ? '#10b981' : '#ef4444') : '#9ca3af',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 2rem 0.5rem 2.25rem',
              border: '1px solid',
              borderColor: searchQuery ? (searchMatchIds.size > 0 ? '#10b981' : '#ef4444') : '#d1d5db',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border-color 0.15s ease',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                padding: 0,
                background: '#e5e7eb',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                color: '#6b7280',
              }}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.25rem',
            background: '#f3f4f6',
            borderRadius: '0.5rem',
            padding: '0.25rem',
          }}
        >
          {(['category', 'drawer', 'flat'] as const).map((grouping) => (
            <button
              key={grouping}
              onClick={() => setInventoryGrouping(grouping)}
              style={{
                flex: 1,
                padding: '0.5rem 0.625rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: inventoryGrouping === grouping ? 'white' : 'transparent',
                color: inventoryGrouping === grouping ? '#111827' : '#6b7280',
                boxShadow: inventoryGrouping === grouping ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {grouping === 'category' ? 'Category' : grouping === 'drawer' ? 'Drawer' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {allItems.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: '#6b7280',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: '0 auto 1rem', opacity: 0.5 }}
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <p style={{ margin: 0, fontSize: '0.9375rem' }}>No items yet</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', opacity: 0.7 }}>
            Click a compartment to add items
          </p>
        </div>
      )}

      {allItems.length > 0 && searchQuery && filteredItems.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem 1rem',
            color: '#6b7280',
          }}
        >
          <Search size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: '0.9375rem' }}>No matches found</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', opacity: 0.7 }}>
            Try a different search term
          </p>
        </div>
      )}

      {inventoryGrouping === 'category' && categoryGroups && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {Array.from(categoryGroups.entries()).map(([categoryId, { category, items }]) => (
            <div key={categoryId ?? 'uncategorized'}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    backgroundColor: category ? getCategoryColor(category) : '#d1d5db',
                  }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                  {category?.name ?? 'Uncategorized'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  ({items.length})
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map((item) => (
                  <InventoryItem
                    key={item.id}
                    item={item}
                    category={category}
                    onClick={(e) => handleItemClick(item, e)}
                    onCheckboxClick={(e) => handleCheckboxClick(item, e)}
                    isSelected={selectedInventoryIds.has(getSelectionKey(item))}
                    showDrawerName={true}
                    showCategory={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {inventoryGrouping === 'drawer' && drawerGroups && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {Array.from(drawerGroups.entries()).map(([drawerId, { drawer, items }]) => (
            <div key={drawerId}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                  {drawer.name}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  ({items.length})
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map((item) => (
                  <InventoryItem
                    key={item.id}
                    item={item}
                    category={item.categoryId ? categories[item.categoryId] : null}
                    onClick={(e) => handleItemClick(item, e)}
                    onCheckboxClick={(e) => handleCheckboxClick(item, e)}
                    isSelected={selectedInventoryIds.has(getSelectionKey(item))}
                    showDrawerName={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {inventoryGrouping === 'flat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredItems.map((item) => (
            <InventoryItem
              key={item.id}
              item={item}
              category={item.categoryId ? categories[item.categoryId] : null}
              onClick={(e) => handleItemClick(item, e)}
              onCheckboxClick={(e) => handleCheckboxClick(item, e)}
              isSelected={selectedInventoryIds.has(getSelectionKey(item))}
              showDrawerName={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
