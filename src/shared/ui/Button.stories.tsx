import type { Meta, StoryObj } from '@storybook/react-vite';
import { Shield } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'Foundations/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Connect PLabs Wallet' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Disabled: Story = { args: { disabled: true, children: 'Waiting for wallet…' } };
export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Shield aria-hidden="true" size={16} />
        Review Shield
      </>
    ),
  },
};
