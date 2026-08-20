import * as p from "@clack/prompts";
import { hasFlag } from "../cli-utils";
import { checkForCliUpdate, isSourceCheckout } from "../update";

const INSTALL_HINT = "curl -fsSL https://canirun.ai/runai/install.sh | bash";

async function resolvePnpm(): Promise<string | null> {
  const which = Bun.which("pnpm");
  return which ?? null;
}

export async function handleUpdate(args: string[]): Promise<void> {
  const asJson = hasFlag(args, "--json");
  const checkOnly = hasFlag(args, "--check");
  const skipConfirm = hasFlag(args, "--yes") || hasFlag(args, "-y");

  const update = await checkForCliUpdate({ force: true });

  if (asJson) {
    console.log(JSON.stringify({
      state: update.state,
      current: update.current,
      latest: update.state === "unknown" ? null : update.latest,
      sourceCheckout: isSourceCheckout(),
    }, null, 2));
    return;
  }

  if (update.state === "unknown") {
    p.log.warn("Could not reach npm or GitHub to check for a newer runai.");
    p.log.info("Try again later, or reinstall with:");
    p.log.info(`  ${INSTALL_HINT}`);
    return;
  }

  if (update.state === "current") {
    p.log.success(`runai ${update.current} is up to date.`);
    return;
  }

  p.log.warn(`Update available: v${update.current} → v${update.latest}`);

  if (checkOnly) {
    p.log.info("Install it with `runai update`.");
    return;
  }

  if (isSourceCheckout()) {
    p.log.info("This is a source checkout. Pull the repo instead of updating the published CLI:");
    p.log.info("  git pull");
    p.log.info("  pnpm --filter runai build");
    return;
  }

  if (process.stdin.isTTY && !skipConfirm) {
    const confirmed = await p.confirm({
      message: `Install runai ${update.latest} with pnpm?`,
      initialValue: true,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.log.info("Update cancelled.");
      return;
    }
  }

  const pnpm = await resolvePnpm();
  if (!pnpm) {
    p.log.error("pnpm was not found in PATH.");
    p.log.info("Reinstall runai with:");
    p.log.info(`  ${INSTALL_HINT}`);
    process.exitCode = 1;
    return;
  }

  p.log.step(`Updating runai to ${update.latest}...`);
  const proc = Bun.spawn([pnpm, "add", "--global", "runai@latest"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    p.log.error(`pnpm exited with code ${exitCode}.`);
    p.log.info("You can also reinstall with:");
    p.log.info(`  ${INSTALL_HINT}`);
    process.exitCode = 1;
    return;
  }

  p.log.success(`runai ${update.latest} installed.`);
  p.log.info("Open a new terminal or run `runai --version` to confirm.");
}
