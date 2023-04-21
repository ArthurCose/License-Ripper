import * as fs from "fs/promises";
import resolveExpression from "./resolve-expression.js";
import { Options, ResolvedLicense } from "./rip-license.js";

// make sure to update the README if this changes
export type ForcedLicense = {
  expression?: string;
  text?: string;
  file?: string;
};

export default async function loadForcedLicenses(
  forcedLicenses: ForcedLicense[]
): Promise<ResolvedLicense[]> {
  const resolved: ResolvedLicense[] = [];

  for (const template of forcedLicenses) {
    const license: ResolvedLicense = {
      expression: "UNKNOWN",
      source: "forced",
      text: "",
    };

    if (template.file) {
      license.text = await fs.readFile(template.file, "utf8");
    } else if (template.text) {
      license.text = template.text;
    }

    if (template.expression) {
      license.expression = template.expression;
    } else if (license.text) {
      resolveExpression(license.text);
    }

    resolved.push(license);
  }

  return resolved;
}
