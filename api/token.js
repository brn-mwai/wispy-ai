// Hands the browser a short-lived AssemblyAI Voice Agent token. The API key stays on the server:
// set ASSEMBLYAI_API_KEY in the host's environment. Sessions are capped so a public demo cannot run
// up a long bill, and each address gets a few sessions a minute.

const TOKEN_URL = "https://agents.assemblyai.com/v1/token";
const REDEEM_WITHIN_SECONDS = 60;
const LONGEST_SESSION_SECONDS = 600;
const SESSIONS_PER_MINUTE = 5;
const recent = new Map();

function tooMany(address) {
  const now = Date.now();
  const kept = (recent.get(address) || []).filter((at) => now - at < 60_000);
  kept.push(now);
  recent.set(address, kept);
  return kept.length > SESSIONS_PER_MINUTE;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") return response.status(405).json({ error: "Use GET." });
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return response.status(500).json({ error: "The demo has no AssemblyAI key set." });
  const address = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(address)) return response.status(429).json({ error: "Too many sessions from here. Wait a minute and try again." });

  const url = new URL(TOKEN_URL);
  url.searchParams.set("expires_in_seconds", String(REDEEM_WITHIN_SECONDS));
  url.searchParams.set("max_session_duration_seconds", String(LONGEST_SESSION_SECONDS));
  try {
    const answer = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const body = await answer.json().catch(() => ({}));
    if (!answer.ok || !body.token) return response.status(502).json({ error: "AssemblyAI did not issue a session." });
    return response.status(200).json({ token: body.token });
  } catch {
    return response.status(502).json({ error: "AssemblyAI could not be reached." });
  }
}
