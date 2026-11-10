/**
 * Deploy Mark-Matrix to Cloudflare.
 *
 *   pnpm deploy          # the API worker and the web worker
 *   pnpm deploy --api    # the API worker only
 *   pnpm deploy --web    # the web worker only
 *   pnpm deploy --secrets # push the API worker's secrets, nothing else
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

interface SupabaseKeys {
  url?: string;
  anon_key?: string;
  service_role_key?: string;
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
 * The Supabase credentials the API worker runs on.
 *
 * These are Worker *secrets*, not `vars` — they are not in
 * `apps/api/wrangler.jsonc`, and a Worker without them does not fail
 * loudly at deploy time. It fails at request time: `getSupabase()` throws
 * "supabaseUrl is required.", the auth middleware throws with it, and
 * Hono's default error handler answers with a plain-text
 * "Internal Server Error". The browser's `apiFetch` then tries to
 * `JSON.parse` that and reports the failure as "parse_failed", which
 * points at the front end rather than at the missing secret.
 *
 * Reading them from the keys file — the same place the Cloudflare token
 * comes from — is what keeps a fresh checkout from deploying a worker
 * that answers every authenticated request with a 500.
 */
function readSupabaseKeys(): SupabaseKeys {
  const path = join(repoRoot, ".keys", "supabase.json");
  if (!existsSync(path)) {
    throw new Error(
      `No ${path}. The API worker needs SUPABASE_URL, SUPABASE_ANON_KEY and ` +
        "SUPABASE_SERVICE_ROLE_KEY; without them every authenticated request fails.",
    );
  }
  try {
    return readJsonc<SupabaseKeys>(path);
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`, { cause: err });
  }
}

/** The worker's secrets, and where each one comes from in the keys file. */
function workerSecrets(): Array<{ name: string; value: string; source: string }> {
  const keys = readSupabaseKeys();
  const wanted: Array<{ name: string; value: string | undefined; source: string }> = [
    { name: "SUPABASE_URL", value: keys.url, source: "url" },
    { name: "SUPABASE_ANON_KEY", value: keys.anon_key, source: "anon_key" },
    {
      name: "SUPABASE_SERVICE_ROLE_KEY",
      value: keys.service_role_key,
      source: "service_role_key",
    },
  ];
  const out: Array<{ name: string; value: string; source: string }> = [];
  for (const w of wanted) {
    if (w.value === undefined || w.value === "") {
      throw new Error(
        `No "${w.source}" in .keys/supabase.json — the worker needs ${w.name}.`,
      );
    }
    out.push({ name: w.name, value: w.value, source: w.source });
  }

  // A Supabase URL that is not a URL fails deep inside the SDK, on the first
  // request, as a 500. Check it here, where the message can name the file.
  const url = out[0]?.value ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error(
      `The "url" in .keys/supabase.json is not a Supabase project URL ` +
        `(expected https://<project>.supabase.co).`,
    );
  }
  return out;
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

function run(label: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string): void {
  console.log(`\n▸ ${label}`);
  // pnpm is a .cmd on Windows, and Node only runs a .cmd through a shell.
  // The arguments are joined into one command string: every one of them is a
  // literal from this file — nothing a caller typed reaches the command line —
  // and joining them keeps Node from warning about an unescaped argument list.
  const command = ["pnpm", ...args].join(" ");
  const result = spawnSync(command, {
    cwd: cwd ?? repoRoot,
    stdio: "inherit",
    env,
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? "unknown"}).`);
  }
}

/**
 * Run a command in the API package and capture its stdout.
 *
 * `wrangler secret list --format json` prints the worker's secret names;
 * that is how the script knows which ones still need pushing.
 */
function runCapture(args: string[], env: NodeJS.ProcessEnv): string {
  const command = ["pnpm", ...args].join(" ");
  const result = spawnSync(command, {
    cwd: join(repoRoot, "apps", "api"),
    encoding: "utf8",
    env,
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${args.join(" ")} failed (exit ${result.status ?? "unknown"}): ${result.stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

/**
 * The names of the secrets already bound to the API worker.
 *
 * An empty list is also the answer when the worker does not exist yet —
 * `wrangler secret list` fails on an unknown script, and there is nothing
 * to preserve in that case.
 */
function boundSecretNames(env: NodeJS.ProcessEnv): Set<string> {
  let stdout: string;
  try {
    stdout = runCapture(["exec", "wrangler", "secret", "list", "--format", "json"], env);
  } catch {
    return new Set();
  }
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1) return new Set();
  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1)) as Array<{ name?: string }>;
    return new Set(parsed.map((s) => s.name ?? "").filter((n) => n !== ""));
  } catch {
    return new Set();
  }
}

/**
 * Push one secret to the API worker.
 *
 * The value goes to `wrangler secret put` on stdin, never on the command
 * line — a command line is visible to every process on the machine, and
 * to the shell history.
 */
function putSecret(name: string, value: string, env: NodeJS.ProcessEnv): void {
  console.log(`\n▸ worker secret ${name}`);
  const command = ["pnpm", "exec", "wrangler", "secret", "put", name].join(" ");
  const result = spawnSync(command, {
    cwd: join(repoRoot, "apps", "api"),
    stdio: ["pipe", "inherit", "inherit"],
    input: value,
    env,
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Setting the ${name} secret failed (exit ${result.status ?? "unknown"}).`);
  }
}

