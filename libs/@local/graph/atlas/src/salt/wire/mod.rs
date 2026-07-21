//! The wire encoder: atlas responses as `SALTILE` envelope bytes.
//!
//! The envelope layout is a pinned public contract; the checked-in goldens under `fixtures/wire/`
//! are the cross-language proof the TypeScript decoder builds against. One
//! envelope carries every binary response kind (tile, edges, and, with the locate endpoint, locate)
//! as a 16-byte prefix, a fixed offset directory, 8-aligned payload sections, and an optional CBOR
//! trailer tail. Structured payloads are CBOR under the deterministic profile in [`cbor`]; columns
//! are raw little-endian arrays a decoder views without parsing.
//!
//! The module is pure byte emission: a response document in, one `Vec<u8>` out. Every input is
//! assembled by server code from validated artifacts and an admitted request, so inconsistencies
//! between document fields are producer bugs and panic; nothing here returns a data-dependent
//! error. Encoding is deterministic - equal documents yield byte-identical responses, the property
//! the client's application-layer cache keys on - and synchronous: the endpoint schedules it on a
//! rayon worker, never on an async runtime thread.
//!
//! [`tile::TileResponse`] and [`edges::EdgesResponse`] are the two v1 documents; the locate
//! document lands with its endpoint.

pub(crate) mod cbor;
pub(crate) mod edges;
pub(crate) mod envelope;
pub(crate) mod locate;
pub(crate) mod tile;

#[cfg(test)]
mod goldens;
// Crate-visible so the serving tests reuse the section-carving
// helpers against served bytes.
#[cfg(test)]
pub(crate) mod tests;

/// The envelope wire version, prefix field and media-type suffix.
///
/// The media type `application/vnd.hash.saltile-v1` must agree with this value; kind discriminates
/// the grammar variant, the version tracks evolution of the whole family.
pub(crate) const WIRE_VERSION: u16 = 1;

/// A response kind: the eighth magic byte, an ASCII initial.
///
/// The seven-byte family prefix `SALTILE` is constant; the kind byte selects the `HEAD` schema and
/// slot table the decoder applies.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Kind {
    /// A tile response, magic `SALTILET`.
    Tile,
    /// An edges response, magic `SALTILEE`.
    Edges,
    /// A locate response, magic `SALTILEL`.
    Locate,
}

impl Kind {
    /// Returns the eight magic bytes opening this kind's responses.
    #[must_use]
    pub(crate) const fn magic(self) -> [u8; 8] {
        match self {
            Self::Tile => *b"SALTILET",
            Self::Edges => *b"SALTILEE",
            Self::Locate => *b"SALTILEL",
        }
    }
}

/// A tile delivery mode, `HEAD` key 3.
///
/// Requests carry the mode as the JSON strings `"delta"` and `"total"`; delta is the default when a
/// request names none.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// The client-accumulated default: own-cut points only.
    #[default]
    Delta,
    /// The total delivered set for the tile at its zoom.
    Total,
}

impl Mode {
    /// Returns the mode's wire code.
    #[must_use]
    pub(crate) const fn code(self) -> u64 {
        match self {
            Self::Delta => 0,
            Self::Total => 1,
        }
    }
}
