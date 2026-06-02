import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
try {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {
  console.warn("No .env.local found");
}

const url =
  process.argv[2] ??
  "https://github.com/SahilMalgundkar24/Ai-PoweredChatbot";

const res = await fetch("http://localhost:3000/api/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ repoUrl: url }),
});

const body = await res.json();
console.log("status", res.status);
console.log(JSON.stringify(body, null, 2));
