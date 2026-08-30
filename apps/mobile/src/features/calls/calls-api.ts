import {
  callDetailSchema,
  callsPageSchema,
  callsQuerySchema,
  dashboardMetricsSchema
} from "@call-screener/contracts";
import type { CallDetail, CallsPage } from "@call-screener/contracts";
import type { z } from "zod";
import { api } from "../../api";

export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  return api.request({
    path: "/owner/dashboard/metrics",
    schema: dashboardMetricsSchema
  });
}

export async function fetchCallsPage(input: { cursor?: string; limit?: number }): Promise<CallsPage> {
  const query = callsQuerySchema.parse(input);
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  return api.request({
    path: `/owner/calls?${params.toString()}`,
    schema: callsPageSchema
  });
}

export async function fetchCallDetail(callId: string): Promise<CallDetail> {
  return api.request({
    path: `/owner/calls/${callId}`,
    schema: callDetailSchema
  });
}
