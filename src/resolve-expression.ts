import { ResolvedLicense } from "./rip-license.js";

const AFL2_1 = ["Licensed under the Academic Free License version 2.1"];
const AFL3 = ["Licensed under the Academic Free License version 3.0"];

const APACHE2_LINKS = ["http://www.apache.org/licenses/LICENSE-2.0"];
const APACHE2 = [
  [
    "Apache License",
    "Version 2.0, January 2004",
    "http://www.apache.org/licenses/",
  ].join(" "),

  "You must give any other recipients of the Work or Derivative Works a copy of this License",
  "You must cause any modified files to carry prominent notices stating that You changed the files",
  "You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work",
  'If the Work includes a "NOTICE" text file as part of its distribution,',
];

const EUPL1_1 = ["Licensed under the EUPL V.1.1"];

const BSD0 = [
  [
    "Permission to use, copy, modify, and/or distribute this software for any",
    "purpose with or without fee is hereby granted.",

    "THE SOFTWARE IS PROVIDED",
  ].join(" "),
];

const BSD1 = [
  "Redistribution and use",
  // `of this software`, yahoo includes, some others don't
  [
    "in source and binary forms, with or without",
    "modification, are permitted provided that the following conditions",
    "are met:",
  ].join(" "),

  [
    "Redistributions of source code must retain the above copyright",
    "notice, this list of conditions and the following disclaimer.",
  ].join(" "),
];

const BSD2 = [
  [
    "Redistributions in binary form must reproduce the above copyright",
    "notice, this list of conditions and the following disclaimer in the",
    "documentation and/or other materials provided with the distribution.",
  ].join(" "),
];

const BSD3 = ["endorse or promote"];

const CC0_LINKS = ["https://creativecommons.org/publicdomain/zero/1.0/deed"];
const CC0_1_0 = [
  "Affirmer understands and acknowledges that Creative Commons is not a party to this document and has no duty or obligation with respect to this CC0 or use of the Work.",
];

const CC_BY_3_LINKS = ["http://spdx.org/licenses/CC-BY-3.0"];
const CC_BY_4 = [
  [
    "Creative Commons Attribution 4.0 International Public License",

    "By exercising the Licensed Rights (defined below), You accept and agree",
    "to be bound by the terms and conditions of this Creative Commons",
    'Attribution 4.0 International Public License ("Public License"). To the',
  ].join(" "),
];

const GPL3 = [
  '"This License" refers to version 3 of the GNU General Public License.',
];

const LGPL3 = [
  '"this License" refers to version 3 of the GNU Lesser General Public License',
];

const LGPL2_1 = [
  [
    "[This is the first released version of the Lesser GPL. It also counts",
    "as the successor of the GNU Library Public License, version 2, hence",
    "the version number 2.1.]",
  ].join(" "),
];

const ISC = [
  [
    "Permission to use, copy, modify, and/or distribute this software for any",
    "purpose with or without fee is hereby granted, provided that the above",
    "copyright notice and this permission notice appear in all copies.",
  ].join(" "),
];

const MIT_LINKS = [
  "http://www.opensource.org/licenses/mit-license.php",
  "http://opensource.org/licenses/MIT",
];

const MIT = [
  "Permission is hereby granted, free of charge,",
  // `to any person`
  "obtaining",
  // `a copy of this`
  "software",
  // `and associated`
  "documentation",
  // `files (the "Software"), to deal in the Software without restriction,`
  // `including without limitation the rights to`
  "use",
  "copy",
  "modify",
  "merge",
  "publish",
  "distribute",
  // i've seen both `sublicense` and `sub-license`
  "sub",
  "license",
  // and//or
  "sell",
  // `copies of the Software, and to permit persons to whom the Software is`
  // `furnished to do so, subject to the following conditions:`

  "The above copyright notice and this permission notice",
  // shall be included in all copies or substantial portions of the Software
];

const UNLICENSE = [
  "This is free and unencumbered software released into the public domain.",
];

