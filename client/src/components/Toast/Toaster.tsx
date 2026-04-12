import { useToastStore } from '../../store/toastStore';
import type { Toast } from '../../store/toastStore';
import './Toaster.css';

const ICONS: Record<Toast['type'], string> = {
  info:    'ℹ',
  success: '✓',
  error:   '✕',
  loading: '',
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
          <div className="toast-icon">
            {t.type === 'loading'
              ? <span className="toast-spinner" />
              : ICONS[t.type]}
          </div>
          <div className="toast-body">
            <span className="toast-msg">{t.message}</span>
            {t.detail && <span className="toast-detail">{t.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
