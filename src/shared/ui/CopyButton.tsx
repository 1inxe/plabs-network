import * as Tooltip from '@radix-ui/react-tooltip';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
export function CopyButton({ value, label = 'Copy address' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false),
    [copyFailed, setCopyFailed] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    setCopyFailed(false);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="icon-button"
          aria-label={
            copied ? 'Copied' : copyFailed ? 'Copy unavailable; select and copy manually' : label
          }
          onClick={() => void copy()}
        >
          {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
          <span className="sr-only" role="status">
            {copied
              ? 'Copied to clipboard'
              : copyFailed
                ? 'Copy unavailable. Select and copy manually.'
                : ''}
          </span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={5}>
          {copied ? 'Copied' : copyFailed ? 'Select and copy manually' : 'Copy to clipboard'}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
