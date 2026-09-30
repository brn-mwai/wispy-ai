// Serves the demo on http://localhost:5210 and answers /api/token with the same function Vercel runs.
// Needs ASSEMBLYAI_API_KEY in the environment, or WISPY_TOKEN_COMMAND: a command that prints
// "AGENT_TOKEN <token>" (used on a machine where the key lives in a sealed store).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/token.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PORT = Number(process.env.PORT || 5210);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".css": "text/css" };

function jsonResponse(response) {
  return {
    setHeader: (name, value) => response.setHeader(name, value),
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(body));
    },
  };
}

createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/api/token") {
    if (process.env.WISPY_TOKEN_COMMAND && !process.env.ASSEMBLYAI_API_KEY) {
      try {
        const printed = execSync(process.env.WISPY_TOKEN_COMMAND, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const token = printed.match(/AGENT_TOKEN (\S+)/)?.[1];
        response.setHeader("Content-Type", "application/json");
        return response.end(JSON.stringify(token ? { token } : { error: "The token command printed no token." }));
      } catch {
        response.statusCode = 502;
        return response.end(JSON.stringify({ error: "The token command failed." }));
      }
    }
    return handler(request, jsonResponse(response));
  }
  const file = normalize(join(ROOT, path === "/" ? "index.html" : path));
  if (!file.startsWith(ROOT)) {
    response.statusCode = 403;
    return response.end();
  }
  try {
    const body = await readFile(file);
    response.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    response.end(body);
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}).listen(PORT, () => console.log(`Wispy AI demo on http://localhost:${PORT}`));
