//! The final text lint that refuses identifiers, URLs and UUIDs in rendered card text.

use core::{error::Error, fmt};
use std::sync::LazyLock;

use regex::Regex;

/// Card text contains a datasource identifier or database key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum IdentifierLeakError {
    /// The text embeds a URL scheme.
    Url,
    /// The text embeds a UUID.
    Uuid,
    /// The text embeds a caller-supplied source identifier.
    SourceIdentifier { identifier: String },
}

impl fmt::Display for IdentifierLeakError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Url => fmt.write_str("relation card contains a forbidden URL"),
            Self::Uuid => fmt.write_str("relation card contains a forbidden UUID"),
            Self::SourceIdentifier { identifier } => write!(
                fmt,
                "relation card contains the forbidden source identifier {identifier}"
            ),
        }
    }
}

impl Error for IdentifierLeakError {}

/// Rejects universal keys and the adapter's known source identifiers.
///
/// Every check requires a match to begin at a token boundary, and the UUID and source-identifier
/// checks require one at its end as well. The URL check cannot ask for that, because its match
/// ends at `://` with the rest of the URL still to come. Ordinary prose that merely resembles an
/// identifier passes either way, and this ignores empty identifiers.
///
/// # Errors
///
/// Returns an error when the text contains a URL, a UUID, or one of `forbidden_identifiers`.
pub(crate) fn lint_card_text(
    card_text: &str,
    forbidden_identifiers: &[&str],
) -> Result<(), IdentifierLeakError> {
    static URL: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new("(?i)[a-z][a-z0-9+.-]*:/{2}").expect("the URL detector should compile")
    });
    static UUID: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
            .expect("the UUID detector should compile")
    });

    if find_with_boundaries(&URL, card_text, u8::is_ascii_alphanumeric, None) {
        return Err(IdentifierLeakError::Url);
    }
    if find_with_boundaries(
        &UUID,
        card_text,
        u8::is_ascii_hexdigit,
        Some(u8::is_ascii_hexdigit),
    ) {
        return Err(IdentifierLeakError::Uuid);
    }

    for identifier in forbidden_identifiers
        .iter()
        .copied()
        .filter(|identifier| !identifier.is_empty())
    {
        if contains_identifier(card_text, identifier) {
            return Err(IdentifierLeakError::SourceIdentifier {
                identifier: identifier.to_owned(),
            });
        }
    }

    Ok(())
}

// `\b` cannot express these boundaries. It tests the Unicode word class, which holds `_` and every
// letter and digit alike, while the URL check needs alphanumeric boundaries (`_https://x` leaks but
// has no word boundary before `h`) and the UUID check needs hex boundaries (`key123e4567-...` has
// no word boundary before the `1`, so `\b` never even attempts that match). Consuming prefix
// classes would distort offsets. The search retries from one past a failed match start until a
// match satisfies the boundaries the caller requires.
/// Returns whether `pattern` matches somewhere in `text` at the boundaries the caller requires.
///
/// `before` and `after` are the byte classes that must not touch the match. A match preceded by a
/// `before` member, or followed by an `after` member, is a fragment of a longer token and does
/// not count. `None` for `after` accepts any byte after the match.
fn find_with_boundaries(
    pattern: &Regex,
    text: &str,
    before: fn(&u8) -> bool,
    after: Option<fn(&u8) -> bool>,
) -> bool {
    let mut search_start = 0;
    while let Some(found) = pattern.find_at(text, search_start) {
        if boundary_before(text, found.start(), before)
            && after.is_none_or(|member| boundary_after(text, found.end(), member))
        {
            return true;
        }
        // Both patterns begin with an ASCII byte. One past the match start stays on a character
        // boundary.
        search_start = found.start() + 1;
    }
    false
}

/// Returns whether `identifier` occurs in `text` as a whole alphanumeric token.
#[expect(
    clippy::string_slice,
    reason = "offsets advance by whole characters from match starts, so slicing stays on \
              character boundaries"
)]
fn contains_identifier(text: &str, identifier: &str) -> bool {
    let mut offset = 0;
    while let Some(position) = text[offset..].find(identifier) {
        let start = offset + position;
        if boundary_before(text, start, u8::is_ascii_alphanumeric)
            && boundary_after(text, start + identifier.len(), u8::is_ascii_alphanumeric)
        {
            return true;
        }
        offset = start + text[start..].chars().next().map_or(1, char::len_utf8);
    }
    false
}

/// Returns whether the byte before `index` is absent or outside the `member` class.
#[inline]
fn boundary_before(text: &str, index: usize, member: fn(&u8) -> bool) -> bool {
    index == 0 || !member(&text.as_bytes()[index - 1])
}

/// Returns whether the byte at `index` is absent or outside the `member` class.
#[inline]
fn boundary_after(text: &str, index: usize, member: fn(&u8) -> bool) -> bool {
    index == text.len() || !member(&text.as_bytes()[index])
}
