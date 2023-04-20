import * as fs from "fs/promises";
import path from "path";
import { Options, ResolvedPackage, ripOne } from "./rip-license.js";
import resolveExpression, { mergeExpressions } from "./resolve-expression.js";
import { PackageMeta } from "./package-meta.js";
import YAML from "yaml";
import { getDefaultCacheFolder } from "./cache.js";
import { logError } from "./log.js";

export type Output = {
  resolved: ResolvedPackage[];
  errors: {
    missingLicenseText: string[];
    invalidLicense: string[];
  };
};

export {
  ripOne,
  resolveExpression as resolveLicenseExpression,
  getDefaultCacheFolder,
  Options,
  ResolvedPackage,
};

export async function ripAll(
  projectRoot: string,
  options?: Options
): Promise<Output> {
  const resolved = [];
  const errors: Output["errors"] = {
    missingLicenseText: [],
    invalidLicense: [],
  };

  if (!options) {
    options = {};
  } else {
    options = { ...options };
  }

  if (!options.cacheFolder) {
    options.cacheFolder = getDefaultCacheFolder(projectRoot);
  }

  type ResolvedMap = {
    [name: string]: { data: ResolvedPackage; version: number[] }[];
  };

  const resolvedMap: ResolvedMap = {};

  for (const packagePath of await packageFolders(projectRoot, options)) {
    const data = await ripOne(packagePath, options);

    if (!data) {
      continue;
    }

    if (data.licenseExpression.includes("UNKNOWN")) {
      errors.invalidLicense.push(data.name);
    }

    if (data.licenses.length == 0) {
      errors.missingLicenseText.push(data.name);
    }

    // reducing duplicates by only storing the latest version when licenses are exactly the same
    let existing = resolvedMap[data.name];

    if (!existing) {
      existing = [];
      resolvedMap[data.name] = existing;
    }

    const version = data.version.split(".").map((v) => parseInt(v));

    const match = existing.find(
      (oldData) =>
        // same license count
        data.licenses.length == oldData.data.licenses.length &&
        // every license has an identical match
        data.licenses.every((license) =>
          oldData.data.licenses.some(
            (oldLicense) => oldLicense.text == license.text
          )
        )
    );

    if (!match) {
      // add a new entry
      existing.push({ data, version });
      resolved.push(data);
    } else if (isVersionNewer(version, match.version)) {
      // overwrite existing data
      Object.assign(match.data, data);
      match.version = version;
    }
  }

  return { resolved, errors };
}

async function packageFolders(
  projectRoot: string,
  options: Options
): Promise<string[]> {
  try {
    const lockPath = path.join(projectRoot, "package-lock.json");
    const npmLockJson = await fs.readFile(lockPath, "utf8");
    return await packageFoldersNpm(projectRoot, npmLockJson, options);
  } catch (e) {
    // file not found, not using npm
  }

  try {
    const pnpmFolder = path.join(projectRoot, "node_modules", ".pnpm");
    const pnpmLockPath = path.join(pnpmFolder, "lock.yaml");
    const pnpmLockYaml = await fs.readFile(pnpmLockPath, "utf8");
    return await packageFoldersPnpm(pnpmFolder, pnpmLockYaml, options);
  } catch {
    // file not found, not using pnpm
  }

  if (!options.includeDev) {
    return await packageFoldersFallbackNoDev(projectRoot, options);
  }

  return await packageFoldersFallback(projectRoot);
}

async function packageFoldersNpm(
  projectRoot: string,
  npmLockJson: string,
  options: Options
): Promise<string[]> {
  let npmLock;

  try {
    npmLock = JSON.parse(npmLockJson);
  } catch {
    logError("failed to parse npm lock file");
    return [];
  }

  const folders = [];

  for (const packagePath in npmLock.packages) {
    if (packagePath == "") {
      continue;
    }

    const packageData = npmLock.packages[packagePath];

    if (!options.includeDev && packageData.dev) {
      continue;
    }

    const name = packagePath.slice(
      packagePath.lastIndexOf("node_modules") + 13
    );

    if (options.exclude?.includes(name)) {
      continue;
    }

    folders.push(path.join(projectRoot, packagePath));
  }

  return folders;
}

