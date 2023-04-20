# License Ripper

Searches `node_modules` for licenses within loosely matched NOTICE, LICENSE/LICENCE, COPYING, and README files to automate most of the license compliance work, resolving package repositories and downloading copies if necessary.

Output should still be checked as it's possible for incomplete or incorrect data to pass through, some alternate package managers such as yarn are not yet supported, and some packages may even be skipped with globally installed packages. When used as a CLI program, it will warn when the "licenseText" does not appear to match with the license type, or if any license type was resolved using "licenseText" instead of `package.toml` (marked with a `*` at the end). These warnings can be resolved through the `overrides` config option to clear up any issues.

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
      --compress             Changes output to recycle licenseText, replacing the value with a key
      --include-dev          Includes dev dependencies in the output
      --include-homepage     Adds a homepage key containing a URL string for relevant packages
      --include-funding      Adds a funding key containing a list of URL strings for relevant packages
      --summary              Changes output to count licenses grouped by name
      --clean                Deletes cached licenses instead of resolving licenses
  -v, --version
  -h, --help
```

## Config/Options:

```ts
{
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
}
```

## Library Usage

```js
const { ripAll } = require("license-ripper");

const projectRoot = "";
const options = { includeHomepage: true };
const results = ripAll(projectRoot, options);

console.log(JSON.stringify(results, null, 2));
// [
//   {
//     "name": "@types/marked",
//     "folder": "node_modules/@types/marked",
//     "license": "MIT",
//     "licenseText": "    MIT License ...",
//     "licenseTextSource": "license"
//   },
//   ...
//   {
//     "name": "data-uri-to-buffer",
//     "folder": "node_modules/data-uri-to-buffer",
//     "license": "MIT",
//     "licenseText": "License\n-------\n\n(The MIT License) ...",
//     "licenseTextSource": "readme"
//   },
//   ...
//
```
