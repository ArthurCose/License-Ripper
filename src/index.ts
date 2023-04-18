import * as fs from "fs/promises";
import path from "path";
import { Options, ResolvedPackage, ripOne } from "./rip-license.js";
import resolveLicense from "./resolve-license.js";

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

  if (!options.includeDev) {
    // add dev dependencies to the ignore list
    options.exclude = options.exclude ? [...options.exclude] : [];

    try {
      // todo: support yarn and pnpm?
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

  for (const packagePath of await packageFolders(projectRoot)) {
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

async function packageFolders(projectRoot: string): Promise<string[]> {
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