/**
 * Report which of the worker's secrets are bound, without changing anything.
 *
 * A worker missing them answers every authenticated request with a 500,
 * and the front end reports that as "parse_failed" — so the question "which
 * secrets does this worker have?" is worth being able to ask without
 * deploying anything.
 *
 * The shape of the local value is reported too, never the value: a secret
 * that is bound but empty looks identical to a good one from the outside,
 * and an empty SUPABASE_URL is exactly what makes `createClient` throw
 * "supabaseUrl is required.".
 */
function checkSecrets(env: NodeJS.ProcessEnv): void {
  const wanted = workerSecrets();
  const bound = boundSecretNames(env);
  console.log("\n▸ worker secrets");
  for (const secret of wanted) {
    const state = bound.has(secret.name) ? "bound" : "MISSING";
    const shape =
      secret.value.length === 0
        ? "local value is EMPTY"
        : secret.value.startsWith("eyJ")
          ? `local value looks like a JWT (${secret.value.length} chars)`
          : `local value is ${secret.value.length} chars`;
    console.log(`  ${secret.name.padEnd(26)} ${state.padEnd(8)} ${shape}`);
  }
  const missing = wanted.filter((s) => !bound.has(s.name));
  if (missing.length > 0) {
    console.log(
      `\n  ${missing.length} secret(s) missing — every authenticated request ` +
        "answers 500 until they are pushed.",
    );
  }
}

/**
 * Make sure the API worker has the Supabase secrets it needs.
 *
 * Secrets that are already bound are left alone: `wrangler secret put`
 * publishes a new version of the worker, so pushing them every time would
 * churn deployments for nothing.
 */
function ensureSecrets(env: NodeJS.ProcessEnv, force: boolean): void {
  const wanted = workerSecrets();
  const bound = boundSecretNames(env);
  const missing = force ? wanted : wanted.filter((s) => !bound.has(s.name));

  if (missing.length === 0) {
    console.log(
      `\n▸ worker secrets — already bound: ${wanted.map((s) => s.name).join(", ")}`,
    );
    return;
  }

  for (const secret of missing) {
    console.log(`\n  ${secret.name} ← .keys/supabase.json "${secret.source}"`);
    putSecret(secret.name, secret.value, env);
  }
}

function main(): void {
  const flags = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  const secretsOnly = flags.includes("--secrets");
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

  if (secretsOnly) {
    // An explicit request to refresh the secrets, so push them even when the
    // names are already bound — a stale value is exactly the case where the
    // worker answers every authenticated request with a 500.
    ensureSecrets(env, true);
    console.log("\nDone.");
    return;
  }

  if (flags.includes("--check")) {
    checkSecrets(env);
    console.log("\nDone.");
    return;
  }

  if (flags.includes("--tail")) {
    // Stream the worker's logs. The API answers a 500 with a plain-text body
    // and no clue in it; the reason is in the log.
    console.log("\n▸ tailing the API worker (Ctrl-C to stop)\n");
    run("API worker logs", ["exec", "wrangler", "tail", "--format", "pretty"], env, join(repoRoot, "apps", "api"));
    return;
  }

  const wranglerAt = flags.indexOf("--wrangler");
  if (wranglerAt !== -1) {
    // A passthrough for the wrangler commands this script does not wrap —
    // `versions view`, `deployments status`. Everything after the flag goes
    // to wrangler in the API package.
    const args = flags.slice(wranglerAt + 1);
    if (args.length === 0) throw new Error("--wrangler needs a command, e.g. --wrangler versions view");
    run("wrangler " + args.join(" "), ["exec", "wrangler", ...args], env, join(repoRoot, "apps", "api"));
    return;
  }

  if (wantApi) {
    // The secrets first: a deploy must never publish a worker that cannot
    // talk to the database, and `wrangler secret put` on a worker that does
    // not exist yet creates a draft for it.
    ensureSecrets(env, false);
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
