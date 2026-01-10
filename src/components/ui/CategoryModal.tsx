import { useReducer, useCallback, useState, useRef, useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { useDrawerStore, getCategoryColor } from '../../store/drawerStore';
import { COLOR_PRESETS } from '../../constants/defaults';
import { Modal, Button } from './shared';
import styles from './CategoryModal.module.css';

interface FormState {
  // New category form
  newName: string;
  newColor: string;
  // Edit state (null when not editing)
  editingId: string | null;
  editName: string;
  editColor: string;
}

type FormAction =
  | { type: 'SET_NEW_NAME'; value: string }
  | { type: 'SET_NEW_COLOR'; value: string }
  | { type: 'START_EDIT'; id: string; name: string; color: string }
  | { type: 'SET_EDIT_NAME'; value: string }
  | { type: 'SET_EDIT_COLOR'; value: string }
  | { type: 'CANCEL_EDIT' }
  | { type: 'RESET_NEW' }
  | { type: 'RESET_ALL' };

const initialState: FormState = {
  newName: '',
  newColor: COLOR_PRESETS[0],
  editingId: null,
  editName: '',
  editColor: '',
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_NEW_NAME':
      return { ...state, newName: action.value };
    case 'SET_NEW_COLOR':
      return { ...state, newColor: action.value };
    case 'START_EDIT':
      return { ...state, editingId: action.id, editName: action.name, editColor: action.color };
    case 'SET_EDIT_NAME':
      return { ...state, editName: action.value };
    case 'SET_EDIT_COLOR':
      return { ...state, editColor: action.value };
    case 'CANCEL_EDIT':
      return { ...state, editingId: null, editName: '', editColor: '' };
    case 'RESET_NEW':
      return { ...state, newName: '', newColor: COLOR_PRESETS[0] };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}

export function CategoryModal() {
  const {
    isCategoryModalOpen,
    setCategoryModalOpen,
    categories,
    addCategory,
    updateCategory,
    removeCategory,
    reorderCategories,
  } = useDrawerStore();

  const [form, dispatch] = useReducer(formReducer, initialState);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number>(-1);

  const baseOrderedCategories = useMemo(() => {
    return Object.values(categories).sort((a, b) => {
      if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
        return a.displayOrder - b.displayOrder;
      }
      if (a.displayOrder !== undefined) return -1;
      if (b.displayOrder !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [categories]);

  const orderedCategories = useMemo(() => {
    if (!draggedId || dragOverIndex === null) return baseOrderedCategories;

    const fromIndex = baseOrderedCategories.findIndex(c => c.id === draggedId);
    if (fromIndex === -1 || fromIndex === dragOverIndex) return baseOrderedCategories;

    const result = [...baseOrderedCategories];
    const [dragged] = result.splice(fromIndex, 1);
    result.splice(dragOverIndex, 0, dragged);
    return result;
  }, [baseOrderedCategories, draggedId, dragOverIndex]);

  const handleClose = useCallback(() => {
    setCategoryModalOpen(false);
    dispatch({ type: 'RESET_ALL' });
  }, [setCategoryModalOpen]);

  const handleAdd = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!form.newName.trim()) return;
    addCategory(form.newName.trim(), form.newColor);
    dispatch({ type: 'RESET_NEW' });
  }, [form.newName, form.newColor, addCategory]);

  const startEditing = useCallback((id: string) => {
    const cat = categories[id];
    if (cat) {
      dispatch({ type: 'START_EDIT', id, name: cat.name, color: getCategoryColor(cat) });
    }
  }, [categories]);

  const saveEdit = useCallback(() => {
    if (form.editingId && form.editName.trim()) {
      updateCategory(form.editingId, form.editName.trim(), form.editColor);
      dispatch({ type: 'CANCEL_EDIT' });
    }
  }, [form.editingId, form.editName, form.editColor, updateCategory]);

  const cancelEdit = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, id: string, index: number) => {
    setDraggedId(id);
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverIndex(null);
    draggedIndexRef.current = -1;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }, [dragOverIndex]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    if (!draggedId || dragOverIndex === null) {
      setDraggedId(null);
      setDragOverIndex(null);
      draggedIndexRef.current = -1;
      return;
    }

    const newOrder = orderedCategories.map(c => c.id);
    reorderCategories(newOrder);

    setDraggedId(null);
    setDragOverIndex(null);
    draggedIndexRef.current = -1;
  }, [draggedId, dragOverIndex, orderedCategories, reorderCategories]);

  return (
    <Modal isOpen={isCategoryModalOpen} onClose={handleClose} title="Manage Categories" className={styles.modal}>
      <div className={styles.content}>
        {/* Existing categories */}
        <div className={styles.categoryList}>
          {orderedCategories.length === 0 ? (
            <p className={styles.noCategories}>No categories yet. Add one below.</p>
          ) : (
            orderedCategories.map((cat, index) => (
              <div
                key={cat.id}
                className={`${styles.categoryItem} ${draggedId === cat.id ? styles.dragging : ''}`}
                draggable={form.editingId !== cat.id}
                onDragStart={(e) => handleDragStart(e, cat.id, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={handleDrop}
              >
                {form.editingId === cat.id ? (
                  <div className={styles.categoryEditForm}>
                    <input
                      type="text"
                      value={form.editName}
                      onChange={(e) => dispatch({ type: 'SET_EDIT_NAME', value: e.target.value })}
                      autoFocus
                    />
                    <div className={styles.colorOptions}>
                      {COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`${styles.colorBtn} ${form.editColor === color ? styles.active : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => dispatch({ type: 'SET_EDIT_COLOR', value: color })}
                        />
                      ))}
                      {(() => {
                        const isCustom = !COLOR_PRESETS.includes(form.editColor);
                        return (
                          <label
                            className={`${styles.colorBtn} ${styles.customColorBtn} ${isCustom ? styles.hasCustomColor : ''} ${isCustom ? styles.active : ''}`}
                            style={isCustom ? { backgroundColor: form.editColor } : undefined}
                          >
                            <input
                              type="color"
                              value={form.editColor}
                              onChange={(e) => dispatch({ type: 'SET_EDIT_COLOR', value: e.target.value })}
                            />
                            <span className={styles.colorIcon}>+</span>
                          </label>
                        );
                      })()}
                    </div>
                    <div className={styles.editActions}>
                      <Button variant="secondary" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveEdit}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.dragHandle} title="Drag to reorder">
                      <GripVertical size={16} />
                    </div>
                    <span
                      className={styles.categorySwatch}
                      style={{ backgroundColor: getCategoryColor(cat) }}
                    />
                    <span className={styles.categoryLabel}>{cat.name}</span>
                    <div className={styles.categoryActions}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => startEditing(cat.id)}
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.delete}`}
                        onClick={() => removeCategory(cat.id)}
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add new category */}
        <form className={styles.addCategoryForm} onSubmit={handleAdd}>
          <h3>Add New Category</h3>
          <div className={styles.formGroup}>
            <input
              type="text"
              value={form.newName}
              onChange={(e) => dispatch({ type: 'SET_NEW_NAME', value: e.target.value })}
              placeholder="Category name"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Color</label>
            <div className={styles.colorOptions}>
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorBtn} ${form.newColor === color ? styles.active : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => dispatch({ type: 'SET_NEW_COLOR', value: color })}
                />
              ))}
              {(() => {
                const isCustom = !COLOR_PRESETS.includes(form.newColor);
                return (
                  <label
                    className={`${styles.colorBtn} ${styles.customColorBtn} ${isCustom ? styles.hasCustomColor : ''} ${isCustom ? styles.active : ''}`}
                    style={isCustom ? { backgroundColor: form.newColor } : undefined}
                  >
                    <input
                      type="color"
                      value={form.newColor}
                      onChange={(e) => dispatch({ type: 'SET_NEW_COLOR', value: e.target.value })}
                    />
                    <span className={styles.colorIcon}>+</span>
                  </label>
                );
              })()}
            </div>
          </div>
          <Button
            type="submit"
            className={styles.fullWidth}
            disabled={!form.newName.trim()}
          >
            Add Category
          </Button>
        </form>
      </div>
    </Modal>
  );
}
