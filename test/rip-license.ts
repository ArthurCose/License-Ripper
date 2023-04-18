import test from "ava";
import { ripOne } from "../src/rip-license.js";

test("download-licenses", async (t) => {
  const resolvedPackage = await ripOne("test/dual-licensed-mit-apache-package");

  t.deepEqual(resolvedPackage?.license, "(Apache-2.0 AND MIT)*");
});
