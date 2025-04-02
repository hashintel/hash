use core::{
    fmt::{self, Display},
    ops::{BitAnd, BitOr, BitXor},
};

use super::syntax_kind::{Flag, SyntaxKind};

pub(crate) struct SyntaxKindSetIter(Flag);

impl Iterator for SyntaxKindSetIter {
    type Item = SyntaxKind;

    fn next(&mut self) -> Option<Self::Item> {
        if self.0 == 0 {
            return None;
        }

        let kind = self.0.trailing_zeros();
        self.0 &= !(1 << kind);

        Some(SyntaxKind::from_exponent(kind))
    }
}

impl ExactSizeIterator for SyntaxKindSetIter {
    fn len(&self) -> usize {
        self.0.count_ones() as usize
    }
}

/// A bitset representing a set of syntax kinds.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct SyntaxKindSet(Flag);

impl SyntaxKindSet {
    /// Tokens that represent closing delimiters like `]` and `}`.
    const CLOSING_DELIMITER: Self = Self::from_slice(&[SyntaxKind::RBracket, SyntaxKind::RBrace]);
    /// Tokens that represent opening delimiters like `[` and `{`.
    const OPENING_DELIMITER: Self = Self::from_slice(&[SyntaxKind::LBracket, SyntaxKind::LBrace]);
    /// Tokens that represent separators in JSON like `,` and `:`.
    const SEPARATORS: Self = Self::from_slice(&[SyntaxKind::Comma, SyntaxKind::Colon]);
    /// Tokens that represent JSON values like strings, numbers, booleans, and null.
    const VALUE: Self = Self::from_slice(&[
        SyntaxKind::String,
        SyntaxKind::Number,
        SyntaxKind::True,
        SyntaxKind::False,
        SyntaxKind::Null,
    ]);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Conjunction {
    Or,
    And,
}

impl SyntaxKindSet {
    /// A set containing all possible syntax kinds.
    pub(crate) const COMPLETE: Self = Self::from_slice(SyntaxKind::VARIANTS);
    /// An empty set with no syntax kinds.
    pub(crate) const EMPTY: Self = Self(0);

    /// Creates a new set from a slice of syntax kinds.
    pub(crate) const fn from_slice(slice: &[SyntaxKind]) -> Self {
        let mut set = 0;

        // cannot use for loop here, because it's not const
        let mut index = 0;
        while index < slice.len() {
            set |= slice[index].into_flag();
            index += 1;
        }

        Self(set)
    }

    /// Returns true if the set contains no syntax kinds.
    #[must_use]
    pub(crate) const fn is_empty(self) -> bool {
        self.0 == 0
    }

    /// Returns true if the set contains all possible syntax kinds.
    #[must_use]
    pub(crate) const fn is_complete(self) -> bool {
        self.0 == Self::COMPLETE.0
    }

    /// Returns the number of syntax kinds in the set.
    #[must_use]
    pub(crate) const fn len(self) -> usize {
        self.0.count_ones() as usize
    }

    /// Returns true if the set contains the given syntax kind.
    pub(crate) const fn contains(self, kind: SyntaxKind) -> bool {
        self.0 & kind.into_flag() != 0
    }

    /// Returns true if the set contains any of the syntax kinds in the given set.
    pub(crate) const fn contains_any(self, set: Self) -> bool {
        self.0 & set.0 != 0
    }

    /// Returns true if the set contains any closing delimiter (`]` or `}`).
    pub(crate) const fn contains_closing_delimiter(self) -> bool {
        self.contains_any(Self::CLOSING_DELIMITER)
    }

    /// Returns true if the set contains any opening delimiter (`[` or `{`).
    pub(crate) const fn contains_opening_delimiter(self) -> bool {
        self.contains_any(Self::OPENING_DELIMITER)
    }

    /// Returns true if the set contains any value token (string, number, true, false, null).
    pub(crate) const fn contains_value(self) -> bool {
        self.contains_any(Self::VALUE)
    }

    /// Returns true if the set contains any separator token (comma, colon).
    pub(crate) const fn contains_separator(self) -> bool {
        self.contains_any(Self::SEPARATORS)
    }

