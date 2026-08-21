import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicBase: string;
};

function jurisdictionHost(accountId: string) {
  const j = (process.env.R2_JURISDICTION ?? "").trim().toLowerCase();
  if (j === "eu") return `${accountId}.eu.r2.cloudflarestorage.com`;
  if (j === "us") return `${accountId}.us.r2.cloudflarestorage.com`;
  if (j === "fedramp") return `${accountId}.fedramp.r2.cloudflarestorage.com`;
  return `${accountId}.r2.cloudflarestorage.com`;
}

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? process.env.AWS_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? process.env.AWS_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() ?? process.env.AWS_S3_BUCKET?.trim() ?? "";
  const endpoint = (process.env.R2_ENDPOINT?.trim() || process.env.AWS_ENDPOINT_URL?.trim() || (accountId ? `https://${jurisdictionHost(accountId)}` : "")).replace(/\/$/, "");
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;
  const publicBase = (process.env.R2_PUBLIC_BASE?.trim() || `${endpoint}/${bucket}`).replace(/\/$/, "");
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint, publicBase };
}

function s3(): { client: S3Client; cfg: R2Config } | null {
  const cfg = r2Config();
  if (!cfg) return null;
  return {
    cfg,
    client: new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: true,
    }),
  };
}

export async function headBucket() {
  const bound = s3();
  if (!bound) return { ok: false as const, status: 0, error: "R2 credentials missing" };
  try {
    await bound.client.send(new HeadBucketCommand({ Bucket: bound.cfg.bucket }));
    return { ok: true as const, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "HEAD bucket failed";
    return { ok: false as const, status: 0, error: message };
  }
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  const bound = s3();
  if (!bound) return { ok: false as const, status: 0, error: "R2 credentials missing", key, url: "" };
  try {
    const result = await bound.client.send(
      new PutObjectCommand({
        Bucket: bound.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return {
      ok: true as const,
      status: 200,
      etag: result.ETag,
      key,
      url: `${bound.cfg.publicBase}/${key}`,
    };
  } catch (err) {
    return {
      ok: false as const,
      status: 0,
      error: err instanceof Error ? err.message : "PUT failed",
      key,
      url: "",
    };
  }
}

export async function getObject(key: string) {
  const bound = s3();
  if (!bound) return { ok: false as const, status: 0, error: "R2 credentials missing", body: "" };
  try {
    const result = await bound.client.send(new GetObjectCommand({ Bucket: bound.cfg.bucket, Key: key }));
    const body = (await result.Body?.transformToString()) ?? "";
    return { ok: true as const, status: 200, body, etag: result.ETag };
  } catch (err) {
    return { ok: false as const, status: 0, error: err instanceof Error ? err.message : "GET failed", body: "" };
  }
}
