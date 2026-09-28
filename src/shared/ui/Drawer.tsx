import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef } from 'react';

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  icon,
  accessory,
  descriptionHidden = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  accessory?: ReactNode;
  descriptionHidden?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className="drawer-content"
          data-notification-layer=""
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected)
              returnFocus.current.focus({ preventScroll: true });
          }}
        >
          <header className="drawer-header">
            <div className="drawer-title-row">
              {icon}
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description className={descriptionHidden ? 'sr-only' : undefined}>
                  {description}
                </Dialog.Description>
              </div>
            </div>
            <div className="drawer-header-actions">
              {accessory}
              <Dialog.Close className="icon-button drawer-close" aria-label="Close wallet">
                <X aria-hidden="true" size={19} />
              </Dialog.Close>
            </div>
          </header>
          <div className="drawer-body">{children}</div>
          {footer && <footer className="drawer-footer">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
