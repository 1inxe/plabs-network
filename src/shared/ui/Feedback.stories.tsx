import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, EmptyState, Notice } from './index';

const meta = {
  title: 'Foundations/Feedback',
  component: EmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {
  args: {
    title: 'No activity yet',
    children: 'Transactions initiated in this session will appear here.',
  },
};
export const Statuses: Story = {
  args: { title: 'Status badges' },
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Badge>Confirmed</Badge>
      <Badge tone="amber">Pending</Badge>
      <Badge tone="red">Failed</Badge>
      <Badge tone="gray">Not connected</Badge>
    </div>
  ),
};
export const Information: Story = {
  args: { title: 'Notice' },
  render: () => <Notice>Your keys and proof generation remain in the wallet extension.</Notice>,
};
