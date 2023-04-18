import * as fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import resolveLicense from "./resolve-license.js";
import { ripMarkdownLicense } from "./rip-markdown-license.js";
import spdxCorrect from "spdx-correct";

export type ResolvedPackage = {
  name: string;
  folder: string;
  license?: string;
  licenseText?: string;
  licenseTextSource?: "license" | "mixed" | "readme" | "override";
  homepage?: string;
  funding?: string[];
};

export type Options = {
  /** Adds a homepage key containing a URL string for relevant packages, defaults to false */
  includeHomepage?: boolean;
  /** Adds a funding key containing a list of URL strings for relevant packages, defaults to false */
  includeFunding?: boolean;
  /** Includes devDependencies in the output, defaults to false */
  includeDev?: boolean;
  /** Sets the text used to join multiple license files, defaults to "\n\n-\n\n" */
  joinText?: string;
  /** List of package names to exclude from results, used when the license is only provided from a parent package */
  exclude?: string[];
  /** Useful for getting rid of warnings and handling cases where the tool fails to grab the license */
  overrides?: {
    [packageName: string]: { license?: string; text?: string; file?: string };
  };
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

  const packageMeta = JSON.parse(packageJSON);

  if (options?.exclude?.includes(packageMeta.name)) {
    // checking for folder name above, but the folder name does not always match the package name.
    // from here on errors will use the proper package name since it can be resolved
    return;
  }

  let licenseText = await licenseTextFromOverride(packageMeta, options);
  let licenseTextSource;

  if (licenseText) {
    licenseTextSource = "override";
  } else {
    const result = await findLicenseText(packagePath, packageMeta, options);
    licenseText = result?.text;
    licenseTextSource = result?.source;
  }

  const overrides = options?.overrides?.[packageMeta.name];
  let license = overrides?.license || packageMeta.license;

  if (license) {
    license = spdxCorrect(license, { upgrade: false });
  } else if (licenseText) {
    license = resolveLicense(licenseText);

    if (license) {
      // mark this as modified
      license += "*";
    }
  }

  const output: ResolvedPackage = {
    name: packageMeta.name,
    folder: packagePath,
    license,
    licenseText,
    licenseTextSource,
  };

  if (options?.includeHomepage) {
    output.homepage = packageMeta.homepage;
  }

  if (packageMeta.funding && options?.includeFunding) {
    if (!Array.isArray(packageMeta)) {
      output.funding = [packageMeta.funding];
    }

    output.funding = output.funding.map((info: any) =>
      typeof info == "string" ? info : info.url
    );
  }

  return output;
}

async function licenseTextFromOverride(
  packageMeta,
  options?: Options
): Promise<string | undefined> {
  const override = options?.overrides?.[packageMeta.name];

  if (!override) {
    return;
  }

  if (override.file) {
    return await fs.readFile(override.file, "utf8");
  }

  return override.text;
}

async function findLicenseText(
  baseDir: string,
  packageMeta,
  options?: Options
) {
  // try grabbing the license from local files
  const localResult = await licenseFromFolder(
    await fs.readdir(baseDir),
    (name) => tryDisk(path.join(baseDir, name)),
    options
  );

  if (
    localResult &&
    (localResult.source != "readme" || resolveLicense(localResult.text))
  ) {
    // stop early if we have a valid result
    return localResult;
  }

  // try grabbing the license from the repo
  const repoUrl = resolveRepoUrl(packageMeta);
  const encodedRepoUrl = encodeURIComponent(repoUrl);

  const cachedResult = await licenseFromCache(encodedRepoUrl, options);

  if (cachedResult) {
    return cachedResult;
  }

  if (repoUrl) {
    const remoteResult = await licenseFromFolder(
      await readdirRemote(repoUrl),
      (name) => tryDownload(repoUrl, name),
      options
    );

    if (remoteResult) {
      cacheResult(encodedRepoUrl, remoteResult, options);
      return remoteResult;
    }

    if (localResult) {
      // cache our local result to reduce API usage
      cacheResult(encodedRepoUrl, localResult, options);
    }
  }

  return localResult;
}

async function licenseFromCache(name: string, options?: Options) {
  const cacheFolder = options?.cacheFolder;

  if (!cacheFolder) {
    return;
  }

  try {
    const text = await fs.readFile(path.join(cacheFolder, name), "utf8");

    return JSON.parse(text);
  } catch {
    // ok to fail, either it doesn't exist or we'll fix it when we cache new results
  }
}

