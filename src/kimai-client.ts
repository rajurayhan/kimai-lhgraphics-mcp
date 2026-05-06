export type KimaiConfig = {
  baseUrl: string;
  username: string;
  apiToken: string;
};

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("KIMAI_BASE_URL is empty");
  return trimmed;
}

export function loadKimaiConfigFromEnv(): KimaiConfig {
  const baseUrl = process.env.KIMAI_BASE_URL;
  const username =
    process.env.KIMAI_USERNAME ?? process.env.KIMAI_USER ?? "";
  const apiToken =
    process.env.KIMAI_API_TOKEN ?? process.env.KIMAI_TOKEN ?? "";
  if (!baseUrl) {
    throw new Error(
      "Set KIMAI_BASE_URL (e.g. https://kimai.example.com), KIMAI_USERNAME, and KIMAI_API_TOKEN",
    );
  }
  if (!username || !apiToken) {
    throw new Error(
      "Set KIMAI_USERNAME (or KIMAI_USER) and KIMAI_API_TOKEN (or KIMAI_TOKEN)",
    );
  }
  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    username,
    apiToken,
  };
}

export class KimaiClient {
  constructor(private readonly cfg: KimaiConfig) {}

  private headers(): HeadersInit {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-AUTH-USER": this.cfg.username,
      "X-AUTH-TOKEN": this.cfg.apiToken,
    };
  }

  async request(
    method: string,
    path: string,
    options?: { query?: Record<string, string | undefined>; body?: unknown },
  ): Promise<{ status: number; text: string; json: unknown | null }> {
    const u = new URL(
      path.startsWith("/") ? path.slice(1) : path,
      `${this.cfg.baseUrl}/`,
    );
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== "") u.searchParams.set(k, v);
      }
    }
    const init: RequestInit = { method, headers: this.headers() };
    if (options?.body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(u, init);
    const text = await res.text();
    let json: unknown | null = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
    }
    return { status: res.status, text, json };
  }
}
