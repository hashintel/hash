use alloc::borrow::Cow;
use std::sync::LazyLock;

use regex::Regex;

pub(crate) fn collapse_whitespace(text: &str) -> Cow<'_, str> {
    static RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\s+").expect("should be a valid regex"));

    RE.replace_all(text, " ")
}
