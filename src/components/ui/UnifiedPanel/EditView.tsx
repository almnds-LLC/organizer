import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useDrawerStore, getCategoryColor } from '../../../store/drawerStore';
import { getContrastColor } from '../../../utils/colorHelpers';
import { canSplitCompartment } from '../../../utils/compartmentHelpers';
import { useIsMobile } from '../../../hooks/useMediaQuery';
import { DEFAULT_COMPARTMENT_WIDTH, DEFAULT_COMPARTMENT_HEIGHT } from '../../../constants/defaults';
import type { StoredItem, Drawer, Category, SubCompartment } from '../../../types/drawer';
import { ChevronLeft } from 'lucide-react';

export function EditView() {
  const {
    selectedCompartmentIds,
    selectedDrawerIds,
    selectedSubCompartmentId,
    categories,
    getOrderedCategories,
    clearDrawerSelection,
    updateItem,
    setDividerCount,
    setDividerOrientation,
    setCategoryModalOpen,
    exitEditMode,
    drawers,
    activeDrawerId,
    renameDrawer,
    resizeDrawer,
    setCompartmentSize,
    duplicateDrawer,
    removeDrawer,
    selectSubCompartment,
    splitCompartment,
  } = useDrawerStore();

  const orderedCategories = getOrderedCategories();

  const isMobile = useIsMobile();

  const activeDrawer = useMemo(
    () => (activeDrawerId ? drawers[activeDrawerId] : null),
    [drawers, activeDrawerId]
  );

  const isSingleEdit = selectedCompartmentIds.size === 1;
  const isDrawerEdit = selectedDrawerIds.size > 0;

  const selectedDrawer = useMemo(() => {
    if (selectedDrawerIds.size !== 1) return null;
    const drawerId = Array.from(selectedDrawerIds)[0];
    return drawers[drawerId] || null;
  }, [selectedDrawerIds, drawers]);

  const selectedCompartment = useMemo(() => {
    if (selectedCompartmentIds.size === 0 || !activeDrawer) return null;
    const firstId = Array.from(selectedCompartmentIds)[0];
    return activeDrawer.compartments[firstId] || null;
  }, [selectedCompartmentIds, activeDrawer]);

  const selectedSubIndex = useMemo(() => {
    if (!selectedCompartment || !selectedSubCompartmentId) return 0;
    const idx = selectedCompartment.subCompartments.findIndex(sc => sc.id === selectedSubCompartmentId);
    return idx >= 0 ? idx : 0;
  }, [selectedCompartment, selectedSubCompartmentId]);

  const selectedSub = selectedCompartment?.subCompartments[selectedSubIndex];

  const lastEditRef = useRef<{ compartmentId: string; drawerId: string } | null>(null);

  useEffect(() => {
    const currentId = selectedCompartment?.id ?? null;
    const prev = lastEditRef.current;

    if (prev && prev.compartmentId !== currentId) {
      const { compartmentId, drawerId } = prev;
      const state = useDrawerStore.getState();
      const drawer = state.drawers[drawerId];
      const compartment = drawer?.compartments[compartmentId];

      if (compartment) {
        compartment.subCompartments.forEach((sc) => {
          if (sc.item && !sc.item.label.trim()) {
            state.updateItem(compartmentId, sc.id, null);
          }
        });
      }
    }

    if (selectedCompartment && activeDrawerId) {
      lastEditRef.current = { compartmentId: selectedCompartment.id, drawerId: activeDrawerId };
    } else {
      lastEditRef.current = null;
    }
  }, [selectedCompartment, activeDrawerId]);

  const handleAddDivider = useCallback(() => {
    if (!selectedCompartment) return;
    const newCount = selectedCompartment.subCompartments.length;
    if (newCount < 6) {
      setDividerCount(selectedCompartment.id, newCount);
    }
  }, [selectedCompartment, setDividerCount]);

  const handleRemoveDivider = useCallback(() => {
    if (!selectedCompartment) return;
    const newCount = selectedCompartment.subCompartments.length - 2;
    if (newCount >= 0) {
      setDividerCount(selectedCompartment.id, newCount);
    }
  }, [selectedCompartment, setDividerCount]);

  const handleOrientationChange = useCallback((newOrientation: 'horizontal' | 'vertical') => {
    if (!selectedCompartment) return;
    setDividerOrientation(selectedCompartment.id, newOrientation);
  }, [selectedCompartment, setDividerOrientation]);

  const handleDrawerDelete = useCallback(() => {
    if (!selectedDrawer) return;
    if (confirm(`Delete "${selectedDrawer.name}"? This cannot be undone.`)) {
      removeDrawer(selectedDrawer.id);
      clearDrawerSelection();
      exitEditMode();
    }
  }, [selectedDrawer, removeDrawer, clearDrawerSelection, exitEditMode]);

  return (
    <div className="edit-view">
      <div className="edit-view-header">
        <button className="back-button" onClick={exitEditMode}>
          <ChevronLeft size={20} />
        </button>
        <h2>
          {(() => {
            if (isDrawerEdit) {
              if (selectedDrawerIds.size === 1) {
                return selectedDrawer?.name || 'Drawer';
              }
              return `${selectedDrawerIds.size} Drawers`;
            }
            if (isSingleEdit && selectedCompartment) {
              return `${String.fromCharCode(65 + selectedCompartment.col)}${selectedCompartment.row + 1}`;
            }
            return 'Edit';
          })()}
        </h2>
      </div>

      <div className="edit-view-content">
        {isSingleEdit && selectedCompartment && (
          <div className="compartment-editor">
            <div className={`compartment-preview ${selectedCompartment.dividerOrientation}`}>
              {selectedCompartment.subCompartments.map((sc, i) => {
                const isSubSelected = i === selectedSubIndex;
                const cat = sc.item?.categoryId ? categories[sc.item.categoryId] : null;
                const bgColor = cat ? getCategoryColor(cat) : '#ffffff';
                const textColor = cat ? getContrastColor(bgColor) : '#111827';

                return (
                  <div
                    key={sc.id}
                    className={`sub-section ${isSubSelected ? 'editing' : ''}`}
                    style={{
                      flex: sc.relativeSize,
                      backgroundColor: bgColor,
                      '--text-color': textColor,
                    } as React.CSSProperties}
                    onClick={() => !isSubSelected && selectSubCompartment(sc.id)}
                  >
                    {isSubSelected && selectedSub ? (
                      <SubCompartmentEditor
                        key={selectedSub.id}
                        subCompartment={selectedSub}
                        compartmentId={selectedCompartment.id}
                        orderedCategories={orderedCategories}
                        bgColor={bgColor}
                        textColor={textColor}
                        updateItem={updateItem}
                        setCategoryModalOpen={setCategoryModalOpen}
                        isMobile={isMobile}
                      />
                    ) : (
                      <div className="section-display">
                        {sc.item ? (
                          <>
                            <span className="section-label" style={{ color: textColor }}>{sc.item.label}</span>
                            {sc.item.quantity !== undefined && (
                              <span className="section-qty" style={{ color: textColor }}>×{sc.item.quantity}</span>
                            )}
                          </>
                        ) : (
                          <span className="section-empty">Click to edit</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="structure-controls-section">
              <div className="structure-control">
                <span className="structure-control-label">Sections</span>
                <div className="stepper">
                  <button
                    className="stepper-btn"
                    onClick={handleRemoveDivider}
                    disabled={selectedCompartment.subCompartments.length <= 1}
                  >
                    −
                  </button>
                  <span className="stepper-value">{selectedCompartment.subCompartments.length}</span>
                  <button
                    className="stepper-btn"
                    onClick={handleAddDivider}
                    disabled={selectedCompartment.subCompartments.length >= 6}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="structure-control">
                <span className="structure-control-label">Layout</span>
                <div className="layout-btns">
                  <button
                    className={`layout-btn ${selectedCompartment.dividerOrientation === 'vertical' ? 'active' : ''}`}
                    onClick={() => handleOrientationChange('vertical')}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="1" y="2" width="6" height="12" rx="1" />
                      <rect x="9" y="2" width="6" height="12" rx="1" />
                    </svg>
                  </button>
                  <button
                    className={`layout-btn ${selectedCompartment.dividerOrientation === 'horizontal' ? 'active' : ''}`}
                    onClick={() => handleOrientationChange('horizontal')}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="2" y="1" width="12" height="6" rx="1" />
                      <rect x="2" y="9" width="12" height="6" rx="1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {canSplitCompartment(selectedCompartment) && (
              <button
                className="btn-secondary full-width"
                onClick={() => splitCompartment(selectedCompartment.id)}
                style={{ marginTop: '1rem' }}
              >
                Split into {(selectedCompartment.rowSpan ?? 1) * (selectedCompartment.colSpan ?? 1)} cells
              </button>
            )}
          </div>
        )}


        {isDrawerEdit && selectedDrawer && (
          <DrawerEditForm
            key={selectedDrawer.id}
            drawer={selectedDrawer}
            renameDrawer={renameDrawer}
            resizeDrawer={resizeDrawer}
            setCompartmentSize={setCompartmentSize}
            duplicateDrawer={duplicateDrawer}
            onDelete={handleDrawerDelete}
          />
        )}

        {selectedCompartmentIds.size === 0 && selectedDrawerIds.size === 0 && (
          <p className="no-selection-info">
            Select a compartment to edit
          </p>
        )}
      </div>
    </div>
  );
}

interface SubCompartmentEditorProps {
  subCompartment: SubCompartment;
  compartmentId: string;
  orderedCategories: Category[];
  bgColor: string;
  textColor: string;
  updateItem: (compartmentId: string, subId: string, item: StoredItem | null) => void;
  setCategoryModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

function SubCompartmentEditor({
  subCompartment,
  compartmentId,
  orderedCategories,
  bgColor,
  textColor,
  updateItem,
  setCategoryModalOpen,
  isMobile,
}: SubCompartmentEditorProps) {
  const [label, setLabel] = useState(subCompartment.item?.label || '');
  const [categoryId, setCategoryId] = useState(subCompartment.item?.categoryId || '');
  const [quantity, setQuantity] = useState<number | ''>(subCompartment.item?.quantity ?? '');

  const saveItem = useCallback((overrides: Partial<{ label: string; categoryId: string; quantity: number | '' }> = {}) => {
    const finalLabel = overrides.label !== undefined ? overrides.label : label;
    const finalCategoryId = overrides.categoryId !== undefined ? overrides.categoryId : categoryId;
    const finalQuantity = overrides.quantity !== undefined ? overrides.quantity : quantity;

    const hasContent = finalLabel.trim() || finalCategoryId || finalQuantity !== '';
    const item: StoredItem | null = hasContent
      ? {
          label: finalLabel.trim(),
          categoryId: finalCategoryId || undefined,
          quantity: finalQuantity !== '' ? Number(finalQuantity) : undefined,
        }
      : null;

    updateItem(compartmentId, subCompartment.id, item);
  }, [compartmentId, subCompartment.id, label, categoryId, quantity, updateItem]);

  const handleCategorySelect = useCallback((catId: string) => {
    setCategoryId(catId);
    saveItem({ categoryId: catId });
  }, [saveItem]);

  return (
    <div className="section-inline-editor" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        className="inline-label"
        value={label}
        onChange={(e) => {
          setLabel(e.target.value);
          saveItem({ label: e.target.value });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Label..."
        autoFocus={!isMobile}
        style={{ backgroundColor: bgColor, color: textColor }}
      />
      <div className="inline-colors">
        <button
          className={`inline-color ${categoryId === '' ? 'active' : ''}`}
          style={{ backgroundColor: '#e5e7eb' }}
          onClick={() => handleCategorySelect('')}
          title="No category"
        />
        {orderedCategories.map((c) => (
          <button
            key={c.id}
            className={`inline-color ${categoryId === c.id ? 'active' : ''}`}
            style={{ backgroundColor: getCategoryColor(c) }}
            onClick={() => handleCategorySelect(c.id)}
            title={c.name}
          />
        ))}
        <button
          className="inline-color inline-color-add"
          onClick={() => setCategoryModalOpen(true)}
          title="Manage categories"
        >
          +
        </button>
      </div>
      <div className="inline-qty">
        <span style={{ color: textColor, opacity: 0.6 }}>Qty</span>
        <input
          type="number"
          min="0"
          value={quantity}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value) : '';
            setQuantity(val);
            saveItem({ quantity: val });
          }}
          placeholder="—"
          style={{ backgroundColor: bgColor, color: textColor }}
        />
      </div>
    </div>
  );
}

interface DrawerEditFormProps {
  drawer: Drawer;
  renameDrawer: (id: string, name: string) => void;
  resizeDrawer: (id: string, rows: number, cols: number) => void;
  setCompartmentSize: (id: string, width: number, height: number) => void;
  duplicateDrawer: (id: string) => void;
  onDelete: () => void;
}

function DrawerEditForm({
  drawer,
  renameDrawer,
  resizeDrawer,
  setCompartmentSize,
  duplicateDrawer,
  onDelete,
}: DrawerEditFormProps) {
  const [name, setName] = useState(drawer.name);
  const [rows, setRows] = useState<number | ''>(drawer.rows);
  const [cols, setCols] = useState<number | ''>(drawer.cols);
  const [compWidth, setCompWidth] = useState<number | ''>(drawer.compartmentWidth ?? DEFAULT_COMPARTMENT_WIDTH);
  const [compHeight, setCompHeight] = useState<number | ''>(drawer.compartmentHeight ?? DEFAULT_COMPARTMENT_HEIGHT);

  const handleNameBlur = useCallback(() => {
    if (name.trim()) {
      renameDrawer(drawer.id, name.trim());
    }
  }, [drawer.id, name, renameDrawer]);

  const handleRowsChange = useCallback((value: number | '') => {
    setRows(value);
    if (value !== '') {
      const finalRows = Math.max(1, Math.min(20, value));
      resizeDrawer(drawer.id, finalRows, cols === '' ? drawer.cols : cols);
    }
  }, [drawer.id, cols, drawer.cols, resizeDrawer]);

  const handleColsChange = useCallback((value: number | '') => {
    setCols(value);
    if (value !== '') {
      const finalCols = Math.max(1, Math.min(20, value));
      resizeDrawer(drawer.id, rows === '' ? drawer.rows : rows, finalCols);
    }
  }, [drawer.id, rows, drawer.rows, resizeDrawer]);

  const handleCompWidthChange = useCallback((value: number | '') => {
    setCompWidth(value);
    if (value !== '') {
      const finalWidth = Math.max(1, Math.min(10, value));
      setCompartmentSize(drawer.id, finalWidth, compHeight === '' ? DEFAULT_COMPARTMENT_HEIGHT : compHeight);
    }
  }, [drawer.id, compHeight, setCompartmentSize]);

  const handleCompHeightChange = useCallback((value: number | '') => {
    setCompHeight(value);
    if (value !== '') {
      const finalHeight = Math.max(1, Math.min(10, value));
      setCompartmentSize(drawer.id, compWidth === '' ? DEFAULT_COMPARTMENT_WIDTH : compWidth, finalHeight);
    }
  }, [drawer.id, compWidth, setCompartmentSize]);

  const handleDuplicate = useCallback(() => {
    duplicateDrawer(drawer.id);
  }, [drawer.id, duplicateDrawer]);

  return (
    <>
      <div className="form-group">
        <label htmlFor="drawer-name">Name</label>
        <input
          id="drawer-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Drawer name"
        />
      </div>

      <hr className="divider" />

      <h3 className="section-title">Grid Size</h3>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="drawer-cols">Columns</label>
          <input
            id="drawer-cols"
            type="number"
            min="1"
            max="20"
            value={cols}
            onChange={(e) => handleColsChange(e.target.value === '' ? '' : parseInt(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label htmlFor="drawer-rows">Rows</label>
          <input
            id="drawer-rows"
            type="number"
            min="1"
            max="20"
            value={rows}
            onChange={(e) => handleRowsChange(e.target.value === '' ? '' : parseInt(e.target.value))}
          />
        </div>
      </div>

      <hr className="divider" />

      <h3 className="section-title">Compartment Size</h3>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="comp-width">Width</label>
          <input
            id="comp-width"
            type="number"
            min="1"
            max="10"
            value={compWidth}
            onChange={(e) => handleCompWidthChange(e.target.value === '' ? '' : parseInt(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label htmlFor="comp-height">Height</label>
          <input
            id="comp-height"
            type="number"
            min="1"
            max="10"
            value={compHeight}
            onChange={(e) => handleCompHeightChange(e.target.value === '' ? '' : parseInt(e.target.value))}
          />
        </div>
      </div>

      <hr className="divider" />

      <button className="btn-secondary full-width" onClick={handleDuplicate}>
        Duplicate Drawer
      </button>

      <button
        className="btn-danger full-width"
        onClick={onDelete}
        style={{ marginTop: '0.5rem' }}
      >
        Delete Drawer
      </button>
    </>
  );
}

