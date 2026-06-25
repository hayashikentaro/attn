export function normalizeBackendUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function joinBackendPath(backendUrl: string, path: string) {
  const base = normalizeBackendUrl(backendUrl);
  if (!base) {
    throw new Error("Attn backend URL is not configured.");
  }

  return `${base}/${path.replace(/^\//, "")}`;
}
