import { PackageMeta } from "./package-meta.js";

export default function normalizePackageRepo(
  packageMeta: PackageMeta
): string | undefined {
  let url: string | undefined =
    typeof packageMeta.repository == "object"
      ? packageMeta.repository?.url
      : packageMeta.repository;

  if (!url) {
    return;
  }

  return normalizeRepoUrl(url);
}

function normalizeRepoUrl(url: string) {
  if (
    url.startsWith("git://github.com/") ||
    url.startsWith("git://gitlab.com/")
  ) {
    // swap git for https
    url = "https" + url.slice(3);
  } else if (
    url.startsWith("git@github.com:") ||
    url.startsWith("git@gitlab.com:")
  ) {
    // drop git@ prefix
    url = "https://" + url.slice(4).replace(":", "/");
  } else if (url.startsWith("git+")) {
    // drop git+ prefix
    url = url.slice(4);

    if (url.startsWith("ssh://")) {
      // search for a username in the url and strip it
      const PROTOCOL_LEN = 5;
      const endIndex = Math.max(
        url.indexOf("@", PROTOCOL_LEN) + 1,
        PROTOCOL_LEN
      );

      // swap ssh for https as ssh is incompatible
      url = "https://" + url.slice(endIndex);
    }
  } else if (url.startsWith("github:")) {
    url = "https://github.com/" + url.slice(7);
  } else if (url.startsWith("gitlab:")) {
    url = "https://gitlab.com/" + url.slice(7);
  } else if (url.startsWith("bitbucket:")) {
    url = "https://bitbucket.com/" + url.slice(10);
  } else if (!url.startsWith("http") && !url.includes("://")) {
    // assume github
    url = "https://github.com/" + url;
  }

  // drop www
  url = url.replace("://www.", "://");
  // require https
  url = url.replace("http://", "https://");

  if (
    url.startsWith("https://github.com/") ||
    url.startsWith("https://gitlab.com/")
  ) {
    if (url.endsWith(".git")) {
      // drop .git suffix
      url = url.slice(0, -4);
    }

    // get the root of the repo, fixes issues with tryDownload (HEAD) and readdirRemote (/repos/:user/:repo/contents/:path)
    // todo: might be a bad assumption, but license files tend to be in the root folder and this can lower api requests
    const index = nthIndexOf(url, "/", 4);

    if (index > -1) {
      url = url.slice(0, index);
    }
  }

  return url;
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
