export function looksLikeGitHubRepoImportUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.endsWith(".githubusercontent.com") || hostname === "gist.github.com") return false;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return false;
    if (segments.length > 2 && segments[2] !== "tree") return false;
    const owner = segments[0]!;
    const repo = segments[1]!.replace(/\.git$/i, "");
    if (!owner || !repo) return false;
    return !/\.md$/i.test(repo);
  } catch {
    return false;
  }
}
