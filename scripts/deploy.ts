/**
 * Deploy Mark-Matrix to Cloudflare.
 *
 *   pnpm deploy          # the API worker and the web worker
 *   pnpm deploy --api    # the API worker only
 *   pnpm deploy --web    # the web worker only
 *   pnpm deploy --dry-run
 *
 * The Cloudflare credentials live in `.keys/cloudflare.json`, which is
 * git-ignored. They are deliberately not read from the shell's environment:
 * a new terminal, an IDE task runner and a CI step each get their own
 * environment, and a token that only one of them has is a token the others
 * do not have. This script reads the keys file itself and hands the token to
 * wrangler on the child process, so a deploy behaves the same way from
 * anywhere in the repo.
 *
 * The token is never printed, and never written anywhere but the child
 * process's environment.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The repository root, found by walking up from the working directory until
 * the workspace file appears. The other scripts in this folder assume the
 * working directory is the root; this one does not have to.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not find the repository root (no pnpm-workspace.yaml above this directory).");
    }
    dir = parent;
  }
}

const repoRoot = findRepoRoot();

interface CloudflareKeys {
  account_id?: string;
  api_token?: string;
}

interface WebWorkerConfig {
  name?: string;
  vars?: Record<string, string>;
}

/**
 * Strip JSONC comments and trailing commas so a `.jsonc` config can be
 * parsed as JSON.
 *
 * Hand-rolled rather than pulled in as a dependency: the only subtlety is
 * that the `//` in `https://` is not a comment, which means tracking whether
 * we are inside a string.
 */
function jsoncToJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    // A line comment.
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }

    // A block comment.
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
      out += " ";
      continue;
    }

    out += ch;
  }

  // Trailing commas, which JSONC allows and JSON.parse rejects.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function readJsonc<T>(path: string): T {
  return JSON.parse(jsoncToJson(readFileSync(path, "utf8"))) as T;
}

function readCloudflareKeys(): CloudflareKeys {
  const path = join(repoRoot, ".keys", "cloudflare.json");
  if (!existsSync(path)) return {};
  try {
    return readJsonc<CloudflareKeys>(path);
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * The API origin the web bundle calls. It is inlined into the bundle at
 * build time, and the value in `apps/web/.env` points at the local dev API
 * — so a build without this override ships a front end that calls
 * localhost. The app's wrangler config is the canonical source for it.
 */
function readWebApiOrigin(): string {
  const path = join(repoRoot, "apps", "web", "wrangler.jsonc");
  const config = readJsonc<WebWorkerConfig>(path);
  const origin = config.vars?.["VITE_API_ORIGIN"];
  if (origin === undefined || origin === "") {
    throw new Error(`No VITE_API_ORIGIN in ${path} — the web bundle would call nothing.`);
  }
  return origin;
}

function run(label: string, args: string[], env: NodeJS.ProcessEnv): void {
  console.log(`\n▸ ${label}`);
  // pnpm is a .cmd on Windows, and Node only runs a .cmd through a shell.
  // The arguments are joined into one command string: every one of them is a
  // literal from this file — nothing a caller typed reaches the command line —
  // and joining them keeps Node from warning about an unescaped argument list.
  const command = ["pnpm", ...args].join(" ");
  const result = spawnSync(command, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? "unknown"}).`);
  }
}

function main(): void {
  const flags = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  const wantApi = flags.includes("--api") || !flags.includes("--web");
  const wantWeb = flags.includes("--web") || !flags.includes("--api");

  const keys = readCloudflareKeys();
  const token = keys.api_token ?? process.env["CLOUDFLARE_API_TOKEN"];
  if (token === undefined || token === "") {
    throw new Error(
      "No Cloudflare API token. Put one in .keys/cloudflare.json as \"api_token\", " +
        "or set CLOUDFLARE_API_TOKEN in the environment.",
    );
  }

  const env: NodeJS.ProcessEnv = { ...process.env, CLOUDFLARE_API_TOKEN: token };
  if (keys.account_id !== undefined && keys.account_id !== "") {
    env["CLOUDFLARE_ACCOUNT_ID"] = keys.account_id;
  }

  console.log(
    `Deploying with the token from .keys/cloudflare.json` +
      (keys.account_id !== undefined ? ` for account ${keys.account_id}` : "") +
      (dryRun ? " (dry run)" : "") + ".",
  );

  if (wantApi) {
    run("API worker", ["--filter", "@mark-matrix/api", "run", "deploy", ...(dryRun ? ["--dry-run"] : [])], env);
  }

  if (wantWeb) {
    // The build first, with the production origin — see readWebApiOrigin.
    run("web build", ["--filter", "@mark-matrix/web", "run", "build"], {
      ...env,
      VITE_API_ORIGIN: readWebApiOrigin(),
    });
    run("web worker", ["--filter", "@mark-matrix/web", "run", "deploy", ...(dryRun ? ["--dry-run"] : [])], env);
  }

  console.log("\nDone.");
}

try {
  main();
} catch (err) {
  console.error(`\n${(err as Error).message}`);
  process.exit(1);
}
