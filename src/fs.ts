import * as fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import { logError } from "./log.js";

export interface Fs {
  readFile(path: string): Promise<string | undefined>;
  readdir(): Promise<string[]>;
}

export class LocalFs implements Fs {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async readFile(filePath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(path.join(this.baseDir, filePath), "utf8");
    } catch {}
  }

  async readdir(): Promise<string[]> {
    return await fs.readdir(this.baseDir);
  }
}

export function resolveRemoteFs(repoUrl: string): Fs {
  if (repoUrl.startsWith("https://github.com/")) {
    return new GitHubFs(repoUrl);
  }
  if (repoUrl.startsWith("https://gitlab.com/")) {
    return new GitLabFs(repoUrl);
  }

  logError(`unsupported repository url \"${repoUrl}\"`);
  return new NullFs();
}

class NullFs implements Fs {
  async readFile(_path: string): Promise<string | undefined> {
    return undefined;
  }

  async readdir(): Promise<string[]> {
    return [];
  }
}

class GitHubFs implements Fs {
  private readFilePrefix: string;
  private readdirUrl: string;

  constructor(url: string) {
    this.readFilePrefix =
      url.replace("github.com", "raw.githubusercontent.com") + "/HEAD/";
    this.readdirUrl =
      url.replace("https://github.com/", "https://api.github.com/repos/") +
      "/contents";
  }

  async readFile(path: string): Promise<string> {
    try {
      const response = await fetch(this.readFilePrefix + path);

      if (response.status == 200) {
        return response.text();
      }
    } catch {}
  }

  async readdir(): Promise<string[]> {
    try {
      const response = await fetch(this.readdirUrl);

      if (!response.ok) {
        logError(
          `"${this.readdirUrl}" responded with ${response.status}\n` +
            (await response.text())
        );

        return [];
      }

      const contents = (await response.json()) as { name: string }[];

      return contents.map((file) => file.name);
    } catch {
      return [];
    }
  }
}

class GitLabFs {
  private readFilePrefix: string;
  private readdirUrl: string;

  constructor(url: string) {
    this.readFilePrefix = url + "/-/raw/master/";
    this.readdirUrl =
      "https://gitlab.com/api/v4/projects/" +
      encodeURIComponent(url.slice("https://gitlab.com/".length)) +
      "/repository/tree?per_page=100";
  }

  async readFile(path: string): Promise<string> {
    try {
      const response = await fetch(this.readFilePrefix + path);

      if (response.status == 200) {
        return response.text();
      }
    } catch {}
  }

  async readdir(): Promise<string[]> {
    const results = [];
    let nextUrl = this.readdirUrl;

    while (nextUrl) {
      try {
        const response = await fetch(nextUrl);

        if (!response.ok) {
          logError(
            `"${nextUrl}" responded with ${response.status}\n` +
              (await response.text())
          );
          break;
        }

        const linkHeader = response.headers.get("link");

        if (linkHeader) {
          // find the url relevant to the next page
          nextUrl = linkHeader
            .split(", ")
            .find((link) => link.endsWith('rel="next"'));

          // get the link within <>
          nextUrl = nextUrl?.slice(1, nextUrl.indexOf(">"));
        } else {
          nextUrl = undefined;
        }

        const contents = (await response.json()) as { name: string }[];

        for (const content of contents) {
          results.push(content.name);
        }
      } catch {
        break;
      }
    }

    return results;
  }
}
