#!/usr/bin/env node
import fs from "fs/promises";
import { ripAll, getDefaultCacheFolder, Options } from "./index.js";
import { mergeExpressions } from "./resolve-expression.js";
import spdxSatisifies from "spdx-satisfies";
import chalk from "chalk";
import { logError, logWarning } from "./log.js";

type ArgumentConfig = {
  args?: string[];
  alternate?: string;
  description?: string;
  hidden?: true;
};

const supportedArguments: { [key: string]: ArgumentConfig } = {
  "--output": {
    args: ["FILE_NAME"],
    alternate: "-o",
    description: "Writes output to a file rather than stdout",
  },
  "-o": { hidden: true, args: ["FILE_NAME"] },
  "--config": {
    args: ["FILE_NAME"],
    description: "Passes the file as ripAll's options parameter",
  },
  "--compress": {
    description:
      "Changes output to recycle licenseText, replacing the value with a key",
  },
  "--include-dev": {
    description: "Includes dev dependencies in the output",
  },
  "--include-homepage": {
    description:
      "Adds a homepage key containing a URL string for relevant packages",
  },
  "--include-repository": {
    description:
      "Adds a repository key containing a URL string for relevant packages",
  },
  "--include-funding": {
    description:
      "Adds a funding key containing a list of URL strings for relevant packages",
  },
  "--summary": {
    description: "Changes output to count licenses grouped by name",
  },
  "--clean": {
    description: "Deletes cached licenses instead of resolving licenses",
  },
  "--version": { alternate: "-v" },
  "-v": { hidden: true },
  "--help": { alternate: "-h" },
  "-h": { hidden: true },
};

async function main() {
  let summary = false;
  let compress = false;
  let clean = false;
  let outputFile;
  let projectRoot = "";
  const options: Options = {};

  for (const group of groupArgs()) {
    switch (group[0]) {
      case "--include-dev":
        options.includeDev = true;
        break;
      case "--include-homepage":
        options.includeHomepage = true;
        break;
      case "--include-repository":
        options.includeRepository = true;
        break;
      case "--include-funding":
        options.includeHomepage = true;
        break;

      case "--summary":
        summary = true;
        break;

      case "--compress":
        compress = true;
        break;

      case "-o":
      case "--output":
        outputFile = group[1];
        break;

      case "--config":
        const config = JSON.parse(await fs.readFile(group[1], "utf8"));
        Object.assign(options, config);
        break;

      case "--clean":
        clean = true;
        break;

      case "-v":
      case "--version":
        await printVersion();
        return;

      case "-h":
      case "--help":
        printHelp();
        return;

      default:
        if (group[0].startsWith("-")) {
          logError(`unsupported argument '${group[0]}'`);
          process.exit(1);
        }
        projectRoot = group[0];
    }
  }

  if (clean) {
    const cacheFolder = getDefaultCacheFolder("./");

    try {
      await fs.rm(cacheFolder, { recursive: true });
    } catch {
      // probably doesn't exist already, just ignore
    }

    return;
  }

  const results = await ripAll(projectRoot, options);

  // sort results
  results.resolved.sort((a, b) => {
    if (a.name == b.name) {
      return 0;
    } else if (a.name < b.name) {
      return -1;
    } else {
      return 1;
    }
  });

  // resolve output
  let output: any;

  if (summary) {
    output = {};

    for (const result of results.resolved) {
      output[result.licenseExpression] =
        (output[result.licenseExpression] || 0) + 1;
    }
  } else if (compress) {
    output = {
      licenseText: {},
      packages: [],
    };

    const reverseLookup: { [key: string]: string } = {};

    for (const result of results.resolved) {
      const licenses = [];

      for (let i = 0; i < result.licenses.length; i++) {
        const license = result.licenses[i];
        let key = reverseLookup[license.text];

        if (!key) {
          key = `${result.name}@${result.version}/${i}`;
          reverseLookup[license.text] = key;
          output.licenseText[key] = license.text;
        }

        licenses.push({ ...license, text: key });
      }

      output.packages.push({ ...result, licenses });
    }
  } else {
    output = results.resolved;
  }

  // write output
  if (outputFile) {
    await fs.writeFile(outputFile, JSON.stringify(output));
  } else {
    console.log(JSON.stringify(output, null, 2));
  }

  // log warnings
  const resolvedTypeFromText = results.resolved
    .filter((result) => result.licenseExpression.endsWith("*"))
    .map((result) => result.name);

  if (resolvedTypeFromText.length > 0) {
    logWarning(
      "resolved license expression from text:\n  " +
        resolvedTypeFromText.join("\n  ")
    );
  }

  const mismatchedLicenses = results.resolved
    // filter out anything impossible to mismatch (ending with *, license is already the result of licenseText)
    .filter((result) => !result.licenseExpression.endsWith("*"))
    // map for filtering + later usage
    .map((result) => [
      chalk.blue(result.name),
      result.licenseExpression,
      mergeExpressions(result.licenses),
    ])
    // filter for just mismatched expressions
    .filter(([styledName, expression, resolvedExpression]) => {
      if (expression.startsWith("SEE LICENSE IN")) {
        // clearly custom
        return false;
      }

      if (resolvedExpression.includes("UNKNOWN")) {
        // impossible to match
        return true;
      }

      try {
        return !spdxSatisifies(expression, resolvedExpression);
      } catch (e) {
        // invalid spdx
        logError(
          `failed to parse \"${expression}\" from ${styledName}:\n` + e.message
        );

        // can never match with an invalid spdx expression
        return true;
      }
    })
    .map(
      ([styledName, expression, resolvedExpression]) =>
        `${styledName}: defined: "${expression}", resolved: "${resolvedExpression}"`
    );

  if (mismatchedLicenses.length > 0) {
    logWarning(
      "mismatched license expression and text:\n  " +
        mismatchedLicenses.join("\n  ")
    );
  }

  // log errors
  let hasErrors = false;

  if (results.errors.invalidLicense.length > 0) {
    logError(
      "invalid license:\n  " +
        chalk.blue(results.errors.invalidLicense.join("\n  "))
    );
    hasErrors = true;
  }

  if (results.errors.missingLicenseText.length > 0) {
    logError(
      "missing license text:\n  " +
        chalk.blue(results.errors.missingLicenseText.join("\n  "))
    );
    hasErrors = true;
  }

  if (hasErrors) {
    process.exit(1);
  }
}