async function cacheResult(name: string, data: any, options?: Options) {
  const cacheFolder = options?.cacheFolder;

  if (!cacheFolder) {
    return;
  }

  try {
    await fs.mkdir(cacheFolder, { recursive: true });
  } catch {
    // ignore errors as it may just complain about the folder already existing
  }

  try {
    await fs.writeFile(path.join(cacheFolder, name), JSON.stringify(data));
  } catch {
    // it's just cache, shouldn't matter too much
  }
}

async function licenseFromFolder(
  entries: string[],
  tryRead: (path: string) => Promise<string | undefined>,
  options?: Options
): Promise<{ text: string; source: string } | undefined> {
  let noticeList = [];
  let licenseList = [];
  let readmeLicense = "";

  for (const entry of entries) {
    const lowercaseName = entry.toLowerCase();

    // test as apache notice file
    if (lowercaseName.includes("notice")) {
      const text = await tryRead(entry);
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
      const text = await tryRead(entry);
      licenseList.push(text);
      continue;
    }

    // test as readme file
    if (lowercaseName.startsWith("readme")) {
      // overwrite the readme license text
      const text = await tryRead(entry);
      readmeLicense = ripMarkdownLicense(text);
    }
  }

  const joinText = options?.joinText || "\n\n-\n\n";

  if (licenseList.length > 0 && readmeLicense) {
    // prepend notice
    licenseList.unshift(...noticeList);
    // append readme license
    licenseList.push(readmeLicense);

    return { text: licenseList.join(joinText), source: "mixed" };
  } else if (licenseList.length > 0) {
    // prepend notice
    licenseList.unshift(...noticeList);

    return { text: licenseList.join(joinText), source: "license" };
  } else if (readmeLicense) {
    // prepend notice
    noticeList.push(readmeLicense);

    return {
      text: noticeList.join(joinText),
      source: "readme",
    };
  }
}

function resolveRepoUrl(packageMeta): string {
  let repoUrl: string | undefined =
    packageMeta.repository?.url || packageMeta.repository;

  if (!repoUrl) {
    return;
  }

  if (repoUrl.startsWith("git://")) {
    // swap git for https
    repoUrl = "https" + repoUrl.slice(3);
  }

  if (repoUrl.startsWith("git+")) {
    // drop git+ prefix
    repoUrl = repoUrl.slice(4);
  } else if (repoUrl.startsWith("git@")) {
    // drop git@ prefix
    repoUrl = "https://" + repoUrl.slice(4);
    repoUrl = repoUrl.replace(".com:", ".com/");
  }

  if (repoUrl.endsWith(".git")) {
    // drop .git suffix
    repoUrl = repoUrl.slice(0, -4);
  }

  if (!repoUrl.startsWith("http") && !repoUrl.includes("://")) {
    // assume github
    repoUrl = "https://github.com/" + repoUrl;
  }

  repoUrl = repoUrl.replace("//www.", "//");

  if (repoUrl.startsWith("https://github.com/")) {
    // get the root of the repo, fixes issues with tryDownload (HEAD) and readdirRemote (/repos/:user/:repo/contents/:path)
    // todo: might be a bad assumption, but license files tend to be in the root folder and this can lower api requests
    const index = nthIndexOf(repoUrl, "/", 4);

    if (index > -1) {
      repoUrl = repoUrl.slice(0, index);
    }
  }

  return repoUrl;
}

function nthIndexOf(text: string, searchString: string, n: number) {
  let index = -1;

  while (n-- >= 0) {
    index = text.indexOf(searchString, index + 1);

    if (index == -1) {
      break;
    }
  }

  return index;
}

async function tryDisk(path: string): Promise<string | undefined> {
  try {
    const buffer = await fs.readFile(path);
    return buffer.toString();
  } catch {}
}

async function tryDownload(
  repoUrl: string,
  name: string
): Promise<string | undefined> {
  try {
    // todo: gitlab
    repoUrl = repoUrl.replace("github.com", "raw.githubusercontent.com");

    const response = await fetch(repoUrl + "/HEAD/" + name);

    if (response.status == 200) {
      return response.text();
    }
  } catch {}
}

async function readdirRemote(url: string) {
  if (url.startsWith("https://github.com/")) {
    url = url.replace("https://github.com/", "https://api.github.com/repos/");
    url += "/contents";
  } else {
    // todo: gitlab
    return [];
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `"${url}" responded with ${response.status}:`,
        await response.text()
      );

      return [];
    }

    const contents = (await response.json()) as { name: string }[];

    return contents.map((file) => file.name);
  } catch {
    return [];
  }
}
