//! The response body each route answers with, and its encoding into caller-supplied bytes.
//!
//! [`Document::encode`] is the contract every route's body shares: it replaces a caller-owned
//! buffer with the encoded body and returns the [`Envelope`] naming the media type it wrote.
//! Preparing a document and encoding it are separate steps, and they fail differently. A
//! request-shaped refusal, a gap in the captured data and a failed store read all surface during
//! preparation, before encoding touches the buffer.
//!
//! Preparation is scene-backed for five of the six. [`ManifestDocument`], [`TileDocument`],
//! [`EdgesDocument`], [`LocateDocument`] and [`TranslateDocument`] gather what their response
//! delivers from a captured [`Scene`](crate::serve::scene::Scene), meaning its bound world and
//! delivery schedule. [`CurrentDocument`] takes a generation id alone and reads no scene.
//!
//! A returned encoding error comes from a serde serializer: [`CurrentDocument`],
//! [`ManifestDocument`] and [`TranslateDocument`] return theirs, and a serialization that fails
//! part-way leaves its partial output in the buffer. The binary documents declare
//! `type Error = !`, which says they return no error rather than that they cannot fail. They fail
//! by panic instead. The envelope directory addresses recorded slots with u32 offsets. A body
//! recording a slot offset at or past 4 GiB therefore panics rather than record a wrapped one.
//! [`codec`] holds the envelope, column and CBOR writers they share.

use alloc::alloc::Allocator;

use self::codec::Envelope;

mod codec;
mod current;
mod edges;
mod limits;
mod locate;
mod manifest;
mod masks;
mod tile;
mod translate;

#[cfg(test)]
pub(crate) use self::tile::TileSlot;
pub(crate) use self::{
    codec::Mode,
    current::CurrentDocument,
    edges::{
        EdgesDocument, EdgesDocumentDetailLevel, EdgesDocumentError, EdgesDocumentOptions,
        EdgesLimits,
    },
    limits::DocumentLimits,
    locate::{
        LocateDocument, LocateDocumentError, LocateDocumentOptions, LocateLimits, LocateSource,
    },
    manifest::ManifestDocument,
    tile::{
        TileDocument, TileDocumentDetailLevel, TileDocumentError, TileDocumentOptions, TileLimits,
    },
    translate::{TranslateDocument, TranslateDocumentError, TranslateLimits},
};

/// The fitted-variant names this generation ever serves.
pub(crate) const VARIANTS: [&str; 1] = ["plain"];

/// A response body that encodes itself into a caller-supplied buffer.
pub(crate) trait Document {
    /// The failure [`encode`](Self::encode) can report.
    type Error;

    /// Replaces `buffer` and returns its writer's completion token.
    ///
    /// # Errors
    ///
    /// Returns the implementation's encoding error. The buffer may contain a partial document on
    /// failure.
    ///
    /// # Panics
    ///
    /// A binary implementation panics where the encoded slots reach the envelope directory's u32
    /// offset bound. No request-shaped refusal covers that case: the size follows the data the
    /// document gathered rather than any field of the request.
    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Result<Envelope, Self::Error>;
}
