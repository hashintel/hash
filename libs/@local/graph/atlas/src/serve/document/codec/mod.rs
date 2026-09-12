mod cbor;
mod column;
mod envelope;

use alloc::alloc::Allocator;

pub(super) use self::column::ColumnWriter;
pub(crate) use self::{
    cbor::CborWriter,
    envelope::{Envelope, EnvelopeWriter},
};

/// The envelope wire version, prefix field and media-type suffix.
///
/// The media type `application/vnd.hash.saltile-v1` must agree with this value. The version applies
/// to every [`Kind`].
pub(crate) const WIRE_VERSION: u16 = 1;

#[derive(Debug, Copy, Clone, PartialEq, Eq, zerocopy::IntoBytes, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct Kind([u8; 8]);

impl Kind {
    pub(crate) const EDGES: Self = Self(*b"SALTILEE");
    pub(crate) const LOCATE: Self = Self(*b"SALTILEL");
    pub(crate) const TILE: Self = Self(*b"SALTILET");
}

/// A tile delivery mode, `HEAD` key 3.
///
/// Requests carry the mode as the JSON strings `"delta"` and `"total"`. Delta is the default.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Mode {
    #[default]
    Delta,
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

/// Emits one detail array: text entries, `null` for an empty entry.
pub(super) fn encode_details<A: Allocator>(
    cbor: &mut CborWriter<'_, A>,
    entries: impl ExactSizeIterator<Item: AsRef<str>>,
) {
    cbor.array(entries.len() as u64);
    for entry in entries {
        let entry = entry.as_ref();

        if entry.is_empty() {
            cbor.null();
        } else {
            cbor.text(entry);
        }
    }
}
