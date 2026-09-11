/**
 * Validate the scenario name: must be non-empty and unique among existing
 * scenarios (the caller excludes the one being edited from `existingNames`).
 */
export function validateScenarioName(
  name: string,
  existingNames: ReadonlySet<string>,
): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Scenario name is required.";
  }
  if (existingNames.has(trimmed)) {
    return `A scenario named "${trimmed}" already exists. Choose a unique name.`;
  }
  return undefined;
}
