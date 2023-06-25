# License Ripper

Searches `node_modules` for licenses within loosely matched NOTICE, LICENSE/LICENCE, COPYING, and README files to automate most of the license compliance work, resolving package repositories and downloading copies if necessary.

Output should still be checked as it's possible for incomplete or incorrect data to pass through, some alternate package managers such as yarn are not yet supported, and some packages may even be skipped with globally installed packages. When used as a CLI program, it will warn when license text does not appear to match with the license type, or if any license type was resolved using license text instead of `package.toml` (marked with a `*` at the end). These warnings can be resolved through the `overrides` config option to clear up any issues.

Similar tools exist such as [license-checker](https://www.npmjs.com/package/license-checker) and [license-report](https://www.npmjs.com/package/license-report) exist, however the primary purpose of these other tools is to report the license type of other packages and will at most allow you to see where you can access the license.

If you're using webpack, [webpack-license-plugin](https://github.com/codepunkt/webpack-license-plugin) is a more mature library that provides license text and hooks into webpack to [resolve only the packages that make it to the final build](https://github.com/davglass/license-checker/issues/245#issuecomment-1254590401), useful when there's package licenses you can't comply with (such as GPL/LGPL) that are only used as development tools or server side.

## Supported Package Managers

- npm
- pnpm
- yarn classic

## CLI

`npm install -g license-ripper` or `npm install -D license-ripper` for package local usage with npx.

```
Usage: license-ripper [OPTIONS] [PROJECT_ROOT]

Options:
  -o, --output <FILE_NAME>   Writes output to a file rather than stdout
      --config <FILE_NAME>   Passes the file as ripAll's options parameter
      --compress             Changes output to recycle license text, replacing the value with a key
      --include-dev          Includes dev dependencies in the output
      --include-homepage     Adds a homepage key containing a URL string for relevant packages
      --include-repository   Adds a repository key containing a URL string for relevant packages
      --include-funding      Adds a funding key containing a list of URL strings for relevant packages
      --include-description  Adds a description key containing containing the description stored in package.json
      --include <NAMES>      Include only packages with a match in NAMES, a comma separated list of package names
      --exclude <NAMES>      Exclude packages matching NAMES, a comma separated list of package names
      --summary              Changes output to count licenses grouped by name
      --clean                Deletes cached licenses instead of resolving licenses
  -v, --version
  -h, --help
```

## Config/Options:

```ts
export type Options = {
  /** Adds a homepage key containing a URL string for relevant packages, defaults to false */
  includeHomepage?: boolean;
  /** Adds a repository key containing a URL string for relevant packages, defaults to false */
  includeRepository?: boolean;
  /** Adds a funding key containing a list of URL strings for relevant packages, defaults to false */
  includeFunding?: boolean;
  /** Adds a description key containing the description stored in package.json, defaults to false */
  includeDescription?: boolean;
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
    description?: string;
  }[];
  /** Defaults to [projectRoot]/node_modules/.cache/license-ripper */
  cacheFolder?: string;
};

export type ForcedLicense = {
  expression?: string;
  text?: string;
  file?: string;
};
```

## Library Usage

```js
import { ripAll } from "./dist/index.js";

const projectRoot = "";
const options = { includeRepository: true };
const results = await ripAll(projectRoot, options);

console.log(JSON.stringify(results.resolved, null, 2));
// [
//   {
//     "name": "array-find-index",
//     "version": "1.0.2",
//     "path": "node_modules/array-find-index",
//     "licenseExpression": "MIT",
//     "licenses": [
//       {
//         "expression": "MIT",
//         "source": "license",
//         "text": "The MIT License (MIT) ..."
//       },
//       {
//         "expression": "UNKNOWN",
//         "source": "readme",
//         "text": "## License\n\nMIT © [Sindre Sorhus](https://sindresorhus.com)\n"
//       }
//     ],
//     "repository": "https://github.com/sindresorhus/array-find-index"
//   },
//   ...
//
```
