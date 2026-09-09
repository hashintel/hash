mod codec;
mod current;
mod edges;
mod locate;
mod masks;
mod tile;
mod translate;

use alloc::alloc::Allocator;

use self::codec::Envelope;
pub(crate) use self::{
    codec::Mode,
    current::CurrentDocument,
    edges::{
        EdgeSlot, EdgesDocument, EdgesDocumentDetailLevel, EdgesDocumentError,
        EdgesDocumentOptions, EdgesLimits, EdgesTrailer,
    },
    locate::{
        LocateDocument, LocateDocumentError, LocateDocumentOptions, LocateLimits, LocateSource,
    },
    tile::{
        TileDocument, TileDocumentDetailLevel, TileDocumentError, TileDocumentOptions, TileLimits,
        TileSlot, TileTrailer,
    },
    translate::{
        TranslateDocument, TranslateDocumentError, TranslateLimits, TranslatedEdge, TranslatedNode,
    },
};

pub(crate) trait Document {
    type Error;

    /// Replaces `buffer` and returns its writer's completion token.
    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Result<Envelope, Self::Error>;
}