main();

function groupArgs() {
  const processedArgs = [];
  let expectedArgs = 0;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (expectedArgs > 0) {
      processedArgs[processedArgs.length - 1].push(arg);
      expectedArgs -= 1;
      continue;
    }

    const argConfig = supportedArguments[arg];
    expectedArgs = argConfig?.args?.length || 0;

    processedArgs.push([arg]);
  }

  if (expectedArgs > 0) {
    logError(
      "missing argument for " + processedArgs[processedArgs.length - 1][0]
    );
    process.exit(1);
  }

  return processedArgs;
}

async function printVersion() {
  const packageJson = await fs.readFile("./package.json", "utf8");
  const packageMeta = JSON.parse(packageJson);
  console.log(`${packageMeta.name} ${packageMeta.version}`);
}

function printHelp() {
  console.log("Usage: license-ripper [OPTIONS] [PROJECT_ROOT]\n");
  console.log("Options:");

  const argsHelp = [];
  let widestHelpLength = 0;

  for (const key in supportedArguments) {
    const argConfig = supportedArguments[key];

    if (argConfig.hidden) {
      continue;
    }

    // document arg name
    const alternate = argConfig.alternate ? argConfig.alternate + "," : "   ";
    let text = "  " + alternate + " " + key + " ";

    // document arg's args
    if (argConfig.args) {
      for (const name of argConfig.args) {
        text += `<${name}> `;
      }
    }

    // store for later processing
    argsHelp.push([key, text]);

    // track largest help length
    if (text.length > widestHelpLength) {
      widestHelpLength = text.length;
    }
  }

  for (const [key, text] of argsHelp) {
    const argConfig = supportedArguments[key];
    const description = argConfig.description || "";

    console.log(text.padEnd(widestHelpLength + 2) + description);
  }
}
