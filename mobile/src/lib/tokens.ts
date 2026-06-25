export function redactToken(token: string | null | undefined) {
  if (!token) {
    return "not available";
  }

  if (token.length <= 12) {
    return `${token.slice(0, 3)}...`;
  }

  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

export function tokenHashPreview(hash: string | null | undefined) {
  if (!hash) {
    return "not registered";
  }

  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}
