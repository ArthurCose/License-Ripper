import { PackageMeta } from "./package-meta.js";

export default function normalizePackageLicense(
  packageMeta: PackageMeta
): string | undefined {
  const metaLicense = packageMeta.license;

  if (!metaLicense) {
    return;
  }

  if (typeof metaLicense == "string") {
    return metaLicense;
  }

  if (!Array.isArray(metaLicense)) {
    return metaLicense.type;
  }

  // assuming the stricter option by using AND
  return metaLicense.map((license) => license.type).join("AND");
}
