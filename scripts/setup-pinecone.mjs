/**
 * One-time setup: create the Pinecone index used by this app.
 * Usage: node scripts/setup-pinecone.mjs
 * Requires PINECONE_API_KEY in .env.local (load manually or export).
 */
import { Pinecone } from "@pinecone-database/pinecone";

const INDEX = process.env.PINECONE_INDEX ?? "codebase-intelligence";
const DIMENSION = Number.parseInt(process.env.PINECONE_DIMENSION ?? "1024", 10);
const CLOUD = process.env.PINECONE_CLOUD ?? "aws";
const REGION = process.env.PINECONE_REGION ?? "us-east-1";

const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey) {
  console.error("Set PINECONE_API_KEY in your environment first.");
  process.exit(1);
}

const pc = new Pinecone({ apiKey });

try {
  const existing = await pc.describeIndex(INDEX);
  console.log(`Index "${INDEX}" already exists (ready=${existing.status?.ready}).`);
  process.exit(0);
} catch {
  // create below
}

console.log(`Creating index "${INDEX}" (${DIMENSION}d, cosine, ${CLOUD}/${REGION})…`);
await pc.createIndex({
  name: INDEX,
  dimension: DIMENSION,
  metric: "cosine",
  spec: { serverless: { cloud: CLOUD, region: REGION } },
});

for (let i = 0; i < 60; i++) {
  const desc = await pc.describeIndex(INDEX);
  if (desc.status?.ready) {
    console.log(`Index "${INDEX}" is ready.`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

console.error("Index created but not ready yet. Check https://app.pinecone.io");
process.exit(1);