const ZLIB = [
  [
    "Permission is granted to anyone to use this software for any purpose,",
    "including commercial applications, and to alter it and redistribute it",
    "freely, subject to the following restrictions:",
  ].join(" "),

  [
    "The origin of this software must not be misrepresented; you must not",
    "claim that you wrote the original software. If you use this software",
    "in a product, an acknowledgment in the product documentation would be",
    "appreciated but is not required.",
  ].join(" "),

  [
    "Altered source versions must be plainly marked as such, and must not be",
    "misrepresented as being the original software.",
  ].join(" "),

  "This notice may not be removed or altered from any source distribution.",
];

export default function resolveExpression(
  licenseText: string
): string | undefined {
  // simplify testing
  licenseText = licenseText.replace(/[\r\n\s]+/g, " ");

  const matches = [];

  // try to resolve license from license text
  if (includesSequential(licenseText, AFL3)) {
    matches.push("AFL-3.0");
  } else if (includesSequential(licenseText, AFL2_1)) {
    matches.push("AFL-2.1");
  }

  if (
    APACHE2_LINKS.some((link) => licenseText.includes(link)) ||
    includesSequential(licenseText, APACHE2)
  ) {
    matches.push("Apache-2.0");
  }

  if (includesSequential(licenseText, BSD0)) {
    matches.push("0BSD");
  }

  if (includesSequential(licenseText, BSD1)) {
    if (includesSequential(licenseText, BSD3)) {
      matches.push("BSD-3-Clause");
    } else if (includesSequential(licenseText, BSD2)) {
      matches.push("BSD-2-Clause");
    } else {
      matches.push("BSD-1-Clause");
    }
  }

  if (
    CC0_LINKS.some((link) => licenseText.includes(link)) ||
    includesSequential(licenseText, CC0_1_0)
  ) {
    matches.push("CC0-1.0");
  }

  if (CC_BY_3_LINKS.some((link) => licenseText.includes(link))) {
    matches.push("CC-BY-3.0");
  }

  if (includesSequential(licenseText, CC_BY_4)) {
    matches.push("CC-BY-4.0");
  }

  if (includesSequential(licenseText, EUPL1_1)) {
    matches.push("EUPL-1.1");
  }

  if (includesSequential(licenseText, GPL3)) {
    matches.push("GPL-3.0-only");
  } else if (includesSequential(licenseText, LGPL3)) {
    matches.push("LGPL-3.0-only");
  } else if (includesSequential(licenseText, LGPL2_1)) {
    matches.push("LGPL-2.1-only");
  }

  if (includesSequential(licenseText, ISC)) {
    matches.push("ISC");
  }

  if (
    MIT_LINKS.some((link) => licenseText.includes(link)) ||
    includesSequential(licenseText, MIT)
  ) {
    matches.push("MIT");
  }

  if (includesSequential(licenseText, UNLICENSE)) {
    matches.push("Unlicense");
  }

  if (includesSequential(licenseText, ZLIB)) {
    matches.push("Zlib");
  }

  if (matches.length <= 1) {
    return matches[0] || "UNKNOWN";
  }

  // use AND to be as strict as possible, the user can override with OR if we're incorrect
  return "(" + matches.join(" AND ") + ")";
}

function includesSequential(text: string, searchList: string[]): boolean {
  let latestIndex = 0;

  return searchList.every((line) => {
    latestIndex = text.indexOf(line, latestIndex);

    if (latestIndex == -1) {
      return false;
    }

    latestIndex += line.length;

    return true;
  });
}

export function mergeExpressions(licenses: ResolvedLicense[]): string {
  const identifiers: string[] = [];

  for (const license of licenses) {
    if (!license.expression) {
      // occurs when license.type == "notice"
      continue;
    }

    if (license.source == "readme" && license.expression == "UNKNOWN") {
      // ignore UNKNOWN readme licenses, as they might just contain a simple reference: MIT
      continue;
    }

    if (!license.expression.startsWith("(")) {
      if (!identifiers.includes(license.expression)) {
        identifiers.push(license.expression);
      }

      continue;
    }

    const expressionIdentifiers = license.expression
      .slice(1, -1)
      .split(" AND ");

    for (const identifier of expressionIdentifiers) {
      if (!identifiers.includes(identifier)) {
        identifiers.push(identifier);
      }
    }
  }

  if (identifiers.length <= 1) {
    return identifiers[0] || "UNKNOWN";
  }

  // use AND to be as strict as possible, the user can override with OR if we're incorrect
  return "(" + identifiers.join(" AND ") + ")";
}
