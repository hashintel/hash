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
