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

#[derive(Copy, Clone)]
pub(crate) enum Conjunction {
    Or,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SyntaxKindSet(FiniteBitSet<SyntaxKind, u64>);

impl SyntaxKindSet {
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
    pub(crate) const OPENING_DELIMITER: Self =
        Self::from_slice(&[SyntaxKind::LBracket, SyntaxKind::LBrace]);
    pub(crate) const VALUE: Self = Self::from_slice(&[
        SyntaxKind::String,
        SyntaxKind::Number,
        SyntaxKind::True,
        SyntaxKind::False,
        SyntaxKind::Null,
    ]);

    #[must_use]
    pub(crate) const fn from_kind(kind: SyntaxKind) -> Self {
        let mut set = FiniteBitSet::new_empty(DOMAIN_SIZE);
        set.insert(kind);
        Self(set)
    }

    #[must_use]
    pub(crate) const fn from_slice(slice: &[SyntaxKind]) -> Self {
        Self(FiniteBitSet::from_slice(slice))
    }

    #[must_use]
    pub(crate) const fn from_union(sets: &[Self]) -> Self {
        let mut this = FiniteBitSet::new_empty(DOMAIN_SIZE);

        let mut index = 0;
        while index < sets.len() {
            this.union(&sets[index].0);
            index += 1;
        }

        Self(this)
    }

    #[must_use]
    pub(crate) const fn is_empty(self) -> bool {
        self.0.is_empty()
    }

    #[must_use]
    pub(crate) const fn is_complete(self) -> bool {
        self.0.into_inner() == Self::COMPLETE.0.into_inner()
    }

    #[must_use]
    pub(crate) const fn contains(self, kind: SyntaxKind) -> bool {
        self.0.contains(kind)
    }

    #[must_use]
    pub(crate) const fn contains_any(self, other: Self) -> bool {
        (self.0.into_inner() & other.0.into_inner()) != 0
    }

    #[must_use]
    pub(crate) const fn contains_closing_delimiter(self) -> bool {
        self.contains_any(Self::CLOSING_DELIMITER)
    }

    #[must_use]
    pub(crate) const fn contains_value(self) -> bool {
        self.contains_any(Self::VALUE)
    }

    pub(crate) const fn display(self, conjunction: Option<Conjunction>) -> impl Display {
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
        let set = SyntaxKindSet::from_slice(&[]);
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
