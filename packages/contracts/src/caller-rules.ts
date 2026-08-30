import { z } from "zod";
import { callerRuleIdSchema, e164Schema } from "./domain.js";

export const callerRuleSchema = z.object({
  id: callerRuleIdSchema,
  phoneNumber: e164Schema,
  label: z.string().nullable(),
  createdAt: z.iso.datetime()
});

export const createCallerRuleRequestSchema = z.object({
  phoneNumber: e164Schema,
  label: z.string().trim().min(1).max(100).optional()
});

export const callerRulesResponseSchema = z.object({ items: z.array(callerRuleSchema) });

export type CallerRule = z.infer<typeof callerRuleSchema>;
export type CreateCallerRuleRequest = z.infer<typeof createCallerRuleRequestSchema>;

