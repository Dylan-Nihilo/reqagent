import { useSyncExternalStore } from "react";

// Lightweight module-level store tracking which message IDs were user-cancelled.
// No React context needed — components subscribe via useSyncExternalStore.

const cancelledIds = new Set<string>();
let version = 0;
const subs = new Set<() => void>();

export function markMessageCancelled(id: string) {
  cancelledIds.add(id);
  version++;
  subs.forEach((fn) => fn());
}

export function useIsMessageCancelled(id: string | undefined): boolean {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version,
    () => version,
  );
  return id ? cancelledIds.has(id) : false;
}
