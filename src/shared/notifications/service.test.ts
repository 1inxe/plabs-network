import { describe, expect, it, vi } from 'vitest';
import { createNotificationService } from './service';

const fixture = () => {
  let time = 0;
  const renderer = { show: vi.fn(), dismiss: vi.fn() };
  return {
    service: createNotificationService(renderer, () => time),
    renderer,
    advance: (ms: number) => {
      time += ms;
    },
  };
};
describe('shared notifications', () => {
  it('updates a pending request in place without dismissing its completed result', () => {
    const { service, renderer } = fixture();
    const id = service.loading({ title: 'Waiting', message: 'Approve in wallet.' });
    const oldClose = renderer.show.mock.calls[0]?.[1];
    expect(service.success({ id, title: 'Approved', message: 'Data is now shared.' })).toBe(id);
    oldClose?.();
    service.dismissPending(id);
    expect(renderer.dismiss).not.toHaveBeenCalled();
    expect(renderer.show.mock.calls[1]?.[0]).toMatchObject({ id, kind: 'success', duration: 5000 });
  });
  it('deduplicates a visible polling error and respects dismissal cooldown', () => {
    const { service, renderer, advance } = fixture();
    const input = {
      title: 'Unavailable',
      message: 'Retry later.',
      dedupeKey: 'balances',
      scope: 'wallet',
    };
    const id = service.error(input);
    advance(120000);
    expect(service.error(input)).toBe(id);
    expect(renderer.show).toHaveBeenCalledTimes(1);
    service.dismiss(id);
    advance(30000);
    service.error(input);
    expect(renderer.show).toHaveBeenCalledTimes(1);
    advance(31000);
    service.error(input);
    expect(renderer.show).toHaveBeenCalledTimes(2);
  });
  it('announces a new failure after the operation has recovered', () => {
    const { service, renderer } = fixture();
    const input = {
      title: 'Unavailable',
      message: 'Retry later.',
      dedupeKey: 'balances',
      scope: 'wallet',
    };
    const id = service.error(input);
    service.resolve('balances', 'wallet');
    service.error(input);
    expect(renderer.dismiss).toHaveBeenCalledWith(id);
    expect(renderer.show).toHaveBeenCalledTimes(2);
  });
  it('clears private feedback and its deduplication records when wallet context changes', () => {
    const { service, renderer } = fixture();
    const id = service.error({
      title: 'Private request',
      message: 'Private details',
      scope: 'wallet',
      dedupeKey: 'read',
    });
    const item = renderer.show.mock.calls[0]?.[0];
    const publicId = service.info({
      title: 'Market data',
      message: 'Public details',
      scope: 'data',
    });
    service.clearScope('wallet');
    expect(renderer.dismiss).toHaveBeenCalledWith(id);
    expect(renderer.dismiss).not.toHaveBeenCalledWith(publicId);
    expect(service.isCurrent(item)).toBe(false);
    service.error({
      title: 'Private request',
      message: 'Private details',
      scope: 'wallet',
      dedupeKey: 'read',
    });
    expect(renderer.show).toHaveBeenCalledTimes(3);
  });
  it('bounds the queue while preserving a pending approval when other messages can be removed', () => {
    const { service, renderer } = fixture();
    const pending = service.loading({ title: 'Approval', message: 'Waiting' });
    const oldest = service.info({ title: 'First', message: 'One' });
    service.info({ title: 'Second', message: 'Two' });
    service.warning({ title: 'Third', message: 'Three' });
    expect(renderer.dismiss).toHaveBeenCalledWith(oldest);
    expect(renderer.dismiss).not.toHaveBeenCalledWith(pending);
  });
  it('keeps full multiline error text and persistent error duration', () => {
    const { service, renderer } = fixture();
    const message = `${'Long detail\n'.repeat(100)}<script>plain text</script>`;
    service.error({ title: 'Failed', message });
    expect(renderer.show.mock.calls[0]?.[0]).toMatchObject({
      message,
      duration: Infinity,
      kind: 'error',
    });
  });
});
