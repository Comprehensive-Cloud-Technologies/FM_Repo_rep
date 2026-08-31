#!/usr/bin/env node
/**
 * release.mjs — cut a versioned release.
 *
 *   node scripts/release.mjs 1.2.0
 *
 * Bumps VERSION + frontend/package.json + backend/package.json, promotes the
 * CHANGELOG "Unreleased" section to a dated version heading, commits, and tags
 * v1.2.0. Push with:  git push origin <branch> --follow-tags
 */
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = (process.argv[2] || "").trim().replace(/^v/, "");

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/release.mjs <MAJOR.MINOR.PATCH>   e.g. 1.2.0");
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "pipe" }).toString().trim();

// Refuse to run on a dirty tree — a release must be reproducible.
if (run("git status --porcelain")) {
  console.error("Working tree is not clean. Commit or stash your changes first.");
  process.exit(1);
}

const tag = `v${version}`;
try {
  if (run(`git tag --list ${tag}`) === tag) {
    console.error(`Tag ${tag} already exists.`);
    process.exit(1);
  }
} catch { /* ignore */ }

// 1) Bump the three version files.
writeFileSync(join(ROOT, "VERSION"), version + "\n");
for (const f of ["frontend/package.json", "backend/package.json"]) {
  const p = join(ROOT, f);
  const pkg = JSON.parse(readFileSync(p, "utf8"));
  pkg.version = version;
  writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
}

// 2) Promote CHANGELOG "Unreleased" → dated version heading.
const clPath = join(ROOT, "CHANGELOG.md");
let cl = readFileSync(clPath, "utf8");
const today = new Date().toISOString().slice(0, 10);
const placeholder =
  "_Changes merged to `develop` that have not yet been released. Move them under a\nnew version heading when you cut a release tag._";

const unreleasedRe = /## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|\n\[Unreleased\]:|$)/;
const m = cl.match(unreleasedRe);
if (m) {
  let body = m[1].replace(placeholder, "").trim();
  if (!body) body = "_No changelog entries — update CHANGELOG.md before release._";
  const replacement =
    `## [Unreleased]\n\n${placeholder}\n\n## [${version}] - ${today}\n\n${body}\n`;
  cl = cl.replace(unreleasedRe, replacement);
  // Refresh the compare/link footer for the new version.
  const repo = "https://github.com/Comprehensive-Cloud-Technologies/FM_Repo_rep";
  cl = cl.replace(/\[Unreleased\]:.*/,
    `[Unreleased]: ${repo}/compare/${tag}...HEAD`);
  if (!cl.includes(`[${version}]: ${repo}`)) {
    cl = cl.trimEnd() + `\n[${version}]: ${repo}/releases/tag/${tag}\n`;
  }
  writeFileSync(clPath, cl);
} else {
  console.warn("Could not find an [Unreleased] section in CHANGELOG.md — skipping changelog stamp.");
}

// 3) Commit + tag.
run("git add VERSION frontend/package.json backend/package.json CHANGELOG.md");
run(`git commit -m "chore(release): ${version}"`);
run(`git tag -a ${tag} -m "${tag}"`);

console.log(`✔ Released ${tag}`);
console.log("Next:  git push origin " + run("git rev-parse --abbrev-ref HEAD") + " --follow-tags");
