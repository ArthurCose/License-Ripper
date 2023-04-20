import test from "ava";
import { ripOne } from "../src/rip-license.js";
import { getDefaultCacheFolder } from "../src/index.js";

const PACKAGE_FOLDER = "test/packages/";
const OPTIONS = {
  // ripOne does not call getDefaultCacheFolder, since it does not have access to the project root
  cacheFolder: getDefaultCacheFolder(""),
};

test("download-licenses", async (t) => {
  const packages = [
    ["dual-licensed-mit-apache-package", "(Apache-2.0 AND MIT AND UNKNOWN)*"],
    ["gitlab", "(UNKNOWN AND MIT)*"],
  ];

  for (const [folder, expected] of packages) {
    const resolvedPackage = await ripOne(PACKAGE_FOLDER + folder, OPTIONS);

    t.deepEqual(resolvedPackage?.licenseExpression, expected);
  }
});
