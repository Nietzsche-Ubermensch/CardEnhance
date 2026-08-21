import { createServerFn } from "@tanstack/react-start";
import { dbSource, getSql } from "@/lib/db";

export type ConnectorStatus = "connected" | "pglite" | "disconnected" | "error";

export const checkConnectors = createServerFn({ method: "GET" }).handler(async () => {
  const statuses: Record<string, ConnectorStatus> = {
    xai: process.env.XAI_API_KEY?.trim() ? "connected" : "disconnected",
    neon: "disconnected",
    slack: "disconnected",
    huggingface: "disconnected",
    telegram: "disconnected",
  };

  try {
    const sql = await getSql();
    await sql`select 1 as ok`;
    statuses.neon = dbSource === "neon" ? "connected" : "pglite";
  } catch {
    statuses.neon = "error";
  }

  const slack = process.env.SLACK_BOT_TOKEN?.trim();
  if (slack) {
    try {
      const r = await fetch("https://slack.com/api/auth.test", {
        headers: { Authorization: `Bearer ${slack}` },
      });
      const d = (await r.json()) as { ok?: boolean };
      statuses.slack = d.ok ? "connected" : "error";
    } catch {
      statuses.slack = "error";
    }
  }

  const hf = process.env.HF_TOKEN?.trim() || process.env.HUGGINGFACE_HUB_TOKEN?.trim();
  const space = process.env.HF_SPACE_URL?.trim();
  if (hf || space) {
    try {
      const url = space ? `${space.replace(/\/$/, "")}/v1/models` : "https://huggingface.co/api/models?limit=1";
      const headers: Record<string, string> = {};
      if (hf) headers.Authorization = `Bearer ${hf}`;
      const r = await fetch(url, { headers });
      statuses.huggingface = r.ok ? "connected" : "error";
    } catch {
      statuses.huggingface = "error";
    }
  }

  const tg = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (tg) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${tg}/getMe`);
      const d = (await r.json()) as { ok?: boolean };
      statuses.telegram = d.ok ? "connected" : "error";
    } catch {
      statuses.telegram = "error";
    }
  }

  return statuses;
});
