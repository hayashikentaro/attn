export function isIngestAuthorized(
  headers: Headers,
  expectedToken = process.env.ATTN_INGEST_TOKEN
) {
  if (!expectedToken) {
    return true;
  }

  const authorization = headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = headers.get("x-attn-token");

  return bearerToken === expectedToken || headerToken === expectedToken;
}
