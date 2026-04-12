import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'error' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  detail?: string;
  /** ms before auto-dismiss. 0 = never (manual dismiss via update/dismiss) */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  _push: (t: Toast) => void;
  dismiss: (id: string) => void;
  update: (id: string, patch: Partial<Omit<Toast, 'id'>>) => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  _push: (t) => set((s) => ({ toasts: [...s.toasts, t] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  update: (id, patch) =>
    set((s) => ({ toasts: s.toasts.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
}));

let counter = 0;

function mkId() {
  return `toast-${Date.now()}-${++counter}`;
}

function push(type: ToastType, message: string, detail?: string, duration = 3500): string {
  const id = mkId();
  const t: Toast = { id, type, message, detail: detail ?? '', duration };
  useToastStore.getState()._push(t);
  if (duration > 0) setTimeout(() => useToastStore.getState().dismiss(id), duration);
  return id;
}

export const toast = {
  info:    (msg: string, detail?: string) => push('info',    msg, detail, 3500),
  success: (msg: string, detail?: string) => push('success', msg, detail, 4000),
  error:   (msg: string, detail?: string) => push('error',   msg, detail, 6000),
  /** Retorna um id — chame toast.done(id) ou toast.fail(id, msg) quando terminar */
  loading: (msg: string, detail?: string) => push('loading', msg, detail, 0),
  done:  (id: string, msg: string, detail?: string) => {
    useToastStore.getState().update(id, { type: 'success', message: msg, detail: detail ?? '', duration: 4000 });
    setTimeout(() => useToastStore.getState().dismiss(id), 4000);
  },
  fail:  (id: string, msg: string, detail?: string) => {
    useToastStore.getState().update(id, { type: 'error', message: msg, detail: detail ?? '', duration: 6000 });
    setTimeout(() => useToastStore.getState().dismiss(id), 6000);
  },
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};

export { useToastStore };
