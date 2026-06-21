// api/claude.js  — Vercel serverless function
// Proxies requests to Anthropic API so the key stays server-side.
// Deploy: just push this file to your repo, Vercel auto-detects /api folder.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional: restrict to your own domain only
  const origin = req.headers.origin || "";
  const allowed = [
    "https://study-hub-sooty-psi.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:5500"  // Live Server
  ];
  if (origin && !allowed.includes(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  try {
    const { messages, system, model, max_tokens } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-6",
        max_tokens: max_tokens || 1024,
        system: system || "",
        messages: messages || []
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: "Proxy error: " + err.message });
  }
}