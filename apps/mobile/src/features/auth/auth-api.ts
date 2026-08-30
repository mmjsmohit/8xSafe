import {
  authSessionSchema,
  loginRequestSchema,
  type AuthSession,
  type LoginRequest
} from "@call-screener/contracts";
import { api } from "../../api";

export async function loginOwner(request: LoginRequest): Promise<AuthSession> {
  const parsedRequest = loginRequestSchema.parse(request);
  return api.request({
    path: "/auth/login",
    method: "POST",
    body: parsedRequest,
    schema: authSessionSchema
  });
}
