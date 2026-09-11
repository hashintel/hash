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

pub(crate) const VARIANTS: [&str; 1] = ["plain"];

pub(crate) trait Document {
    type Error;

    /// Replaces `buffer` and returns its writer's completion token.
    ///
    /// # Errors
    ///
    /// Returns the implementation's encoding error. The buffer may contain a partial document on
    /// failure.
    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Result<Envelope, Self::Error>;
}
