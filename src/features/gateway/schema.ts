import { z } from 'zod';
import { validAmount } from '@/shared/lib/format';
export const gatewaySchema = z
  .object({
    mode: z.enum(['shield', 'send', 'unshield']),
    amount: z.string().refine(validAmount, 'Enter a positive amount with up to 18 decimal places.'),
    recipient: z.string(),
    pool: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'send' && !/^perc1[a-z0-9]{20,}$/i.test(value.recipient))
      ctx.addIssue({
        code: 'custom',
        path: ['recipient'],
        message: 'Enter the recipient’s complete perc1 privacy address.',
      });
  });
export type GatewayValues = z.infer<typeof gatewaySchema>;
