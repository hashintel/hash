use core::ops::Deref;

use bitvec::{
    boxed::BitBox,
    prelude::{BitSlice, BitVec},
};

use crate::token::Token;

#[derive(Debug)]
enum Trivia {
    Owned(BitBox),
}

impl Deref for Trivia {
    type Target = BitSlice;

    fn deref(&self) -> &Self::Target {
        match self {
            Self::Owned(value) => value.as_bitslice(),
        }
    }
}

impl Trivia {
    fn to_mut(&mut self) -> &mut BitSlice {
        match self {
            Self::Owned(value) => value.as_mut_bitslice(),
        }
    }
}

#[derive(Debug)]
pub(crate) struct Tape<'de> {
    tokens: &'de [Token],
    trivia: Trivia,
}

impl Tape<'_> {
    // also includes trivia
    fn peek_all_n(&self, n: usize) -> Option<Token> {
        self.tokens.get(n).cloned()
    }

    fn is_trivia_n(&self, n: usize) -> Option<bool> {
        self.trivia.get(n).as_deref().copied()
    }

    pub(crate) fn peek_n(&self, n: usize) -> Option<Token> {
        let mut offset = 0;
        let mut next = 0;

        while next != n {
            if !self.is_trivia_n(offset)? {
                next += 1;
            }

            offset += 1;
        }

        self.peek_all_n(next)
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
}

impl<'de> From<&'de [Token]> for Tape<'de> {
    fn from(value: &'de [Token]) -> Self {
        Self {
            tokens: value,
            trivia: Trivia::Owned(BitVec::repeat(false, value.len()).into_boxed_bitslice()),
        }
    }
}
