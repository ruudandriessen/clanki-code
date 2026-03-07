import { spawnSync } from "node:child_process";

type RunSetupCommandArgs = {
  command: string;
  directory: string;
};

export function runSetupCommand({ command, directory }: RunSetupCommandArgs): void {
  const trimmedCommand = command.trim();
  if (trimmedCommand.length === 0) {
    return;
  }

  const output = spawnSync("/bin/sh", ["-lc", trimmedCommand], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (output.error) {
    throw new Error(`Failed to run setup command "${trimmedCommand}": ${output.error.message}`);
  }

  if (output.status === 0) {
    return;
  }

  const stderr = output.stderr.trim();
  const stdout = output.stdout.trim();
  const details = stderr || stdout;

  throw new Error(
    details.length > 0
      ? `Setup command failed in ${directory}: ${details}`
      : `Setup command failed in ${directory} with exit code ${output.status ?? "unknown"}`,
  );
}
