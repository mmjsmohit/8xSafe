import { z } from "zod";

export type TokenReader = () => Promise<string | null>;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function createApiClient(input: { baseUrl: string; readAccessToken: TokenReader }) {
  const request = async <T>(options: {
    path: string;
    schema: z.ZodType<T>;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  }): Promise<T> => {
    const token = await input.readAccessToken();
    const response = await fetch(`${input.baseUrl}${options.path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token === null ? {} : { Authorization: `Bearer ${token}` })
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });

    const data: unknown = await response.json();
    if (!response.ok) {
      const parsed = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(data);
      throw new ApiRequestError(
        parsed.success ? parsed.data.error.message : "Request failed",
        response.status,
        parsed.success ? parsed.data.error.code : "REQUEST_FAILED"
      );
    }
    return options.schema.parse(data);
  };

  return { request };
}

