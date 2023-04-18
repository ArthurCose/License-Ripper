import { Lexer } from "marked";

export function ripMarkdownLicense(readmeText: string): string | undefined {
  const lexer = new Lexer();
  let licenseText = "";
  let licenseDepth = 0;

  for (const token of lexer.lex(readmeText)) {
    if (token.type == "heading") {
      const lowercaseText = token.text.toLowerCase();

      if (
        lowercaseText.includes("licens") ||
        lowercaseText.includes("licenc")
      ) {
        // entered license
        licenseDepth = token.depth;
      } else if (token.depth == licenseDepth) {
        // escaped license
        return licenseText;
      }

      // fallthrough, including headers in licenses in case of multiple licenses
    }

    if (licenseDepth > 0) {
      licenseText += token.raw;
    }
  }

  return licenseText ? licenseText : undefined;
}
