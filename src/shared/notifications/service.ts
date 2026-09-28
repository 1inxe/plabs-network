export type NotificationKind = 'success' | 'error' | 'warning' | 'info' | 'loading';
export type NotificationAction = { label: string } & (
  | { href: string; onClick?: never }
  | { onClick: () => unknown; href?: never }
);
export type NotificationInput = {
  title: string;
  message: string;
  id?: string;
  scope?: string;
  /** Use for background refresh errors. Explicit operations can update their own id. */
  dedupeKey?: string;
  duration?: number;
  action?: NotificationAction;
};
export type NotificationItem = NotificationInput & {
  id: string;
  kind: NotificationKind;
  duration: number;
};
export interface NotificationRenderer {
  show: (item: NotificationItem, onClose: () => void) => void;
  dismiss: (id: string) => void;
}
const durations: Record<NotificationKind, number> = {
  success: 5000,
  error: Infinity,
  warning: Infinity,
  info: 7000,
  loading: Infinity,
};

/** Bounded, in-memory feedback. Duplicate polling errors do not restart timers or flood the UI. */
export function createNotificationService(renderer: NotificationRenderer, now = Date.now) {
  const active = new Map<string, NotificationItem>();
  const recent = new Map<string, { id: string; fingerprint: string; at: number; scope?: string }>();
  let sequence = 0;
  const forget = (id: string) => {
    active.delete(id);
    for (const row of recent.values()) if (row.id === id) row.at = now();
  };
  const dismiss = (id?: string) => {
    for (const key of id ? [id] : [...active.keys()]) {
      forget(key);
      renderer.dismiss(key);
    }
  };
  const show = (kind: NotificationKind, input: NotificationInput) => {
    const timestamp = now();
    for (const [key, row] of recent)
      if (!active.has(row.id) && timestamp - row.at >= 60000) recent.delete(key);
    const key = input.dedupeKey ? `${input.scope ?? ''}:${input.dedupeKey}` : undefined;
    const fingerprint = JSON.stringify([kind, input.title, input.message]);
    const previous = key ? recent.get(key) : undefined;
    if (previous?.fingerprint === fingerprint) return previous.id;
    const id = input.id ?? previous?.id ?? `notification-${++sequence}`;
    for (const item of active.values()) {
      if (
        input.scope &&
        item.scope === input.scope &&
        item.id !== id &&
        ['success', 'info'].includes(item.kind)
      )
        dismiss(item.id);
    }
    if (!active.has(id) && active.size >= 3) {
      const oldest =
        [...active.values()].find((item) => item.kind !== 'loading') ??
        active.values().next().value;
      if (oldest) dismiss(oldest.id);
    }
    const item: NotificationItem = {
      ...input,
      id,
      kind,
      duration: input.duration ?? durations[kind],
    };
    active.set(id, item);
    if (key) {
      recent.set(key, { id, fingerprint, at: timestamp, scope: input.scope });
      if (recent.size > 100) {
        const oldest = recent.keys().next().value;
        if (oldest) recent.delete(oldest);
      }
    }
    renderer.show(item, () => {
      if (active.get(id) === item) forget(id);
    });
    return id;
  };
  return {
    show,
    success: (input: NotificationInput) => show('success', input),
    error: (input: NotificationInput) => show('error', input),
    warning: (input: NotificationInput) => show('warning', input),
    info: (input: NotificationInput) => show('info', input),
    loading: (input: NotificationInput) => show('loading', input),
    dismiss,
    resolve: (dedupeKey: string, scope?: string) => {
      const key = `${scope ?? ''}:${dedupeKey}`;
      const item = recent.get(key);
      if (item) dismiss(item.id);
      recent.delete(key);
    },
    isCurrent: (item: NotificationItem) => active.get(item.id) === item,
    dismissPending: (id: string) => {
      if (active.get(id)?.kind === 'loading') dismiss(id);
    },
    clearScope: (scope: string) => {
      for (const item of active.values()) if (item.scope === scope) dismiss(item.id);
      for (const [key, value] of recent) if (value.scope === scope) recent.delete(key);
    },
  };
}
