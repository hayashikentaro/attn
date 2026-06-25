import {
  formatEnvReport,
  getEnvReport,
  parseEnvTarget
} from "../lib/env-validation";

const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
const target = parseEnvTarget(targetArg?.split("=")[1]);
const strict = process.argv.includes("--strict");
const report = getEnvReport(process.env, target);

console.log(formatEnvReport(report));

if (strict && !report.ok) {
  process.exitCode = 1;
}
