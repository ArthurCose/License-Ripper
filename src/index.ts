import * as fs from "node:fs/promises";
import child_process from "node:child_process";
import { promisify } from "node:util";
import path from "path";
import { Options, ResolvedPackage, ripOne } from "./rip-license.js";
import resolveExpression, { mergeExpressions } from "./resolve-expression.js";
import { PackageMeta } from "./package-meta.js";
import { getDefaultCacheFolder } from "./cache.js";
import { logError } from "./log.js";
import loadForcedLicenses from "./load-forced-licenses.js";

const exec = promisify(child_process.exec);

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

    if (!isNameAccepted(data.name, options)) {
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

  if (options.append) {
    for (const template of options.append) {
      const forcedPackage: ResolvedPackage = {
        name: template.name,
        version: template.version || "",
        path: template.path || "",
        licenseExpression: template.licenseExpression,
        licenses: await loadForcedLicenses(template.licenses),
        homepage: template.homepage,
        repository: template.repository,
        funding: template.funding,
        description: template.description,
      };

      if (!forcedPackage.licenseExpression) {
        forcedPackage.licenseExpression = mergeExpressions(
          forcedPackage.licenses
        );
      }

      resolved.push(forcedPackage);
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
  } catch {
    // file not found, not using npm
  }

  try {
    return await packageFoldersPnpm(projectRoot, options);
  } catch {
    // command failed, not using pnpm
  }

  if (!options.includeDev) {
    return await packageFoldersFallbackNoDev(projectRoot, options);
  }

  return await packageFoldersFallback(projectRoot, options);
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

    const name =
      packageData.name ||
      packagePath.slice(packagePath.lastIndexOf("node_modules") + 13);

    if (!isNameAccepted(name, options)) {
      continue;
    }

    folders.push(path.join(projectRoot, packagePath));
  }

  return folders;
}

async function packageFoldersPnpm(
  projectFolder: string,
  options: Options
): Promise<string[]> {
  type Output = { [spdx: string]: { name: string; paths: string[] }[] };

  const filterFlag = options.includeDev ? "" : "--prod";
  const command = `pnpm licenses ls ${filterFlag} --json`;
  const { stdout, stderr } = await exec(command, { cwd: projectFolder });

  if (stderr) {
    throw stderr;
  }

  const output = JSON.parse(stdout) as Output;

  const folders = [];

  for (const projects of Object.values(output)) {
    for (const project of projects) {
      if (!isNameAccepted(project.name, options)) {
        continue;
      }

      folders.push(...project.paths);
    }
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
      if (!isNameAccepted(packageName, options)) {
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

async function packageFoldersFallback(
  projectRoot: string,
  options: Options
): Promise<string[]> {
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

      const name = entryPath.slice(
        entryPath.lastIndexOf("/node_modules/") + 14
      );

      if (isNameAccepted(name, options)) {
        folders.push(entryPath);
      }
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

function isNameAccepted(name: string, options: Options): boolean {
  if (options.exclude?.includes(name)) {
    return false;
  }

  if (!options.include) {
    return true;
  }

  return options.include.includes(name);
}

export type CompressedOutput = {
  packages: ResolvedPackage[];
  licenseText: { [key: string]: string };
};

export function compress(resolvedPackages: ResolvedPackage[]) {
  const output: CompressedOutput = {
    packages: [],
    licenseText: {},
  };

  const reverseLookup: { [key: string]: string } = {};

  for (const result of resolvedPackages) {
    const licenses = [];

    for (let i = 0; i < result.licenses.length; i++) {
      const license = result.licenses[i];
      let key = reverseLookup[license.text];

      if (!key) {
        key = `${result.name}@${result.version}/${i}`;
        reverseLookup[license.text] = key;
        output.licenseText[key] = license.text;
      }

      licenses.push({ ...license, text: key });
    }

    output.packages.push({ ...result, licenses });
  }

  return output;
}
