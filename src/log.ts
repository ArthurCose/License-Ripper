import chalk from "chalk";

export function logError(...args: string[]) {
  console.error(chalk.red("error") + ":", ...args);
}

export function logWarning(...args: string[]) {
  console.warn(chalk.yellow("warning") + ":", ...args);
}
