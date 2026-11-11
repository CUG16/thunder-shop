import { z } from 'zod';

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  // bcrypt only reads the first 72 bytes of a password, so longer ones are refused instead of silently cut.
  password: z
    .string()
    .min(1)
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password is too long.'),
});

export const userRole = z.enum(['customer', 'admin']);
export type UserRole = z.infer<typeof userRole>;

/** What the API is allowed to say about a user. The password hash can never pass through this. */
export const userOutput = z.object({
  id: z.number(),
  email: z.string(),
  role: userRole,
});
export type PublicUser = z.infer<typeof userOutput>;
