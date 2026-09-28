import { CheckCircle2, CircleAlert, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { createNotificationService, type NotificationItem } from './service';

export type { NotificationInput, NotificationKind } from './service';

const icons = {
  success: CheckCircle2,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  loading: LoaderCircle,
};
export const notify = createNotificationService({
  show: (item, onClose) => {
    if (typeof window === 'undefined') return;
    toast.custom(() => <NotificationCard item={item} />, {
      id: item.id,
      duration: item.duration,
      dismissible: false,
      onDismiss: onClose,
      onAutoClose: onClose,
    });
  },
  dismiss: (id) => {
    if (typeof window !== 'undefined') toast.dismiss(id);
  },
});

function NotificationCard({ item }: { item: NotificationItem }) {
  const Icon = icons[item.kind];
  const [actionFailed, setActionFailed] = useState(false);
  const runAction = async () => {
    if (!item.action?.onClick) return;
    try {
      await item.action.onClick();
    } catch {
      if (notify.isCurrent(item)) setActionFailed(true);
    }
  };
  return (
    <section
      className="notification-card"
      data-kind={item.kind}
      role={item.kind === 'error' ? 'alert' : 'status'}
      aria-label={item.title}
    >
      <div className="notification-heading">
        <Icon
          aria-hidden="true"
          size={19}
          className={item.kind === 'loading' ? 'notification-spinner' : undefined}
        />
        <h3 title={item.title}>{item.title}</h3>
        <button
          type="button"
          className="notification-close"
          aria-label="Dismiss notification"
          onClick={() => notify.dismiss(item.id)}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll long notification details. */}
      <section className="notification-body" tabIndex={0} aria-label="Notification details">
        {item.message}
      </section>
      {item.action && (
        <div className="notification-actions">
          {actionFailed && <span role="status">Action unavailable</span>}
          {'href' in item.action && item.action.href ? (
            <Link to={item.action.href} onClick={() => notify.dismiss(item.id)}>
              {item.action.label}
            </Link>
          ) : (
            <button type="button" onClick={() => void runAction()}>
              {item.action.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Mounted once in the application shell, outside scrolling page and drawer content. */
export function NotificationViewport() {
  const [host] = useState(() =>
    typeof document === 'undefined' ? null : document.createElement('div'),
  );
  useLayoutEffect(() => {
    if (!host) return;
    host.dataset.notificationHost = '';
    // Keep the same portal container (and timers), but inside the active dialog's focus scope.
    const place = () => {
      const layers = document.querySelectorAll<HTMLElement>(
        '[data-notification-layer][data-state="open"]',
      );
      const target = layers.item(layers.length - 1) ?? document.body;
      if (host.parentElement !== target) target.append(host);
    };
    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    return () => {
      observer.disconnect();
      host.remove();
    };
  }, [host]);
  return host
    ? createPortal(
        <Toaster
          className="app-notifications"
          theme="dark"
          position="top-right"
          offset={16}
          mobileOffset={16}
          gap={12}
          visibleToasts={3}
          expand
          hotkey={['altKey', 'KeyN']}
          containerAriaLabel="Notifications"
        />,
        host,
      )
    : null;
}
