import { createHash, createHmac } from "node:crypto";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
};

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() ?? "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const publicBase = (process.env.R2_PUBLIC_BASE?.trim() || `https://${accountId}.r2.cloudflarestorage.com/${bucket}`).replace(/\/$/, "");
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex");
}

function amzDate(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso.slice(0, 15) + "Z", day: iso.slice(0, 8) };
}

async function signedFetch(opts: {
  method: "HEAD" | "GET" | "PUT";
  key?: string;
  body?: Buffer;
  contentType?: string;
}) {
  const cfg = r2Config();
  if (!cfg) return { ok: false as const, status: 0, error: "R2 credentials missing" };
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = opts.key ? `/${cfg.bucket}/${opts.key.split("/").map(encodeURIComponent).join("/")}` : `/${cfg.bucket}`;
  const body = opts.body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(body);
  const { amz, day } = amzDate();
  const contentType = opts.contentType ?? "";
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonical = [opts.method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(canonical)].join("\n");
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, day);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`https://${host}${path}`, {
    method: opts.method,
    headers,
    body: opts.method === "PUT" ? new Uint8Array(body) : undefined,
  });
  const text = opts.method === "GET" ? await res.text() : "";
  return { ok: res.ok, status: res.status, etag: res.headers.get("etag"), body: text, error: res.ok ? undefined : `R2 HTTP ${res.status}` };
}

export async function headBucket() {
  return signedFetch({ method: "HEAD" });
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  const cfg = r2Config();
  const result = await signedFetch({ method: "PUT", key, body, contentType });
  const url = cfg ? `${cfg.publicBase}/${key}` : "";
  return { ...result, key, url };
}

export async function getObject(key: string) {
  return signedFetch({ method: "GET", key });
}
