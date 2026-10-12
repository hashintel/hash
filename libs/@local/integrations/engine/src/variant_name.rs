//! Variant names read from an enum's definition when the crate compiles.

use core::{any::TypeId, fmt, mem};

/// The name of an enum variant, in `PascalCase` as the enum declares it.
#[derive(Debug, Clone, Copy)]
pub(crate) struct VariantName(&'static str);

impl VariantName {
    /// Returns the name of each variant of `T` in declaration order.
    ///
    /// `N` must be the number of variants of `T`, or the build fails.
    pub(crate) const fn all<T: 'static, const N: usize>() -> [Self; N] {
        const {
            assert!(
                N == mem::variant_count::<T>(),
                "`N` should be the number of variants"
            );

            let id = TypeId::of::<T>();
            let mut names = [Self(""); N];
            let mut index = 0;
            while index < N {
                names[index] = Self(id.variant(index).name());
                index += 1;
            }
            names
        }
    }

    /// Returns the name as lowercase words joined by `separator`, so that `OutOfRange` displays
    /// as `out of range` with a space.
    pub(crate) const fn words(self, separator: char) -> Words {
        Words {
            name: self.0,
            separator,
        }
    }

    /// Returns whether `text` spells the words of this name, ignoring ASCII case and spaces, so
    /// that `Out of Range` matches `OutOfRange`.
    pub(crate) fn matches_words(self, text: &str) -> bool {
        text.bytes()
            .filter(|byte| *byte != b' ')
            .map(|byte| byte.to_ascii_lowercase())
            .eq(self.0.bytes().map(|byte| byte.to_ascii_lowercase()))
    }
}

/// A variant name displayed as lowercase words joined by a separator.
pub(crate) struct Words {
    name: &'static str,
    separator: char,
}

impl fmt::Display for Words {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, letter) in self.name.char_indices() {
            if index > 0 && letter.is_ascii_uppercase() {
                fmt::Write::write_char(fmt, self.separator)?;
            }
            fmt::Write::write_char(fmt, letter.to_ascii_lowercase())?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::VariantName;

    #[expect(dead_code, reason = "only the variant names are read")]
    enum Example {
        OutOfRange,
        Binder,
    }

    #[test]
    fn words_joins_lowercase_words() {
        let [out_of_range, binder] = VariantName::all::<Example, 2>();
        assert_eq!(
            out_of_range.words('_').to_string(),
            "out_of_range",
            "each capital letter should start a new word"
        );
        assert_eq!(
            binder.words(' ').to_string(),
            "binder",
            "a one-word name should only be lowercased"
        );
    }

    #[test]
    fn matches_words_ignores_case_and_spaces() {
        let [out_of_range, _] = VariantName::all::<Example, 2>();
        for text in ["Out of Range", "OUT OF RANGE", "OutOfRange"] {
            assert!(
                out_of_range.matches_words(text),
                "`{text}` should match `OutOfRange`"
            );
        }
        assert!(
            !out_of_range.matches_words("Out of Ranges"),
            "a different name should not match"
        );
    }
}
