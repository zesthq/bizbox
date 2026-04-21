import { unprocessable } from "../errors.js";

function isGitHubDotCom(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "github.com" || h === "www.github.com";
}

export type GitHubRequestAuth = {
  token?: string | null;
};

export function gitHubApiBase(hostname: string) {
  return isGitHubDotCom(hostname) ? "https://api.github.com" : `https://${hostname}/api/v3`;
}

export function resolveRawGitHubUrl(hostname: string, owner: string, repo: string, ref: string, filePath: string) {
  const p = filePath.replace(/^\/+/, "");
  return isGitHubDotCom(hostname)
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
    : `https://${hostname}/raw/${owner}/${repo}/${ref}/${p}`;
}

export function withGitHubAuthHeaders(
  init: RequestInit | undefined,
  auth?: GitHubRequestAuth,
): RequestInit | undefined {
  const token = auth?.token?.trim();
  if (!token) return init;

  const headers = new Headers(init?.headers ?? undefined);
  headers.set("authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export async function ghFetch(url: string, init?: RequestInit, auth?: GitHubRequestAuth): Promise<Response> {
  try {
    return await fetch(url, withGitHubAuthHeaders(init, auth));
  } catch {
    throw unprocessable(`Could not connect to ${new URL(url).hostname} — ensure the URL points to a GitHub or GitHub Enterprise instance`);
  }
}
