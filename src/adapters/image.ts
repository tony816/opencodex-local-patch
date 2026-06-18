/**
 * Parse a `data:<media-type>;base64,<data>` URL into its parts. Codex sends inline images as base64
 * data URLs (`into_data_url()`), which Anthropic/Google need split into media_type + raw base64.
 * Returns null for non-data URLs (e.g. a remote https image), which callers pass through differently.
 */
export function parseDataUrl(url: string): { mediaType: string; base64: string } | null {
  const m = url.match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}
