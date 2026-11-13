/**
 * Names a running persona panel in `portless list`, as the slot's other dev
 * servers are. The alias is a separate origin from the launcher's browser, so
 * it shows the website without the run's stored net and settings: it is for
 * finding the run, not for driving it. Without portless the run goes on.
 */
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** `run-p1WuHd` becomes `run-p1wuhd.persona`, served at `https://run-p1wuhd.persona.localhost`. */
export const personaAliasName = (run: string) =>
  `${basename(run).toLowerCase()}.persona`;

const missingCommand = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/**
 * Registers the alias and returns its removal, or undefined when portless is
 * not installed or refuses; a refusal is reported, not thrown.
 */
export const registerPortlessAlias = async (
  name: string,
  port: number,
  report: (text: string) => void,
): Promise<(() => Promise<void>) | undefined> => {
  try {
    await execute("portless", ["alias", name, String(port)]);
  } catch (error) {
    if (!missingCommand(error))
      report(`portless did not register ${name}: ${String(error)}`);
    return undefined;
  }
  report(`portless: https://${name}.localhost`);
  return async () => {
    await execute("portless", ["alias", "--remove", name]).catch(
      (error: unknown) =>
        report(
          `portless did not remove ${name}; run \`portless alias --remove ${name}\`: ${String(error)}`,
        ),
    );
  };
};
