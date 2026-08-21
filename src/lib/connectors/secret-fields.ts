export const SECRET_FIELDS = [
  { key: "XAI_API_KEY", label: "xAI API key", where: "console.x.ai", kind: "secret" as const },
  { key: "HF_TOKEN", label: "Hugging Face token", where: "huggingface.co/settings/tokens", kind: "secret" as const },
  { key: "HF_SPACE_URL", label: "Hugging Face Space URL", where: "https://….hf.space", kind: "text" as const },
  { key: "DATABASE_URL", label: "Neon connection string", where: "console.neon.tech", kind: "secret" as const },
  { key: "SLACK_BOT_TOKEN", label: "Slack bot token", where: "xoxb-…", kind: "secret" as const },
  { key: "SLACK_CHANNEL", label: "Slack channel ID", where: "C…", kind: "text" as const },
  { key: "TELEGRAM_BOT_TOKEN", label: "Telegram bot token", where: "BotFather", kind: "secret" as const },
  { key: "TELEGRAM_CHAT_ID", label: "Telegram chat ID", where: "numeric id", kind: "text" as const },
  { key: "VERCEL_TOKEN", label: "Vercel token", where: "vercel.com/account/tokens", kind: "secret" as const },
  { key: "ENABLE_VISION", label: "Enable Grok vision", where: "true or false", kind: "text" as const },
  { key: "CLOUDFLARE_TUNNEL_URL", label: "Cloudflare Worker URL", where: "https://cardenhance-price-tunnel.…workers.dev", kind: "text" as const },
  { key: "CLOUDFLARE_TUNNEL_TOKEN", label: "Cloudflare tunnel token", where: "Worker AUTH_KEY_SECRET", kind: "secret" as const },
  { key: "R2_ACCOUNT_ID", label: "R2 account ID", where: "Cloudflare dashboard account id", kind: "text" as const },
  { key: "R2_ACCESS_KEY_ID", label: "R2 access key ID", where: "R2 API token access key", kind: "secret" as const },
  { key: "R2_SECRET_ACCESS_KEY", label: "R2 secret access key", where: "R2 API token secret", kind: "secret" as const },
  { key: "R2_BUCKET", label: "R2 bucket", where: "bucket name", kind: "text" as const },
  { key: "R2_ENDPOINT", label: "R2 S3 endpoint", where: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com", kind: "text" as const },
  { key: "R2_PUBLIC_BASE", label: "R2 public base URL", where: "https://pub-….r2.dev (optional)", kind: "text" as const },
] as const;

export type SecretKey = (typeof SECRET_FIELDS)[number]["key"];
export type SecretMap = Partial<Record<SecretKey, string>>;

const ALLOWED = new Set<string>(SECRET_FIELDS.map((field) => field.key));

function aliasKey(key: string) {
  if (key === "HUGGINGFACE_HUB_TOKEN") return "HF_TOKEN";
  if (key === "NEON_DATABASE_URL") return "DATABASE_URL";
  if (key === "AWS_ACCESS_KEY_ID") return "R2_ACCESS_KEY_ID";
  if (key === "AWS_SECRET_ACCESS_KEY") return "R2_SECRET_ACCESS_KEY";
  if (key === "AWS_ENDPOINT_URL" || key === "AWS_ENDPOINT") return "R2_ENDPOINT";
  if (key === "AWS_S3_BUCKET" || key === "S3_BUCKET") return "R2_BUCKET";
  if (key === "AWS_ACCOUNT_ID") return "R2_ACCOUNT_ID";
  return key;
}

export function parseCredentialText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const trimmed = text.trim();
  if (!trimmed) return out;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const [raw, value] of Object.entries(parsed)) {
        const key = aliasKey(raw.trim());
        if (!ALLOWED.has(key) || typeof value !== "string" || !value.trim()) continue;
        out[key] = value.trim();
      }
      return out;
    } catch {
      /* KEY=value */
    }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    const row = line.trim();
    if (!row || row.startsWith("#")) continue;
    const body = row.replace(/^export\s+/, "");
    const eq = body.indexOf("=");
    if (eq < 1) continue;
    const key = aliasKey(body.slice(0, eq).trim());
    if (!ALLOWED.has(key)) continue;
    const value = body.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (value) out[key] = value;
  }
  return out;
}

export function maskSecret(value: string | undefined) {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function snapshotSecrets(map: SecretMap) {
  return SECRET_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    where: field.where,
    kind: field.kind,
    set: Boolean(map[field.key] || (typeof process !== "undefined" && process.env[field.key]?.trim())),
    hint: maskSecret(map[field.key] || (typeof process !== "undefined" ? process.env[field.key] : undefined)),
  }));
}
