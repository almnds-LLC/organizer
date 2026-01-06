import { describe, it, expect } from 'vitest';
import { getContrastColor } from '../../utils/colorHelpers';

describe('colorHelpers', () => {
  describe('getContrastColor', () => {
    it('should return white for dark colors', () => {
      expect(getContrastColor('#000000')).toBe('#ffffff');
      expect(getContrastColor('#111827')).toBe('#ffffff');
      expect(getContrastColor('#1e3a8a')).toBe('#ffffff');
    });

    it('should return dark for light colors', () => {
      expect(getContrastColor('#ffffff')).toBe('#111827');
      expect(getContrastColor('#fca5a5')).toBe('#111827');
      expect(getContrastColor('#fde047')).toBe('#111827');
    });

    it('should handle colors without hash', () => {
      expect(getContrastColor('ffffff')).toBe('#111827');
      expect(getContrastColor('000000')).toBe('#ffffff');
    });

    it('should handle mid-range colors', () => {
      // Grey 128,128,128 - luminance = 0.5, should return dark
      expect(getContrastColor('#808080')).toBe('#111827');
    });
  });
});