    pub(crate) const fn display(self, verb: Option<Conjunction>) -> impl Display {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        struct Format(SyntaxKindSet, Option<Conjunction>);

        impl Display for Format {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                let Self(this, verb) = *self;
                let count = this.len();

                if count == 0 {
                    return fmt.write_str("none");
                }

                let iter = this.into_iter();
                let len = iter.len();

                for (i, kind) in iter.enumerate() {
                    if i > 0 {
                        if i != len - 1 || len != 2 {
                            fmt.write_str(", ")?;
                        }

                        if i == len - 1 {
                            match verb {
                                Some(Conjunction::Or) if len == 2 => fmt.write_str(" or ")?,
                                Some(Conjunction::Or) => fmt.write_str("or ")?,
                                Some(Conjunction::And) if len == 2 => fmt.write_str(" and ")?,
                                Some(Conjunction::And) => fmt.write_str("and ")?,
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

        Format(self, verb)
    }
}

impl FromIterator<SyntaxKind> for SyntaxKindSet {
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = SyntaxKind>,
    {
        let mut set = 0;
        for kind in iter {
            set |= kind.into_flag();
        }
        Self(set)
    }
}

impl IntoIterator for SyntaxKindSet {
    type IntoIter = SyntaxKindSetIter;
    type Item = SyntaxKind;

    fn into_iter(self) -> Self::IntoIter {
        SyntaxKindSetIter(self.0)
    }
}

impl BitOr for SyntaxKindSet {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

impl BitAnd for SyntaxKindSet {
    type Output = Self;

    fn bitand(self, rhs: Self) -> Self {
        Self(self.0 & rhs.0)
    }
}

impl BitXor for SyntaxKindSet {
    type Output = Self;

    fn bitxor(self, rhs: Self) -> Self {
        Self(self.0 ^ rhs.0)
    }
}

impl Default for SyntaxKindSet {
    fn default() -> Self {
        Self::EMPTY
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_set_display() {
        let set = SyntaxKindSet::EMPTY;

        insta::assert_snapshot!(set.display(None).to_string(), @r"none");
        insta::assert_snapshot!(set.display(Some(Conjunction::Or)).to_string(), @r"none");
        insta::assert_snapshot!(set.display(Some(Conjunction::And)).to_string(), @r"none");
    }

    #[test]
    fn singleton_set_display() {
        let set = SyntaxKindSet::from_slice(&[SyntaxKind::String]);

        insta::assert_snapshot!(set.display(None).to_string(), @r"string");
        insta::assert_snapshot!(set.display(Some(Conjunction::Or)).to_string(), @r"string");
        insta::assert_snapshot!(set.display(Some(Conjunction::And)).to_string(), @r"string");
    }

    #[test]
    fn pair_set_display() {
        let set = SyntaxKindSet::from_slice(&[SyntaxKind::String, SyntaxKind::Number]);

        insta::assert_snapshot!(set.display(None).to_string(), @r"string, number");
        insta::assert_snapshot!(set.display(Some(Conjunction::Or)).to_string(), @r"string or number");
        insta::assert_snapshot!(set.display(Some(Conjunction::And)).to_string(), @r"string and number");
    }

    #[test]
    fn triplet_set_display() {
        let set =
            SyntaxKindSet::from_slice(&[SyntaxKind::String, SyntaxKind::Number, SyntaxKind::True]);

        insta::assert_snapshot!(set.display(None).to_string(), @r"string, number, `true`");
        insta::assert_snapshot!(set.display(Some(Conjunction::Or)).to_string(), @"string, number, or `true`");
        insta::assert_snapshot!(set.display(Some(Conjunction::And)).to_string(), @"string, number, and `true`");
    }

    #[test]
    fn larger_set_display() {
        let set = SyntaxKindSet::from_slice(&[
            SyntaxKind::String,
            SyntaxKind::Number,
            SyntaxKind::True,
            SyntaxKind::False,
        ]);

        insta::assert_snapshot!(set.display(None).to_string(), @r"string, number, `true`, `false`");
        insta::assert_snapshot!(set.display(Some(Conjunction::Or)).to_string(), @r"string, number, `true`, or `false`");
        insta::assert_snapshot!(set.display(Some(Conjunction::And)).to_string(), @r"string, number, `true`, and `false`");
    }

    #[test]
    fn complete_set_display() {
        // The complete set should list all items with proper formatting
        let set = SyntaxKindSet::COMPLETE;

        // Just check that the output contains some expected substrings
        let display = set.display(Some(Conjunction::Or)).to_string();
        insta::assert_snapshot!(display, @"string, number, `true`, `false`, `null`, `,`, `:`, `{`, `}`, `[`, or `]`");
    }
}
