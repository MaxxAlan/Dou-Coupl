import { useState, useEffect } from 'react';
import { decryptData } from '../lib/crypto';

export function useDecryptedCollection<T extends { id: string }, R>(
  items: T[],
  symmetricKey: CryptoKey | null,
  decryptFn: (item: T, key: CryptoKey) => Promise<R>
) {
  const [decryptedMap, setDecryptedMap] = useState<Record<string, R>>({});

  useEffect(() => {
    if (!symmetricKey) {
      setDecryptedMap({});
      return;
    }

    let isMounted = true;
    const cache: Record<string, R> = { ...decryptedMap };
    
    // Filter cache to keep only active items
    const itemIds = new Set(items.map(i => i.id));
    let cacheChanged = false;
    for (const key of Object.keys(cache)) {
      if (!itemIds.has(key)) {
        delete cache[key];
        cacheChanged = true;
      }
    }

    const decryptAll = async () => {
      let changed = false;
      for (const item of items) {
        if (cache[item.id] !== undefined) {
          continue;
        }
        try {
          const decrypted = await decryptFn(item, symmetricKey);
          cache[item.id] = decrypted;
          changed = true;
        } catch (e) {
          console.error(`Failed to decrypt item ${item.id}:`, e);
        }
      }

      if (isMounted && (changed || cacheChanged)) {
        setDecryptedMap({ ...cache });
      }
    };

    decryptAll();

    return () => {
      isMounted = false;
    };
  }, [items, symmetricKey]);

  return decryptedMap;
}
export default useDecryptedCollection;
