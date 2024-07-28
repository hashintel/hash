use core::fmt::{self, Display};

use crate::syntax_kind::SyntaxKind;

pub struct SyntaxKindSetIter(u128);

impl Iterator for SyntaxKindSetIter {
    type Item = SyntaxKind;

    fn next(&mut self) -> Option<Self::Item> {
        if self.0 == 0 {
            return None;
        }

        let kind = self.0.trailing_zeros();
        self.0 &= !(1 << kind);
        Some(match kind {
            0 => SyntaxKind::String,
            1 => SyntaxKind::Number,
            2 => SyntaxKind::True,
            3 => SyntaxKind::False,
            4 => SyntaxKind::Null,
            5 => SyntaxKind::Comma,
            6 => SyntaxKind::Colon,
            7 => SyntaxKind::LBrace,
            8 => SyntaxKind::RBrace,
            9 => SyntaxKind::LBracket,
            10 => SyntaxKind::RBracket,
            _ => unreachable!(),
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SyntaxKindSet(u128);

impl SyntaxKindSet {
    pub fn new(iter: impl IntoIterator<Item = SyntaxKind>) -> Self {
        iter.into_iter().collect()
    }

    #[must_use]
    pub const fn contains(&self, kind: SyntaxKind) -> bool {
        self.0 & kind.into_u128() != 0
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.0.count_ones() as usize
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.0 == 0
    }
}

impl FromIterator<SyntaxKind> for SyntaxKindSet {
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = SyntaxKind>,
    {
        let mut set = 0;
        for kind in iter {
            set |= kind.into_u128();
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

impl Display for SyntaxKindSet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let count = self.len();
        if count == 0 {
            return f.write_str("none");
        }

        for (index, kind) in self.into_iter().enumerate() {
            if index > 0 {
                f.write_str(", ")?;
            }

            Display::fmt(&kind, f)?;
        }

        Ok(())
    }
}
