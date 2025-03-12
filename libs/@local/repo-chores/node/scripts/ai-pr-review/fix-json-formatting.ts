import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import chalk from "chalk";

/**
 * Preprocesses the AI review response to fix a common formatting issue (arrays being returned as strings)
 */
export const fixJsonFormatting = (
  response: unknown,
): Record<string, unknown> => {
  if (typeof response !== "object" || response === null) {
    throw new Error("AI review response is not an object");
  }

  const processed: Record<string, unknown> = {
    ...(response as Record<string, unknown>),
  };

  // Fix arrays that are returned as strings
  for (const [key, value] of Object.entries(processed)) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmedValue = value.trim();

    if (trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) {
      try {
        // Attempt to parse the string as JSON
        processed[key] = JSON.parse(trimmedValue);
      } catch {
        console.warn(
          chalk.yellow(
            `Failed to parse string as JSON array for key "${key}". Attempting manual conversion...`,
          ),
        );

        // If JSON.parse fails, try to manually convert the string to an array
        try {
          // Handle the case where the array elements are objects
          if (trimmedValue.includes("{") && trimmedValue.includes("}")) {
            // Split by "},{"
            const items = trimmedValue
              .replace(/^\[\s*{/, "") // Remove leading [{
              .replace(/}\s*\]$/, "") // Remove trailing }]
              .split(/},\s*{/);

            const arrayItems = items.map((item) => {
              // Add back the curly braces
              const objectStr = item.startsWith("{") ? item : `{${item}`;
              const fullObjectStr = objectStr.endsWith("}")
                ? objectStr
                : `${objectStr}}`;

              try {
                // Use type assertion to avoid unsafe return
                return JSON.parse(fullObjectStr) as Record<string, unknown>;
              } catch {
                console.error(
                  chalk.red(`Failed to parse object: ${fullObjectStr}`),
                );
                process.exit(1);
                return null;
              }
            });

            processed[key] = arrayItems;
          } else {
            // Handle simpler arrays (strings, numbers, etc.)
            const items = trimmedValue
              .substring(1, trimmedValue.length - 1) // Remove [ and ]
              .split(",")
              .map((item) => item.trim());

            processed[key] = items.map((item) => {
              // Try to convert to appropriate type
              if (item.startsWith('"') && item.endsWith('"')) {
                return item.substring(1, item.length - 1); // Remove quotes
              }

              const num = Number(item);
              if (!Number.isNaN(num)) {
                return num;
              }

              if (item === "true") {
                return true;
              }
              if (item === "false") {
                return false;
              }
              if (item === "null") {
                return null;
              }

              return item;
            });
          }
        } catch (manualError) {
          console.error(
            chalk.red(
              `Failed manual conversion for key "${key}": ${stringifyError(
                manualError,
              )}`,
            ),
          );

          process.exit(1);
        }
      }
    }
  }

  return processed;
};
