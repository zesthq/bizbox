export function normalizeDocumentTitle(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractMarkdownH1(body: string | null | undefined) {
  if (typeof body !== "string") return null;
  const headingMatch = body.match(/^\s*#\s+(.+?)\s*$/m);
  return normalizeDocumentTitle(headingMatch?.[1] ?? null);
}

export function resolveDocumentTitle(
  title: string | null | undefined,
  format: string | null | undefined,
  body: string | null | undefined,
) {
  const normalizedTitle = normalizeDocumentTitle(title);
  if (normalizedTitle) return normalizedTitle;
  if (format !== "markdown") return null;
  return extractMarkdownH1(body);
}
