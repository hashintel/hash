/**
 * WGSL identifier and comment hygiene.
 *
 * User code names bindings freely, but WGSL reserves a large vocabulary — far
 * more than JavaScript does, and including innocuous words like `active`,
 * `sample`, `filter` and `buffer` that real model code plausibly uses. A
 * collision is a shader compile error, which surfaces as a broken simulation
 * rather than a diagnostic, so every emitted name is mangled rather than
 * checked against the list case by case.
 */

/**
 * Mangles a user-authored name into a WGSL identifier.
 *
 * Every name is prefixed rather than only the reserved ones, so a model that
 * happens to use a future reserved word does not start failing when the WGSL
 * vocabulary grows. Characters WGSL does not accept are replaced, and a
 * disambiguating ordinal keeps two names that sanitize alike apart.
 *
 * The ordinal only disambiguates names from **one** emitter. Two emitters both
 * counting from zero produce the same identifiers, which is an error if their
 * statements land in one WGSL scope — as the RK stages of a dynamics loop do.
 * Such callers must pass a `scope` that differs per emitter.
 */
export function mangleWgslIdentifier(
  name: string,
  ordinal: number,
  scope = "",
): string {
  const sanitized = name.replaceAll(/[^A-Za-z0-9_]/gu, "_");
  return `${scope}u_${ordinal}_${sanitized}`;
}

/**
 * Strips line terminators from a user-authored name spliced into a WGSL line
 * comment.
 *
 * A line comment runs to the next line break, so a name containing one ends
 * the comment early and drops the rest of the name into the shader as code.
 * Every other channel from user data goes through `mangleWgslIdentifier`;
 * comments are the one place raw text reaches the shader, and names are
 * unconstrained strings in a loaded document.
 */
export function commentSafe(name: string): string {
  return name.replaceAll(/[\r\n\u2028\u2029]/gu, " ");
}
