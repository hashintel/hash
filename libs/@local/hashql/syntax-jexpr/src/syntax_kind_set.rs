//! Compact bitset of [`SyntaxKind`] values for parser expectations and diagnostics.

use core::{
    fmt::{self, Display},
    ops::BitOr,
};

use hashql_core::id::bit_vec::{BitRelations as _, FiniteBitSet};

use crate::syntax_kind::SyntaxKind;

const DOMAIN_SIZE: u32 = {
    assert!(
        SyntaxKind::VARIANT_COUNT <= u64::BITS as usize,
        "SyntaxKind variants must fit in a 64-bit FiniteBitSet"
    );
    #[expect(
        clippy::cast_possible_truncation,
        reason = "asserted above that SyntaxKind::VARIANT_COUNT <= 64"
    )]
    {
        SyntaxKind::VARIANT_COUNT as u32
    }
};

/// Conjunction used when formatting a [`SyntaxKindSet`].
#[derive(Copy, Clone)]
pub(crate) enum Conjunction {
    /// Join the final item with `or`.
    Or,
}

/// Bitset of [`SyntaxKind`] values for parser expectations and diagnostics.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SyntaxKindSet(FiniteBitSet<SyntaxKind, u64>);

impl SyntaxKindSet {
    /// Closing delimiters (`]` and `}`).
    pub(crate) const CLOSING_DELIMITER: Self =
        Self::from_slice(&[SyntaxKind::RBracket, SyntaxKind::RBrace]);
    /// All non-trivia syntactic JSON tokens.
    pub(crate) const COMPLETE: Self = Self::from_slice(&[
        SyntaxKind::String,
        SyntaxKind::Number,
        SyntaxKind::True,
        SyntaxKind::False,
        SyntaxKind::Null,
        SyntaxKind::Comma,
        SyntaxKind::Colon,
        SyntaxKind::LBrace,
        SyntaxKind::RBrace,
        SyntaxKind::LBracket,
        SyntaxKind::RBracket,
    ]);
    /// Empty syntax-kind set.
    #[cfg(test)] // exercised by `syntax_kind_set::tests::empty_set_display`.
    pub(crate) const EMPTY: Self = Self(FiniteBitSet::new_empty(DOMAIN_SIZE));
    /// Opening delimiters (`[` and `{`).
    pub(crate) const OPENING_DELIMITER: Self =
        Self::from_slice(&[SyntaxKind::LBracket, SyntaxKind::LBrace]);
    /// Punctuation separators (`,` and `:`).
    pub(crate) const SEPARATORS: Self = Self::from_slice(&[SyntaxKind::Comma, SyntaxKind::Colon]);
    /// Primitive JSON value tokens (string, number, `true`, `false`, `null`).
    pub(crate) const VALUE: Self = Self::from_slice(&[
        SyntaxKind::String,
        SyntaxKind::Number,
        SyntaxKind::True,
        SyntaxKind::False,
        SyntaxKind::Null,
    ]);

    /// Creates a singleton set containing `kind`.
    #[must_use]
    pub(crate) const fn from_kind(kind: SyntaxKind) -> Self {
        let mut set = FiniteBitSet::new_empty(DOMAIN_SIZE);
        set.insert(kind);
        Self(set)
    }

    /// Creates a set containing every kind in `slice`.
    #[must_use]
    pub(crate) const fn from_slice(slice: &[SyntaxKind]) -> Self {
        let mut set = FiniteBitSet::new_empty(DOMAIN_SIZE);
        let mut index = 0;

        while index < slice.len() {
            set.insert(slice[index]);
            index += 1;
        }

        Self(set)
    }

    /// Reports whether the set contains no kinds.
    #[must_use]
    pub(crate) const fn is_empty(self) -> bool {
        self.0.is_empty()
    }

