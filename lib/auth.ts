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

export function getBearerToken(headers: Headers) {
  return headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

export function isAdminAuthorized(
  headers: Headers,
  expectedToken = process.env.ATTN_INGEST_TOKEN
) {
  if (!expectedToken) {
    return false;
  }

  return isIngestAuthorized(headers, expectedToken);
}