async function packageFoldersPnpm(
  pnpmFolder: string,
  pnpmLockYaml: string,
  options: Options
): Promise<string[]> {
  let pnpmLock;

  try {
    pnpmLock = YAML.parse(pnpmLockYaml);
  } catch {
    logError("failed to parse pnpm lock file");
    return [];
  }

  const folders = [];

  for (const key in pnpmLock.packages) {
    if (!options.includeDev && pnpmLock.packages[key].dev) {
      // skip dev
      continue;
    }

    const nameEnd = key.indexOf("@", 2);
    const name = key.slice(1, nameEnd);

    if (options.exclude?.includes(name)) {
      continue;
    }

    const packagePath = path.join(
      pnpmFolder,
      key.slice(1).replace(/\//g, "+").replace(/\(/g, "_").replace(/\)/g, ""),
      "node_modules",
      name
    );

    folders.push(packagePath);
  }

  return folders;
}

const readdirOptions: { withFileTypes: true } = {
  withFileTypes: true,
};

async function packageFoldersFallbackNoDev(
  projectRoot: string,
  options: Options
): Promise<string[]> {
  // package.json guided search

  const modulesRoot = path.join(projectRoot, "node_modules");

  const folders: string[] = [];
  const needsSearch = [projectRoot];

  while (needsSearch.length > 0) {
    const searchFolder = needsSearch.pop();
    let packageMeta: PackageMeta;

    try {
      const packageMetaPath = path.join(searchFolder, "package.json");
      const packageMetaJson = await fs.readFile(packageMetaPath, "utf8");
      packageMeta = JSON.parse(packageMetaJson);
    } catch {
      continue;
    }

    let storedPackages: string[] = [];
    const modulesPath = path.join(searchFolder, "node_modules");

    try {
      for (const entry of await fs.readdir(modulesPath, readdirOptions)) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
          continue;
        }

        if (!entry.name.startsWith("@")) {
          // not scoped: lodash
          storedPackages.push(entry.name);
          continue;
        }

        // scoped: @ava/typescript
        const entryPath = path.join(modulesPath, entry.name);
        const scope = entry.name;

        for (const entry of await fs.readdir(entryPath, readdirOptions)) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            storedPackages.push(`${scope}/${entry.name}`);
          }
        }
      }
    } catch {}

    const dependencyNames = Object.keys(packageMeta.dependencies || {})
      // npm installs all optionals by default
      .concat(Object.keys(packageMeta.optionalDependencies || {}))
      // these dependencies are required
      // if it's defined only by devDependency it's a bug, but we should still track it
      .concat(Object.keys(packageMeta.peerDependencies || {}))
      // everything in a dependency's node_modules has been installed for something in this package, assume it's necessary
      // necessary as it seems child dependencies may install their dependencies in parent node_modules to avoid deep trees
      .concat(modulesRoot != modulesPath ? storedPackages : []);

    for (const packageName of dependencyNames) {
      if (options.exclude?.includes(packageName)) {
        continue;
      }

      const packagePath = path.join(
        storedPackages.includes(packageName) ? modulesPath : modulesRoot,
        packageName
      );

      if (!folders.includes(packagePath)) {
        // hasn't already been added
        folders.push(packagePath);
        needsSearch.push(packagePath);
      }
    }
  }

  return folders;
}

async function packageFoldersFallback(projectRoot: string): Promise<string[]> {
  // readdir based search

  const folders = [];
  const needsSearch = [path.join(projectRoot, "node_modules")];

  while (needsSearch.length > 0) {
    const searchFolder = needsSearch.pop();
    let entries;

    try {
      entries = await fs.readdir(searchFolder, readdirOptions);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(searchFolder, entry.name);

      if (entry.name.startsWith("@")) {
        needsSearch.push(entryPath);
        continue;
      }

      needsSearch.push(path.join(entryPath, "node_modules"));
      folders.push(entryPath);
    }
  }

  return folders;
}

function isVersionNewer(sample: number[], against: number[]): boolean {
  for (let i = 0; i < sample.length && i < against.length; i++) {
    const a = sample[i];
    const b = against[i];

    if (a > b) {
      // newer
      return true;
    }

    if (a < b) {
      // older
      return false;
    }
  }

  // same version?
  return false;
}
