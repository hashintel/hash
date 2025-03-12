/**
 * Pads a string to the right with spaces to reach the specified length
 */
const padRight = (str: string, length: number): string => {
  while (str.length < length) {
    // eslint-disable-next-line no-param-reassign
    str += " ";
  }
  return str;
};

/**
 * Adds (1) line numbers and (2) position numbers to git diff output.
 *
 * Each line in the diff is formatted as follows:
 *
 * [Old line number] [New line number]: [Content] [position: X]
 *
 * Position:
 * > The position value equals the number of lines down from the first "@@" hunk header in the file you want to add a comment.
 * > The line just below the "@@" line is position 1, the next line is position 2, and so on.
 * > The position in the diff continues to increase through lines of whitespace and additional hunks until the beginning of a new file.
 * @see https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28#create-a-review-for-a-pull-request
 *
 * Position is used when adding a comment on a PR diff as part of a PR review.
 * Old / new line numbers aren't currently used but I added them before I realized that position is used instead, keeping in case it's useful somewhere else.
 *
 * @param diffOutput - The raw git diff output as a string
 * @returns The formatted diff with position numbers
 */
export const addLineNumbersToDiff = (diffOutput: string): string => {
  const lines = diffOutput.split("\n");
  const formattedLines: string[] = [];

  let left = 0;
  let right = 0;
  let ll = 0; // Length of left line count
  let rl = 0; // Length of right line count
  let position = 0; // Position counter for GitHub API
  let inFile = false; // Whether we're currently in a file diff

  for (const line of lines) {
    // Check for file header to reset position counter
    if (line.startsWith("diff --git")) {
      inFile = true;
      position = 0; // Reset position counter for new file
      formattedLines.push(line);
      continue;
    }

    // Match the hunk header pattern: @@ -X,Y +A,B @@
    const hunkMatch = line.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);

    if (hunkMatch) {
      // Extract line numbers from hunk header
      left = parseInt(hunkMatch[1]!, 10);
      ll = hunkMatch[2]!.length;
      right = parseInt(hunkMatch[3]!, 10);
      rl = hunkMatch[4]!.length;

      // Ensure minimum width for better alignment
      ll = Math.max(ll, left.toString().length);
      rl = Math.max(rl, right.toString().length);

      // If this is the first hunk in a file, position will be 0
      // After this line, position will be 1 for the next line
      formattedLines.push(`${line} [position: ${position}]`);
      position++;
      continue;
    }

    // Handle file headers and other non-diff lines
    if (line.match(/^(---|\+\+\+|[^-+ ])/)) {
      formattedLines.push(line);
      // Don't increment position for file metadata lines
      continue;
    }

    // Skip empty lines but still count them for position
    if (line.length === 0) {
      formattedLines.push("");
      if (inFile) {
        position++;
      } // Still increment position for empty lines
      continue;
    }

    // Extract content without the first character (diff marker)
    const content = line.substring(1);

    // Handle removed lines (starting with -)
    if (line.startsWith("-")) {
      // Format: -leftNum      :content [pos: X]
      formattedLines.push(
        `-${padRight(left.toString(), ll)} ${padRight(
          "",
          rl,
        )}:${content} [pos: ${position}]`,
      );
      left++;
      position++;
      continue;
    }

    // Handle added lines (starting with +)
    if (line.startsWith("+")) {
      // Format: +      rightNum:content [pos: X]
      formattedLines.push(
        `+${padRight("", ll)} ${padRight(
          right.toString(),
          rl,
        )}:${content} [pos: ${position}]`,
      );
      right++;
      position++;
      continue;
    }

    // Handle context lines (starting with space)
    // Format: leftNum rightNum:content [pos: X]
    formattedLines.push(
      ` ${padRight(left.toString(), ll)} ${padRight(
        right.toString(),
        rl,
      )}:${content} [pos: ${position}]`,
    );
    left++;
    right++;
    position++;
  }

  return formattedLines.join("\n");
};
