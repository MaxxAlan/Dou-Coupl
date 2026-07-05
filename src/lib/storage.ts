// Type-safe local storage wrapper

export const storageHelper = {
  getItem: <T>(key: string, defaultValue: T): T => {
    try {
      const val = localStorage.getItem(key);
      if (val === null) return defaultValue;
      return JSON.parse(val) as T;
    } catch (e) {
      console.warn(`Error reading localStorage key "${key}":`, e);
      // Fallback for simple string storage
      const raw = localStorage.getItem(key);
      if (raw !== null) return raw as unknown as T;
      return defaultValue;
    }
  },

  setItem: <T>(key: string, value: T): void => {
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, str);
    } catch (e) {
      console.error(`Error writing localStorage key "${key}":`, e);
    }
  },

  removeItem: (key: string): void => {
    localStorage.removeItem(key);
  }
};
