import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

const variants = cva('button', {
  variants: {
    variant: {
      primary: 'primary-button',
      secondary: 'secondary-button',
      ghost: 'text-button',
      danger: 'primary-button red-button',
    },
    size: { default: '', small: 'button-small' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants> & { asChild?: boolean };
export function Button({
  asChild = false,
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      {...(!asChild ? { type } : {})}
      className={twMerge(variants({ variant, size }), className)}
      {...props}
    />
  );
}
