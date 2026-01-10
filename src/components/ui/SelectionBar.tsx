import { useState, useRef, useEffect, useMemo } from 'react';
import { Tag, X, Combine } from 'lucide-react';
import { useDrawerStore, getCategoryColor } from '../../store/drawerStore';
import { canMergeCompartments } from '../../utils/compartmentHelpers';
import styles from './SelectionBar.module.css';

export function SelectionBar() {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedCompartmentIds = useDrawerStore((s) => s.selectedCompartmentIds);
  const selectedInventoryIds = useDrawerStore((s) => s.selectedInventoryIds);
  const getOrderedCategories = useDrawerStore((s) => s.getOrderedCategories);
  const clearSelection = useDrawerStore((s) => s.clearSelection);
  const clearInventorySelection = useDrawerStore((s) => s.clearInventorySelection);
  const applyToSelected = useDrawerStore((s) => s.applyToSelected);
  const applyToSelectedInventory = useDrawerStore((s) => s.applyToSelectedInventory);
  const mergeSelectedCompartments = useDrawerStore((s) => s.mergeSelectedCompartments);
  const activeDrawerId = useDrawerStore((s) => s.activeDrawerId);
  const drawers = useDrawerStore((s) => s.drawers);

  const compartmentCount = selectedCompartmentIds.size;
  const inventoryCount = selectedInventoryIds.size;
  const isInventoryMode = inventoryCount > 0;
  const isCompartmentMode = !isInventoryMode && compartmentCount >= 2;
  const selectedCount = isInventoryMode ? inventoryCount : compartmentCount;

  const isVisible = isInventoryMode ? selectedCount >= 1 : selectedCount >= 2;

  const mergeValidation = useMemo(() => {
    if (!isCompartmentMode || !activeDrawerId) return { valid: false, error: '' };
    const drawer = drawers[activeDrawerId];
    if (!drawer) return { valid: false, error: '' };
    return canMergeCompartments(drawer.compartments, selectedCompartmentIds);
  }, [isCompartmentMode, activeDrawerId, drawers, selectedCompartmentIds]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowCategoryMenu(false);
      }
    }

    if (showCategoryMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCategoryMenu]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showCategoryMenu) {
          setShowCategoryMenu(false);
        } else if (isInventoryMode) {
          clearInventorySelection();
        } else {
          clearSelection();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showCategoryMenu, clearSelection, clearInventorySelection, isInventoryMode]);

  const handleAssignCategory = (categoryId: string | null) => {
    if (isInventoryMode) {
      applyToSelectedInventory({ categoryId: categoryId ?? undefined });
    } else {
      applyToSelected({ categoryId: categoryId ?? undefined });
    }
    setShowCategoryMenu(false);
  };

  const handleClearSelection = () => {
    if (isInventoryMode) {
      clearInventorySelection();
    } else {
      clearSelection();
    }
  };

  const orderedCategories = getOrderedCategories();

  return (
    <div className={`${styles.selectionBar} ${isVisible ? styles.visible : ''}`}>
      <span className={styles.selectionCount}>
        {selectedCount} {isInventoryMode ? (selectedCount === 1 ? 'item' : 'items') : 'compartments'}
      </span>

      <div className={styles.selectionActions} ref={menuRef}>
        <button
          className={`${styles.selectionBtn} ${styles.primary}`}
          onClick={() => setShowCategoryMenu(!showCategoryMenu)}
        >
          <Tag size={14} />
          Category
        </button>

        {isCompartmentMode && (
          <button
            className={styles.selectionBtn}
            onClick={() => mergeSelectedCompartments()}
            disabled={!mergeValidation.valid}
            title={mergeValidation.error || 'Merge selected compartments'}
          >
            <Combine size={14} />
            Merge
          </button>
        )}

        <button
          className={`${styles.selectionBtn} ${styles.clearBtn}`}
          onClick={handleClearSelection}
          aria-label="Clear selection"
        >
          <X size={16} />
        </button>

        {showCategoryMenu && (
          <div className={styles.categoryMenu}>
            <button
              className={`${styles.categoryOption} ${styles.removeCategory}`}
              onClick={() => handleAssignCategory(null)}
            >
              <div
                className={styles.categoryColor}
                style={{ backgroundColor: '#d1d5db' }}
              />
              <span className={styles.categoryName}>No category</span>
            </button>

            {orderedCategories.map((category) => (
              <button
                key={category.id}
                className={styles.categoryOption}
                onClick={() => handleAssignCategory(category.id)}
              >
                <div
                  className={styles.categoryColor}
                  style={{ backgroundColor: getCategoryColor(category) }}
                />
                <span className={styles.categoryName}>{category.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
