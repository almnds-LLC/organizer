import { useReducer, useCallback } from 'react';
import { useDrawerStore } from '../../store/drawerStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import {
  DEFAULT_DRAWER_ROWS,
  DEFAULT_DRAWER_COLS,
  DEFAULT_DIVIDER_COUNT,
} from '../../constants/defaults';
import { Modal, Button } from './shared';
import styles from './AddDrawerModal.module.css';

interface FormState {
  name: string;
  rows: number;
  cols: number;
  dividerCount: number;
}

type FormAction =
  | { type: 'SET_FIELD'; field: keyof FormState; value: FormState[keyof FormState] }
  | { type: 'RESET' };

const initialState: FormState = {
  name: '',
  rows: DEFAULT_DRAWER_ROWS,
  cols: DEFAULT_DRAWER_COLS,
  dividerCount: DEFAULT_DIVIDER_COUNT,
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function AddDrawerModal() {
  const { isAddDrawerModalOpen, setAddDrawerModalOpen, addDrawer } = useDrawerStore();
  const [form, dispatch] = useReducer(formReducer, initialState);
  const isMobile = useIsMobile();

  const setField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    addDrawer({
      name: form.name.trim(),
      rows: form.rows,
      cols: form.cols,
      defaultDividerCount: form.dividerCount,
    });

    dispatch({ type: 'RESET' });
  }, [form, addDrawer]);

  const handleClose = useCallback(() => {
    setAddDrawerModalOpen(false);
    dispatch({ type: 'RESET' });
  }, [setAddDrawerModalOpen]);

  return (
    <Modal isOpen={isAddDrawerModalOpen} onClose={handleClose} title="Add New Drawer" className={styles.modal}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="drawer-name">Name</label>
          <input
            id="drawer-name"
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g., Kitchen Drawer"
            autoFocus={!isMobile}
            required
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="drawer-cols">Columns (width)</label>
            <input
              id="drawer-cols"
              type="number"
              min="1"
              max="20"
              value={form.cols}
              onChange={(e) => setField('cols', parseInt(e.target.value) || 1)}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="drawer-rows">Rows (height)</label>
            <input
              id="drawer-rows"
              type="number"
              min="1"
              max="20"
              value={form.rows}
              onChange={(e) => setField('rows', parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="divider-count">Default dividers per compartment</label>
          <input
            id="divider-count"
            type="number"
            min="0"
            max="5"
            value={form.dividerCount}
            onChange={(e) => setField('dividerCount', parseInt(e.target.value) || 0)}
          />
          <span className={styles.formHint}>
            Creates {form.dividerCount + 1} sub-compartment{form.dividerCount !== 0 ? 's' : ''} per cell
          </span>
        </div>

        <div className={styles.formPreview}>
          <span className={styles.previewLabel}>Preview:</span>
          <span className={styles.previewValue}>
            {form.cols} x {form.rows} grid = {form.cols * form.rows} compartments
          </span>
        </div>

        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!form.name.trim()}>
            Create Drawer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
