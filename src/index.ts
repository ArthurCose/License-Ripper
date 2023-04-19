import * as fs from "fs/promises";
import path from "path";
import { Options, ResolvedPackage, ripOne } from "./rip-license.js";
import resolveLicense from "./resolve-license.js";
import YAML from "yaml";

export type Output = {
  resolved: ResolvedPackage[];
  errors: {
    missingLicenseText: string[];
    missingLicense: string[];
  };
};

export { ripOne, resolveLicense };

export function getDefaultCacheFolder(projectRoot: string): string {
  return path.join(projectRoot, "node_modules", ".cache", "license-ripper");
}

export async function ripAll(
  projectRoot: string,
  options?: Options
): Promise<Output> {
  const resolved = [];
  const errors = {
    missingLicenseText: [],
    missingLicense: [],
  };

  if (!options) {
    options = {};
  } else {
    options = { ...options };
  }

  if (!options.cacheFolder) {
    options.cacheFolder = getDefaultCacheFolder(projectRoot);
  }

  for (const packagePath of await packageFolders(projectRoot, options)) {
    const data = await ripOne(packagePath, options);

    if (!data) {
      continue;
    }

    if (!data.license) {
      errors.missingLicense.push(data.name);
    }

    if (!data.licenseText) {
      errors.missingLicenseText.push(data.name);
    }

    resolved.push(data);
  }

  return { resolved, errors };
}

async function packageFolders(
  projectRoot: string,
  options: Options
): Promise<string[]> {
  const pnpmFolder = path.join(projectRoot, "node_modules", ".pnpm");
  const pnpmLockPath = path.join(pnpmFolder, "lock.yaml");

  try {
    const pnpmLockYaml = await fs.readFile(pnpmLockPath, "utf8");
    return await packageFoldersPnpm(pnpmFolder, pnpmLockYaml, options);
  } catch {
    // file not found, not using pnpm
  }

  return await packageFoldersDefault(projectRoot, options);
}

async function packageFoldersDefault(
  projectRoot: string,
  options: Options
): Promise<string[]> {
  if (!options.includeDev) {
    // add dev dependencies to the ignore list
    options.exclude = options.exclude ? [...options.exclude] : [];

    try {
      const lockFilePath = path.join(projectRoot, "package-lock.json");
      const packageLockJson = await fs.readFile(lockFilePath, "utf8");
      const packageLock = JSON.parse(packageLockJson);

      for (const name in packageLock.dependencies) {
        if (packageLock.dependencies[name].dev) {
          options.exclude.push(name);
        }
      }
    } catch {
      // we'll just give up on excluding dev dependencies
    }
  }

  const modulesFolder = path.join(projectRoot, "node_modules");

  const entries = await fs.readdir(modulesFolder, { withFileTypes: true });
  const folders = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(modulesFolder, entry.name);

    if (entry.name.startsWith("@")) {
      const subEntries = await fs.readdir(entryPath, { withFileTypes: true });

      for (const subEntry of subEntries) {
        if (!subEntry.isDirectory) {
          continue;
        }

        const subEntryPath = path.join(entryPath, subEntry.name);
        folders.push(subEntryPath);
      }

      continue;
    }

    folders.push(entryPath);
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
    console.error("error: failed to parse pnpm lock file");
    return [];
  }

  type DependencyInfo = {
    path: string;
    version: number[];
  };

  const dependencies: { [key: string]: DependencyInfo } = {};

  for (const key in pnpmLock.packages) {
    if (!options.includeDev && pnpmLock.packages[key].dev) {
      // skip dev
      continue;
    }

    const name = key.slice(1, key.indexOf("@", 2));
    let version = key
      .slice(key.indexOf("@", 2), key.indexOf("("))
      .split(".")
      .map((v) => parseInt(v));

    const existingData = dependencies[name];

    if (existingData && isVersionNewer(existingData.version, version)) {
      // not the latest
      continue;
    }

    const packagePath = path.join(
      pnpmFolder,
      key.slice(1).replace(/\//g, "+").replace(/\(/g, "_").replace(/\)/g, ""),
      "node_modules",
      name
    );

    dependencies[name] = {
      path: packagePath,
      version,
    };
  }

  return Object.values(dependencies).map((p) => p.path);
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
