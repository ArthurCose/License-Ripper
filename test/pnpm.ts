import test from "ava";
import { ripAll } from "../dist/index.js";
import * as fs from "fs/promises";
import child_process from "child_process";
import { promisify } from "util";
import path from "path";

const exec = promisify(child_process.exec);

const PNPM_FOLDER = "test/pnpm/";

test.serial("pnpm", async (t) => {
  try {
    await fs.stat(PNPM_FOLDER);
  } catch {
    await fs.rename("node_modules", "pnpm-test-node_modules-backup");
    await Promise.all([exec("pnpm i"), fs.mkdir(PNPM_FOLDER)]);
    const deleteLockFile = fs.rm("pnpm-lock.yaml");
    await fs.rename("node_modules", path.join(PNPM_FOLDER, "node_modules"));
    await fs.rename("pnpm-test-node_modules-backup", "node_modules");
    await deleteLockFile;
  }

  const npm = await ripAll("");
  const pnpm = await ripAll(PNPM_FOLDER);

  for (const p of npm.resolved) {
    p.folder = "";
  }

  for (const p of pnpm.resolved) {
    p.folder = "";
  }

  t.deepEqual(keyByName(npm.resolved), keyByName(pnpm.resolved));
});

function keyByName(input: { name: string }[]) {
  const map = {};

  for (const o of input) {
    map[o.name] = input;
  }

  return map;
}
