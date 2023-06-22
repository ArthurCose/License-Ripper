import * as fs from "fs/promises";
import resolveExpression, { mergeExpressions } from "./resolve-expression.js";
import { ripMarkdownLicense } from "./rip-markdown-license.js";
import spdxCorrect from "spdx-correct";
import { Fs, LocalFs, resolveRemoteFs } from "./fs.js";
import normalizePackageRepo from "./normalize-package-repo.js";
import resolveMetaLicenseExpression from "./normalize-package-license.js";
import { PackageMeta } from "./package-meta.js";
import { cacheResult, licenseFromCache } from "./cache.js";
import loadForcedLicenses, { ForcedLicense } from "./load-forced-licenses.js";

// make sure to increment CACHE_VERSION if this changes
export type ResolvedLicense = {
  expression?: string;
  source: "license" | "readme" | "forced" | "notice";
  text: string;
};

export type ResolvedPackage = {
  name: string;
  version: string;
  path: string;
  licenseExpression: string;
  licenses: ResolvedLicense[];
  homepage?: string;
  repository?: string;
  funding?: string[];
};

export type Options = {
  /** Adds a homepage key containing a URL string for relevant packages, defaults to false */
  includeHomepage?: boolean;
  /** Adds a repository key containing a URL string for relevant packages, defaults to false */
  includeRepository?: boolean;
  /** Adds a funding key containing a list of URL strings for relevant packages, defaults to false */
  includeFunding?: boolean;
  /** Includes devDependencies in the output, defaults to false */
  includeDev?: boolean;
  /** List of package names to exclude from results, used when the license is only provided from a parent package */
  exclude?: string[];
  /** When defined, any packages not in this list are excluded */
  include?: string[];
  /** Useful for getting rid of warnings and handling cases where the tool fails to grab the license */
  overrides?: {
    [packageName: string]: {
      licenseExpression: string;
      licenses?: ForcedLicense[];
    };
  };
  /** Add anything not picked up by the tool */
  append?: {
    name: string;
    version?: string;
    path?: string;
    licenseExpression?: string;
    licenses?: ForcedLicense[];
    homepage?: string;
    repository?: string;
    funding?: string[];
  }[];
  /** Defaults to [projectRoot]/node_modules/.cache/license-ripper */
  cacheFolder?: string;
};

export async function ripOne(
  packagePath: string,
  options?: Options
): Promise<ResolvedPackage | undefined> {
  const packageJSON = await tryDisk(packagePath + `/package.json`);

  if (!packageJSON) {
    // not a package
    return;
  }

  const packageMeta: PackageMeta = JSON.parse(packageJSON);
  const override = options?.overrides?.[packageMeta.name];

  let licenses: ResolvedLicense[] = [];

  if (override && override.licenses) {
    licenses = await loadForcedLicenses(override.licenses);
  }

  if (licenses.length == 0) {
    licenses = await findLicenseText(packagePath, packageMeta, options);
  }

  let licenseExpression =
    override?.licenseExpression || resolveMetaLicenseExpression(packageMeta);

  if (licenseExpression) {
    licenseExpression =
      spdxCorrect(licenseExpression, { upgrade: false }) || licenseExpression;
  } else if (licenses.length > 0) {
    licenseExpression = mergeExpressions(licenses) + "*";
  }

  const output: ResolvedPackage = {
    name: packageMeta.name,
    version: packageMeta.version,
    path: packagePath,
    licenseExpression,
    licenses,
  };

  if (options?.includeHomepage) {
    output.homepage = packageMeta.homepage;
  }

  if (options?.includeRepository) {
    output.repository = normalizePackageRepo(packageMeta);
  }

  if (packageMeta.funding && options?.includeFunding) {
    const funding = Array.isArray(packageMeta.funding)
      ? (packageMeta.funding as (string | { url: string })[])
      : [packageMeta.funding];

    output.funding = funding.map((info: any) =>
      typeof info == "string" ? info : info.url
    );
  }

  return output;
}

async function findLicenseText(
  baseDir: string,
  packageMeta: PackageMeta,
  options?: Options
): Promise<ResolvedLicense[]> {
  // try grabbing the license from local files
  const localResult = await licenseFromFolder(new LocalFs(baseDir));

  if (
    localResult.some(
      (license) => license.source != "readme" || license.expression != "UNKNOWN"
    )
  ) {
    // stop early if we have a valid result
    return localResult;
  }

  // try grabbing the license from the repo
  const repoUrl = normalizePackageRepo(packageMeta);

  if (repoUrl) {
    const encodedRepoUrl = encodeURIComponent(repoUrl);
    const remoteFs = resolveRemoteFs(repoUrl);

    const cachedResult = await licenseFromCache(encodedRepoUrl, options);

    if (cachedResult) {
      return cachedResult;
    }

    const remoteResult = await licenseFromFolder(remoteFs);

    if (remoteResult.length > 0) {
      cacheResult(encodedRepoUrl, remoteResult, options);
      return remoteResult;
    }

    if (localResult.length > 0) {
      // cache our local result to reduce API usage
      cacheResult(encodedRepoUrl, localResult, options);
    }
  }

  return localResult;
}

async function licenseFromFolder(fs: Fs): Promise<ResolvedLicense[]> {
  let noticeList = [];
  let licenseList = [];
  let readmeLicense = "";

  for (const entry of await fs.readdir()) {
    const lowercaseName = entry.toLowerCase();

    // test as apache notice file
    if (lowercaseName.includes("notice")) {
      const text = await fs.readFile(entry);
      noticeList.push(text);
      continue;
    }

    // test as license file
    const isLicense =
      lowercaseName.includes("license") ||
      lowercaseName.includes("licence") ||
      lowercaseName.includes("copying");

    if (isLicense) {
      // append the license file
      const text = await fs.readFile(entry);
      licenseList.push(text);
      continue;
    }

    // test as readme file
    if (lowercaseName.startsWith("readme")) {
      // overwrite the readme license text
      const text = await fs.readFile(entry);
      readmeLicense = ripMarkdownLicense(text);
    }
  }

  const resolved: ResolvedLicense[] = [];

  for (const text of noticeList) {
    resolved.push({
      source: "notice",
      text: text,
    });
  }

  for (const text of licenseList) {
    resolved.push({
      expression: resolveExpression(text),
      source: "license",
      text: text,
    });
  }

  if (readmeLicense) {
    resolved.push({
      expression: resolveExpression(readmeLicense),
      source: "readme",
      text: readmeLicense,
    });
  }

  return resolved;
}

async function tryDisk(path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, "utf8");
  } catch {}
}
