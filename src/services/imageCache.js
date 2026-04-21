const fs = require("node:fs");
const path = require("node:path");
const { loadImage } = require("@napi-rs/canvas");

const CACHE_DIR = path.resolve(__dirname, "..", "assets", "cache");

async function downloadToFile(url, destPath) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buffer);
}

async function getCachedOrFetch(filename, url) {
  const filePath = path.join(CACHE_DIR, filename);

  if (fs.existsSync(filePath)) {
    return loadImage(filePath);
  }

  await downloadToFile(url, filePath);
  return loadImage(filePath);
}

module.exports = { getCachedOrFetch, CACHE_DIR };