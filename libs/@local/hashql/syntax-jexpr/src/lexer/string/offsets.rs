use core::{alloc::Allocator, fmt, mem};
use std::bstr::ByteStr;

use super::{Sink, StringSyntaxError, run_length, scan};

/// Start of one piece of a string body: a run of bytes copied as they are, or one escape.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Piece {
    decoded: u32,
    raw: u32,
    escape: bool,
}

/// Records where every piece of a string body starts, in the body and in its decoded form.
struct OffsetSink<'source, A: Allocator> {
    body: &'source [u8],
    decoded: u32,
    raw: u32,
    pieces: Vec<Piece, A>,
}

impl<'source, A: Allocator> OffsetSink<'source, A> {
    fn new(body: &'source [u8], alloc: A) -> Self {
        Self {
            body,
            decoded: 0,
            raw: 0,
            pieces: Vec::new_in(alloc),
        }
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "the lexer rejects a source longer than `u32::MAX` bytes"
)]
impl<'source, A> Sink<'source> for OffsetSink<'source, A>
where
    A: Allocator + Clone,
{
    type Error = StringSyntaxError;
    type Output = Box<[Piece], A>;

    fn push_segment(&mut self, bytes: &'source ByteStr) -> Result<(), Self::Error> {
        // An escape does not report how many bytes it spans. The segment after it does, because
        // the segment starts where the escape ends.
        let start = self
            .body
            .subslice_range(bytes)
            .map_or(self.raw, |range| range.start as u32);

        if !bytes.is_empty() {
            self.pieces.push(Piece {
                decoded: self.decoded,
                raw: start,
                escape: false,
            });
        }

        self.decoded += bytes.len() as u32;
        self.raw = start + bytes.len() as u32;

        Ok(())
    }

    fn push_char(&mut self, character: char) {
        self.pieces.push(Piece {
            decoded: self.decoded,
            raw: self.raw,
            escape: true,
        });

        self.decoded += character.len_utf8() as u32;
    }

    fn finish(&mut self) -> Self::Output {
        // The end of the body, so that the offset one past the last decoded byte maps as well.
        self.pieces.push(Piece {
            decoded: self.decoded,
            raw: self.raw,
            escape: false,
        });

        let alloc = self.pieces.allocator().clone();
        let pieces = mem::replace(&mut self.pieces, Vec::new_in(alloc));

        pieces.into_boxed_slice()
    }
}

/// Maps byte offsets in a decoded string to byte offsets in its quoted source.
///
/// The embedded parsers read the decoded string and report spans in it. An escape such as
/// `\u0061` is longer in the source than the character it decodes to, and a span after it
/// would point at the wrong bytes of the source without this mapping.
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct RawOffsets<A: Allocator> {
    /// Empty for a string without escapes, whose decoded form is its body.
    pieces: Box<[Piece], A>,
}

impl<A: Allocator> RawOffsets<A> {
    /// Reads the offsets of the string token `quoted`, which includes both quotes.
    ///
    /// A token that is not a valid string maps as if it had no escape.
    pub(crate) fn new_in(quoted: &str, alloc: A) -> Self
    where
        A: Clone,
    {
        let Some(body) = quoted.strip_prefix('"') else {
            return Self::verbatim_in(alloc);
        };

        let mut rest = body.as_bytes();
        if rest.get(run_length(rest)) == Some(&b'"') {
            return Self::verbatim_in(alloc);
        }

        scan(OffsetSink::new(body.as_bytes(), alloc.clone()), &mut rest)
            .map_or_else(|_| Self::verbatim_in(alloc), |pieces| Self { pieces })
    }

    pub(crate) fn verbatim_in(alloc: A) -> Self {
        Self {
            pieces: Box::new_in([], alloc),
        }
    }

    /// Derives raw offsets for a decoded JSON string.
    ///
    /// Skips rescanning `quoted` when `decoded` has the exact inner length of an unescaped string.
    pub(crate) fn from_decoded_in(quoted: &str, decoded: &str, alloc: A) -> Self
    where
        A: Clone,
    {
        // Every JSON escape is strictly longer in source bytes than in decoded UTF-8 bytes.
        if decoded.len() + 2 == quoted.len() {
            return Self::verbatim_in(alloc);
        }

        Self::new_in(quoted, alloc)
    }

    /// Maps `offset` in the decoded string to an offset from the opening quote of the source.
    ///
    /// An offset inside the character an escape decodes to maps to the start of the escape.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the lexer rejects a source longer than `u32::MAX` bytes"
    )]
    pub(crate) fn raw(&self, offset: usize) -> u32 {
        let offset = offset as u32;

        let index = self.pieces.partition_point(|piece| piece.decoded <= offset);
        let Some(piece) = index.checked_sub(1).map(|index| self.pieces[index]) else {
            return offset + 1;
        };

        let within = if piece.escape {
            0
        } else {
            offset - piece.decoded
        };

        // `+ 1` for the opening quote.
        piece.raw + within + 1
    }
}

impl<A: Allocator> fmt::Debug for RawOffsets<A> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RawOffsets")
            .field("pieces", &self.pieces)
            .finish()
    }
}
