import fs from "fs/promises";
import test from "ava";
import resolveLicenseExpression from "../src/resolve-expression.js";
import { ripMarkdownLicense } from "../src/rip-markdown-license.js";
import spdxCorrect from "spdx-correct";

const LICENSE_FOLDER = "test/licenses/";

test("resolve-license", async (t) => {
  const files = [
    ["0BSD-tslib.txt", "0BSD"],
    ["AFL-2.1-BSD3-json-scheme.txt", "(AFL-2.1 AND BSD-3-Clause)"],
    ["Apache-2.0-ampproject-remapping.txt", "Apache-2.0"],
    ["Apache-2.0-aws-invalid-dependency.txt", "Apache-2.0"],
    ["Apache-2.0-aws-sign2.txt", "Apache-2.0"],
    ["Apache-2.0-caseless.txt", "Apache-2.0"],
    ["BlueOak-1.0.0-jackspeak.md", "BlueOak-1.0.0"],
    ["BSD3-bcrypt-nodejs.txt", "BSD-3-Clause"],
    ["BSD3-hoist-non-react-statics.txt", "BSD-3-Clause"],
    ["CC0-1.0-mdn-data.txt", "CC0-1.0"],
    ["CC-BY-3.0-atob.txt", "CC-BY-3.0"],
    ["EUPL-1.1-mimelib.txt", "EUPL-1.1"],
    ["GPL-3.0.txt", "GPL-3.0-only"],
    ["LGPL-2.1-mhalo.kindeditor.txt", "LGPL-2.1-only"],
    ["LGPL-3-repositive-query-parser.txt", "LGPL-3.0-only"],
    ["MIT-ava.txt", "MIT"],
    ["MIT-jsbn.txt", "MIT"],
    ["MIT-min-document.txt", "MIT"],
    ["MIT-source-map-support.txt", "MIT"],
    ["MIT-unquote.txt", "MIT"],
    ["MIT-xmlhttprequest-ssl.txt", "MIT"],
    ["Unlicense-stackframe.txt", "Unlicense"],
  ];

  for (const [path, expected] of files) {
    const text = await fs.readFile(LICENSE_FOLDER + path, "utf8");

    t.deepEqual(
      resolveLicenseExpression(text),
      spdxCorrect(expected, { upgrade: false }),
      path
    );
  }
});

test("resolve-readme-license", async (t) => {
  const files = [
    ["MIT-brorand-README.md", "MIT"],
    ["MIT-errno-README.md", "MIT"],
  ];

  for (const [path, expected] of files) {
    const text = await fs.readFile(LICENSE_FOLDER + path, "utf8");
    const licenseText = ripMarkdownLicense(text);

    t.assert(licenseText != undefined);

    t.deepEqual(
      resolveLicenseExpression(licenseText!),
      spdxCorrect(expected, { upgrade: false }),
      path
    );
  }
});
