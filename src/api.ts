import { projectId, publicAnonKey } from "../utils/supabase/info";
export const apiBase = `https://${projectId}.supabase.co/functions/v1/make-server-0510dbc7`;
export async function apiRequest<Result>(path: string, options: RequestInit = {}, token?: string, timeoutMilliseconds = 25000): Promise<Result> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
      headers: { "Content-Type": "application/json", apikey: publicAnonKey, Authorization: `Bearer ${token ?? publicAnonKey}`, ...options.headers },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "The backend is not available yet");
    return body as Result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("The service took too long to respond. Please retry.");
    throw error;
  } finally { window.clearTimeout(timeout); }
}
export async function signInAdmin(email: string, password: string): Promise<string> {
  const response = await fetch(`https://${projectId}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publicAnonKey },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.msg ?? body.error_description ?? "Sign-in failed");
  return body.access_token;
}
