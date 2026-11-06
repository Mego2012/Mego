import { useEffect, useState } from 'react';
import { accountState, subscribeAccount, type AccountState } from '../lib/account';
/** Small hook kept outside Account.tsx so the main bundle does not load Firebase screens eagerly. */
export function useAccount(): AccountState {
  const [s, setS] = useState<AccountState>(accountState());
  useEffect(() => subscribeAccount(setS), []);
  return s;
}
