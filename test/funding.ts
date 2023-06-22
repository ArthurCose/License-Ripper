import test from "ava";
import { ripOne } from "../src/rip-license.js";
import { getDefaultCacheFolder } from "../dist/index.js";

const PACKAGE_FOLDER = "test/packages/";
const OPTIONS = {
  // ripOne does not call getDefaultCacheFolder, since it does not have access to the project root
  cacheFolder: getDefaultCacheFolder(""),
  includeFunding: true,
};

test("funding", async (t) => {
  const packages = [
    ["funding-object-array", ["https://hello", "https://world"]],
    ["funding-array", ["https://hello", "https://world"]],
    ["funding-one", ["https://hello"]],
  ];

  for (const [folder, expected] of packages) {
    const resolvedPackage = await ripOne(PACKAGE_FOLDER + folder, OPTIONS);

    t.deepEqual(resolvedPackage?.funding, expected);
  }
});
