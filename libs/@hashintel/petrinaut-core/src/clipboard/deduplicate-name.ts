/**
 * Generate a unique name by appending a numeric suffix if the name already exists.
 *
 * If the name ends with a number (e.g. "Place3"), the suffix increments from that
 * number. Otherwise a "2" suffix is appended (e.g. "Foo" → "Foo2").
 */
export function deduplicateName(
  name: string,
  existingNames: Set<string>,
): string {
  if (!existingNames.has(name)) {
    return name;
  }

  // Strip existing numeric suffix to get the base name
  const match = name.match(/^(.+?)(\d+)$/);
  const baseName = match ? match[1]! : name;
  const startNum = match ? Number(match[2]) + 1 : 2;

  for (let idx = startNum; ; idx++) {
    const candidate = `${baseName}${idx}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }
}
