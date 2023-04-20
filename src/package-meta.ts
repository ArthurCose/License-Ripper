export type PackageMeta = {
  name: string;
  version: string;
  homepage: string;
  funding: string | (string | { type: string; url: string })[];
  license?:
    | string
    | { type: string; url: string }
    | { type: string; url: string }[];
  repository?: string | { type: string; url: string };
  dependencies?: { [key: string]: any };
  peerDependencies?: { [key: string]: any };
  optionalDependencies?: { [key: string]: any };
};
