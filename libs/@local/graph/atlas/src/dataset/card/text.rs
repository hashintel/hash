use alloc::borrow::Cow;
use std::sync::LazyLock;

use regex::Regex;
use unicode_segmentation::UnicodeSegmentation as _;
use unidecode::unidecode_char;

/// Trims `text` and collapses every interior whitespace run to one space.
///
/// Text that is already normalized comes back borrowed.
pub(crate) fn normalize_whitespace(text: &str) -> Cow<'_, str> {
    static RUNS: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\s+").expect("the whitespace-run pattern should compile"));

    RUNS.replace_all(text.trim(), " ")
}

/// Normalizes a label into a slug.
///
/// Transliterated to ASCII, lowercased, and joined by hyphens at word boundaries.
#[must_use]
pub(crate) fn slugify(label: &str) -> String {
    // Transliteration precedes word segmentation: transliterated output
    // reintroduces separators ("Bei " for a CJK character, "1/2" for a
    // fraction), which are word boundaries, never slug content.
    let mut label: String = label.chars().map(unidecode_char).collect();
    label.make_ascii_lowercase();

    label.unicode_words().intersperse("-").collect()
}
