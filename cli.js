#!/usr/bin/env node
import fs from "fs/promises";
import { ripAll, resolveLicense, getDefaultCacheFolder } from "./dist/index.js";
import spdxSatisifies from "spdx-satisfies";

const supportedArguments = {
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
  const options = {};

  for (const group of groupArgs()) {
    switch (group[0]) {
      case "--include-dev":
        options.includeDev = true;
        break;
      case "--include-homepage":
        options.includeHomepage = true;
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

  const results = await ripAll("./", options);

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
  let output;

  if (summary) {
    output = {};

    for (const result of results.resolved) {
      output[result.license] = (output[result.license] || 0) + 1;
    }
  } else if (compress) {
    output = {
      licenseText: {},
      packages: [],
    };

    const reverseLookup = {};

    for (const result of results.resolved) {
      const existingKey = reverseLookup[result.licenseText];

      if (!existingKey) {
        reverseLookup[result.licenseText] = result.name;
        output.licenseText[result.name] = result.licenseText;
      }

      output.packages.push({ ...result, licenseText: result.name });
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
    .filter((result) => result.license?.endsWith("*"))
    .map((result) => result.name);

  if (resolvedTypeFromText.length > 0) {
    console.warn(
      "\nwarning: resolved license from licenseText:",
      JSON.stringify(resolvedTypeFromText, null, 2)
    );
  }

  const mismatchedLicenses = results.resolved
    .filter((result) => {
      if (
        !result.license ||
        !result.licenseText ||
        result.license.endsWith("*")
      ) {
        // impossible to mismatch (ending with *, license is already the result of licenseText)
        // or does not matter (does not exist for comparison)
        return false;
      }

      const resolvedLicense = resolveLicense(result.licenseText);

      if (!resolvedLicense) {
        return true;
      }

      return !spdxSatisifies(result.license, resolvedLicense);
    })
    .map((result) => result.name);

  if (mismatchedLicenses.length > 0) {
    console.warn(
      "\nwarning: mismatched license and licenseText:",
      JSON.stringify(mismatchedLicenses, null, 2)
    );
  }

  // log errors
  if (
    results.errors.missingLicense.length > 0 ||
    results.errors.missingLicenseText.length > 0
  ) {
    console.error("\nerrors:", JSON.stringify(results.errors, null, 2));
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

    if (!argConfig) {
      console.error(`Unsupported argument '${arg}'`);
      process.exit(1);
    }

    expectedArgs = argConfig.args?.length || 0;

    processedArgs.push([arg]);
  }

  if (expectedArgs > 0) {
    console.error(
      "Missing argument for " + processedArgs[processedArgs.length - 1][0]
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
  console.log("Usage: license-ripper [OPTIONS]\n");
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
