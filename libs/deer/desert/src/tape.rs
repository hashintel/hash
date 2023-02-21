use core::{
    ops::{Deref, Range},
    slice::SliceIndex,
};

use bitvec::{
    boxed::BitBox,
    order::Lsb0,
    prelude::{BitSlice, BitVec},
    slice::BitSliceIndex,
};

use crate::token::Token;

#[derive(Debug)]
enum Trivia<'a> {
    Owned(BitBox),
    Slice(&'a BitSlice),
}

impl<'a> Deref for Trivia<'a> {
    type Target = BitSlice;

    fn deref(&self) -> &Self::Target {
        match self {
            Trivia::Owned(value) => value.as_bitslice(),
            Trivia::Slice(value) => value,
        }
    }
}

impl<'a> Trivia<'a> {
    fn to_mut(&mut self) -> &mut BitSlice {
        match self {
            Trivia::Owned(value) => value.as_mut_bitslice(),
            Trivia::Slice(value) => {
                let owned = BitBox::from_bitslice(*value);
                *self = Self::Owned(owned);

                self.to_mut()
            }
        }
    }
}

#[derive(Debug)]
pub(crate) struct Tape<'a, 'de> {
    tokens: &'de [Token],
    trivia: Trivia<'a>,
}

impl Tape<'_, '_> {
    pub(crate) fn empty() -> Self {
        Self {
            tokens: &[],
            trivia: Trivia::Slice(BitSlice::empty()),
        }
    }
}

impl<'a, 'de> Tape<'a, 'de> {
    // also includes trivia
    fn peek_all_n(&self, n: usize) -> Option<Token> {
        self.tokens.get(n).cloned()
    }

    fn is_trivia_n(&self, n: usize) -> Option<bool> {
        self.trivia.get(n).as_deref().copied()
    }

    /// ## Panics
    ///
    /// if range.start > range.end
    pub(crate) fn set_trivia(&mut self, mut range: Range<usize>) {
        // ensure that the start range smaller than or equal to the end range
        // doing this we can ensure that `0..1` is valid, but `1..0` is not.
        assert!(range.start <= range.end);

        // automatically adjust so that we're able to always index to the end, even if the the end
        // is out of bounds
        if range.end > self.tokens.len() {
            range.end = self.tokens.len();
        }

        // we have already asserted that `range.start <= range.end`, therefore if range.start is out
        // of bounds, range.end must be out of bounds as well, in that case we do not need to fill
        // the slice, as `.get_mut` will return `None`
        if range.start >= self.tokens.len() {
            return;
        }

        if let Some(slice) = self.trivia.to_mut().get_mut(range) {
            slice.fill(true);
        }
    }

    pub(crate) fn peek_n(&self, n: usize) -> Option<Token> {
        let mut offset = 0;
        let mut m = 0;

        while m != n {
            if !self.is_trivia_n(offset)? {
                m += 1;
            }

            offset += 1;
        }

        self.peek_all_n(m)
    }

    pub(crate) fn peek(&self) -> Option<Token> {
        let mut n = 0;

        while self.is_trivia_n(n)? {
            n += 1;
        }

        self.peek_all_n(n)
    }

    fn bump(&mut self) -> Option<(Token, bool)> {
        // naive version of bump, which just takes the token and returns it with the status
        let (token, tokens) = self.tokens.split_first()?;
        let is_trivia = *self.trivia.get(0)?;
        // use trivia like a feed tape, this avoid reallocation
        self.trivia.to_mut().shift_left(1);
        self.tokens = tokens;

        Some((token.clone(), is_trivia))
    }

    pub(crate) fn bump_n(&mut self, i: usize) {
        for _ in 0..i {
            self.bump();
        }
    }

    pub(crate) fn next(&mut self) -> Option<Token> {
        loop {
            let (token, is_trivia) = self.bump()?;

            if !is_trivia {
                return Some(token);
            }
        }
    }

    pub(crate) const fn remaining(&self) -> usize {
        self.tokens.len()
    }

    pub(crate) const fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }

    pub(crate) fn view<'b, B>(&'b self, n: B) -> Option<Tape<'b, 'de>>
    where
        B: BitSliceIndex<'b, usize, Lsb0, Immut = &'b BitSlice<usize, Lsb0>>
            + SliceIndex<[Token], Output = [Token]>
            + Clone,
    {
        let tokens = self.tokens.get(n.clone())?;
        let trivia = self.trivia.get(n)?;

        Some(Tape {
            tokens,
            trivia: Trivia::Slice(trivia),
        })
    }
}

impl<'de> From<&'de [Token]> for Tape<'_, 'de> {
    fn from(value: &'de [Token]) -> Self {
        Self {
            tokens: value,
            trivia: Trivia::Owned(BitVec::repeat(false, value.len()).into_boxed_bitslice()),
        }
    }
}
