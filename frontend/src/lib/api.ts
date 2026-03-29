import { getApiUrl } from "./env";
import { getStoredToken } from "./auth";

export async function apiGet<T>(path: string): Promise<T> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  const res = await fetch(`${getApiUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (typeof body.message === "string") message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(", ");
    } catch {
      if (text) message = text;
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  return JSON.parse(text) as T;
}
