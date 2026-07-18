use alloc::borrow::Cow;
use std::sync::LazyLock;

use regex::Regex;

/// Trims `text` and collapses every interior whitespace run to one space.
///
/// Text that is already normalized comes back borrowed.
pub(crate) fn normalize_whitespace(text: &str) -> Cow<'_, str> {
    static RUNS: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\s+").expect("the whitespace-run pattern should compile"));

    RUNS.replace_all(text.trim(), " ")
}

/// Normalizes a label into a URL slug.
#[must_use]
pub(crate) fn slugify(label: &str) -> String {
    let mut slug = String::with_capacity(label.len());
    let mut separator = false;

    for character in label.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            if separator && !slug.is_empty() {
                slug.push('-');
            }
            separator = false;
            slug.push(character);
        } else {
            separator = true;
        }
    }

    slug
}
