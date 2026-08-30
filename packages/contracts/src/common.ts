import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

export const okResponseSchema = z.object({ ok: z.literal(true) });

export type ApiError = z.infer<typeof apiErrorSchema>;

