import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("feed UI reads canonical card fields instead of legacy aliases", async () => {
  const paths = [
    "src/App.tsx",
    "src/components/SwipeCard.tsx",
    "src/components/Sidebar.tsx",
  ];
  const source = (await Promise.all(
    paths.map((path) => readFile(resolve(projectRoot, path), "utf8")),
  )).join("\n");

  for (const field of ["id", "title", "price", "imageUrl", "itemWebUrl", "category", "watchCount", "endingSoon"]) {
    assert.match(source, new RegExp(`card\\.${field}\\b`), `UI should consume card.${field}`);
  }
  assert.doesNotMatch(source, /card\.(?:name|currentBid|image|ebayUrl)\b/);
});