/**
 * Worker bindings → globalThis bridge. Nitro v3's cloudflare-module preset
 * attaches bindings at req.runtime.cloudflare (v2 used event.context), so read
 * both. Publishes:
 *   __HYPERDRIVE_CS__ — Hyperdrive bridge connection string for pg (db.ts)
 *   __PRICE_TUNNEL__  — service binding to the price-tunnel worker; same-account
 *                       Worker→workers.dev subrequests 404 by platform design.
 */
import { defineEventHandler } from "h3";

type CfEnv = Record<string, unknown>;

export default defineEventHandler((event) => {
  const anyEvent = event as unknown as {
    runtime?: { cloudflare?: { env?: CfEnv } };
    req?: { runtime?: { cloudflare?: { env?: CfEnv } } };
    context?: { cloudflare?: { env?: CfEnv } };
  };
  const env =
    anyEvent.runtime?.cloudflare?.env ??
    anyEvent.req?.runtime?.cloudflare?.env ??
    anyEvent.context?.cloudflare?.env;
  if (!env) return;
  const g = globalThis as typeof globalThis & {
    __HYPERDRIVE_CS__?: string;
    __PRICE_TUNNEL__?: { fetch: (input: string, init?: unknown) => Promise<Response> };
  };
  const hd = env.HYPERDRIVE as { connectionString?: string } | undefined;
  if (hd?.connectionString && !g.__HYPERDRIVE_CS__) {
    g.__HYPERDRIVE_CS__ = hd.connectionString;
  }
  const pt = env.PRICE_TUNNEL as { fetch: (input: string, init?: unknown) => Promise<Response> } | undefined;
  if (pt && !g.__PRICE_TUNNEL__) {
    g.__PRICE_TUNNEL__ = pt;
  }
});