    /// Reports whether the set contains every syntactic JSON token kind.
    #[must_use]
    pub(crate) const fn is_complete(self) -> bool {
        self.0.into_inner() == Self::COMPLETE.0.into_inner()
    }

    /// Reports whether `kind` is in the set.
    #[must_use]
    pub(crate) const fn contains(self, kind: SyntaxKind) -> bool {
        self.0.contains(kind)
    }

    /// Reports whether the set shares at least one kind with `other`.
    #[must_use]
    pub(crate) const fn contains_any(self, other: Self) -> bool {
        (self.0.into_inner() & other.0.into_inner()) != 0
    }

    /// Reports whether the set contains `]` or `}`.
    #[must_use]
    pub(crate) const fn contains_closing_delimiter(self) -> bool {
        self.contains_any(Self::CLOSING_DELIMITER)
    }

    /// Reports whether the set contains `[` or `{`.
    #[must_use]
    pub(crate) const fn contains_opening_delimiter(self) -> bool {
        self.contains_any(Self::OPENING_DELIMITER)
    }

    /// Reports whether the set contains any JSON scalar value token.
    #[must_use]
    pub(crate) const fn contains_value(self) -> bool {
        self.contains_any(Self::VALUE)
    }

    /// Reports whether the set contains `,` or `:`.
    #[must_use]
    pub(crate) const fn contains_separator(self) -> bool {
        self.contains_any(Self::SEPARATORS)
    }

    /// Formats the set in human-readable order with an optional final conjunction.
    pub(crate) const fn display(self, conjunction: Option<Conjunction>) -> impl Display {
        /// Display adapter for a [`SyntaxKindSet`].
        struct Format(SyntaxKindSet, Option<Conjunction>);

        impl Display for Format {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                let Self(set, conjunction) = *self;
                let iter = set.0.iter();
                let len = iter.len();

                if len == 0 {
                    return fmt.write_str("none");
                }

                for (index, kind) in iter.enumerate() {
                    if index > 0 {
                        if index != len - 1 || len != 2 {
                            fmt.write_str(", ")?;
                        }

                        if index == len - 1 {
                            match conjunction {
                                Some(Conjunction::Or) if len == 2 => fmt.write_str(" or ")?,
                                Some(Conjunction::Or) => fmt.write_str("or ")?,
                                None if len == 2 => fmt.write_str(", ")?,
                                None => {}
                            }
                        }
                    }

                    Display::fmt(&kind, fmt)?;
                }

                Ok(())
            }
        }

        Format(self, conjunction)
    }
}

impl BitOr for SyntaxKindSet {
    type Output = Self;

    fn bitor(mut self, rhs: Self) -> Self {
        self.0.union(&rhs.0);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::{Conjunction, SyntaxKind, SyntaxKindSet};

    #[test]
    fn empty_set_display() {
        let set = SyntaxKindSet::EMPTY;
        assert_eq!(set.display(None).to_string(), "none");
        assert_eq!(set.display(Some(Conjunction::Or)).to_string(), "none");
    }

    #[test]
    fn singleton_set_display() {
        let set = SyntaxKindSet::from_slice(&[SyntaxKind::String]);
        assert_eq!(set.display(None).to_string(), "string");
        assert_eq!(set.display(Some(Conjunction::Or)).to_string(), "string");
    }

    #[test]
    fn pair_set_display() {
        let set = SyntaxKindSet::from_slice(&[SyntaxKind::String, SyntaxKind::Number]);
        assert_eq!(set.display(None).to_string(), "string, number");
        assert_eq!(
            set.display(Some(Conjunction::Or)).to_string(),
            "string or number"
        );
    }

    #[test]
    fn complete_set_display() {
        let display = SyntaxKindSet::COMPLETE
            .display(Some(Conjunction::Or))
            .to_string();
        assert_eq!(
            display,
            "string, number, `true`, `false`, `null`, `,`, `:`, `{`, `}`, `[`, or `]`"
        );
    }
}
