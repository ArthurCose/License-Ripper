import path from "path";
import * as fs from "fs/promises";
import { Options, ResolvedLicense } from "./rip-license.js";

const CACHE_VERSION = 0;

export function getDefaultCacheFolder(projectRoot: string): string {
  return path.join(projectRoot, "node_modules", ".cache", "license-ripper");
}

export async function licenseFromCache(
  name: string,
  options?: Options
): Promise<ResolvedLicense[] | undefined> {
  const cacheFolder = options?.cacheFolder;

  if (!cacheFolder) {
    return;
  }

  try {
    const text = await fs.readFile(path.join(cacheFolder, name), "utf8");

    const cachedData = JSON.parse(text);

    if (cachedData.version != CACHE_VERSION) {
      return;
    }

    return cachedData.data as ResolvedLicense[];
  } catch {
    // ok to fail, either it doesn't exist or we'll fix it when we cache new results
  }
}

export async function cacheResult(
  name: string,
  data: ResolvedLicense[],
  options?: Options
) {
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
    await fs.writeFile(
      path.join(cacheFolder, name),
      JSON.stringify({ version: CACHE_VERSION, data })
    );
  } catch {
    // it's just cache, shouldn't matter too much
  }
}
