import { useState, useEffect } from 'react';
import { exportKeyToHex } from '../lib/crypto';

export function useKeyHex(symmetricKey: CryptoKey | null): string {
  const [keyHex, setKeyHex] = useState<string>('DERIVING...');

  useEffect(() => {
    if (symmetricKey) {
      exportKeyToHex(symmetricKey)
        .then(hex => setKeyHex(hex))
        .catch(() => setKeyHex('ERR_EXTRACT'));
    } else {
      setKeyHex('Chưa có khóa');
    }
  }, [symmetricKey]);

  return keyHex;
}
export default useKeyHex;
