import test, { ExecutionContext } from "ava";
import { ripAll, Options } from "../dist/index.js";
import fs from "fs-extra";
import child_process from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(child_process.exec);

const BASE_FOLDER = "test/pm-structures";

const baseOptions = {};
const includeDevOptions = {
  ...baseOptions,
  // these have no license files and waste API calls
  exclude: ["eastasianwidth", "fast-diff"],
  includeDev: true,
};

test.serial("no-lock-file", async (t) => {
  const folder = path.join(BASE_FOLDER, "no-lock-file");

  await install("npm i", folder, async () =>
    fs.copyFile("package.json", path.join(folder, "package.json"))
  );

  await testPackageManager(t, folder, baseOptions, false);
  await testPackageManager(t, folder, includeDevOptions, false);
});

test.serial("pnpm", async (t) => {
  const folder = path.join(BASE_FOLDER, "pnpm");

  await install("pnpm i", folder, async () => {
    fs.copyFile("package.json", path.join(folder, "package.json"));
    fs.rename("pnpm-lock.yaml", path.join(folder, "pnpm-lock.yaml"));
  });

  await testPackageManager(t, folder, baseOptions, true);
  await testPackageManager(t, folder, includeDevOptions, true);
});

async function install(
  command: string,
  folder: string,
  extra: () => Promise<void>
) {
  const node_modules_dest = path.join(folder, "node_modules");

  try {
    await fs.stat(node_modules_dest);
    return;
  } catch {}

  try {
    // backup old node_modules
    await fs.rename("node_modules", "_node_modules-backup");

    // install packages and create destination
    await Promise.all([exec(command), fs.mkdir(folder, { recursive: true })]);

    // move folders into their correct  locations
    await fs.rename("node_modules", node_modules_dest);
  } catch (e) {
    throw e;
  } finally {
    await fs.rename("_node_modules-backup", "node_modules");
  }

  // copy cache to reduce API requests
  await fs.copy(
    "node_modules/.cache/license-ripper",
    path.join(node_modules_dest, ".cache/license-ripper")
  );

  // cleanup or any other copying
  await extra();
}

async function testPackageManager(
  t: ExecutionContext,
  otherRoot: string,
  options: Options,
  loose: boolean
) {
  const npm = await ripAll("", options);
  const other = await ripAll(otherRoot, options);

  for (const p of npm.resolved) {
    p.path = "";
  }

  for (const p of other.resolved) {
    p.path = "";
  }

  const otherResolvedByName = listStringsByName(other.resolved);

  // loop to see the exact packages that don't match
  if (!loose) {
    // check name and version
    const npmResolvedByNV = keyByNameAndVersion(npm.resolved);
    const otherResolvedByNV = keyByNameAndVersion(other.resolved);

    for (const key in npmResolvedByNV) {
      const value = npmResolvedByNV[key];
      const matchList = otherResolvedByName[value.name] ?? [];

      t.assert(
        otherResolvedByNV[key],
        `expecting "${key}", found: [${matchList.join(", ")}]`
      );
    }
  } else {
    // check just names
    const npmResolvedByName = listStringsByName(other.resolved);

    for (const key in npmResolvedByName) {
      t.assert(otherResolvedByName[key], `expecting "${key}"`);
    }
  }

  t.deepEqual(other.resolved.length, npm.resolved.length);
}

function keyByNameAndVersion(input: { name: string; version: string }[]) {
  const map: { [key: string]: { name: string; version: string } } = {};

  for (const o of input) {
    map[o.name + "@" + o.version] = o;
  }

  return map;
}

function listStringsByName(input: { name: string; version: string }[]) {
  const map: { [key: string]: string[] } = {};

  for (const o of input) {
    let stored = map[o.name];
    const string = o.name + "@" + o.version;

    if (stored) {
      stored.push(string);
    } else {
      map[o.name] = [string];
    }
  }

  return map;
}
