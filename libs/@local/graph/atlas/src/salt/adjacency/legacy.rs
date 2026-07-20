//! The retired `.adjc` adjacency format: a quarantined reader for
//! generation migration.
//!
//! Layout (the retired format's version 0, verbatim):
//!
//! ```text
//! | offset | size       | region                                     |
//! |--------|------------|--------------------------------------------|
//! | 0      | 8          | magic `SALTADJC`                           |
//! | 8      | 4          | layout version, `u32` = 0                  |
//! | 12     | 4          | value width `W`, `u32` in {4, 8}           |
//! | 16     | 8          | node row count `N`, `u64`                  |
//! | 24     | 8          | edge row count `E`, `u64`                  |
//! | 32     | 4064       | padding                                    |
//! | 4096   | (2N+1) * 8 | fenceposts, `u64`; zero padding to the     |
//! |        |            | next 4096-byte boundary                    |
//! | ...    | 2E * W     | values: edge row ids at width `W`          |
//! ```
//!
//! [`read_legacy`] parses the geometry and hands back the resident
//! [`Adjacency`], whose write path republishes the same lists in the
//! current structure-only sparse matrix format. Nothing here is a
//! serving surface: the migration verifies the bytes against the
//! generation document's recorded digest before parsing, and the list
//! invariants were validated when the generation originally published,
//! so this reader checks geometry alone. Delete the module with the
//! migration once no published generation carries the format.

use zerocopy::{FromBytes as _, LE, U32, U64};

use super::Adjacency;

/// The retired format's magic.
const MAGIC: &[u8; 8] = b"SALTADJC";

/// The retired format's one layout version.
const VERSION: u32 = 0;

/// Size of the header, and of one page-aligned region unit.
const PAGE: usize = 4096;

/// The bytes do not hold a retired-format adjacency.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum LegacyAdjacencyError {
    /// The leading bytes are not the retired format's magic.
    Magic,
    /// The version is not the retired format's one layout.
    Version { actual: u32 },
    /// The value width is neither of the retired format's two.
    Width { actual: u32 },
    /// The byte length contradicts the header's geometry.
    Length { expected: u64, actual: u64 },
}

impl core::fmt::Display for LegacyAdjacencyError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match *self {
            Self::Magic => write!(fmt, "the leading bytes are not the retired adjacency magic"),
            Self::Version { actual } => write!(
                fmt,
                "layout version {actual} is not the retired format's version 0",
            ),
            Self::Width { actual } => {
                write!(fmt, "value width {actual} is neither 4 nor 8 bytes")
            }
            Self::Length { expected, actual } => write!(
                fmt,
                "the bytes hold {actual} where the header describes {expected}",
            ),
        }
    }
}

impl core::error::Error for LegacyAdjacencyError {}

/// Parses retired-format bytes into the resident adjacency.
///
/// # Errors
///
/// Returns an error when the bytes are not a retired-format adjacency:
/// foreign magic, another version, an unknown value width, or a length
/// contradicting the header's geometry.
pub(crate) fn read_legacy(bytes: &[u8]) -> Result<Adjacency, LegacyAdjacencyError> {
    let field = |offset: usize, len: usize| -> Option<&[u8]> { bytes.get(offset..offset + len) };

    if field(0, 8) != Some(MAGIC) {
        return Err(LegacyAdjacencyError::Magic);
    }
    let word = |offset| {
        U32::<LE>::read_from_bytes(field(offset, 4).expect("the magic proved the header length"))
            .expect("four bytes read exactly")
            .get()
    };
    let long = |offset| {
        U64::<LE>::read_from_bytes(field(offset, 8).expect("the magic proved the header length"))
            .expect("eight bytes read exactly")
            .get()
    };
    if bytes.len() < PAGE {
        return Err(LegacyAdjacencyError::Length {
            expected: PAGE as u64,
            actual: bytes.len() as u64,
        });
    }

    let version = word(8);
    if version != VERSION {
        return Err(LegacyAdjacencyError::Version { actual: version });
    }
    let width = word(12);
    if width != 4 && width != 8 {
        return Err(LegacyAdjacencyError::Width { actual: width });
    }
    let nodes = long(16);
    let edges = long(24);

    // The retired length equation: fenceposts behind the header, zero
    // padded to the boundary, then the value region ends the file.
    let posts = 2 * nodes + 1;
    let posts_bytes = usize::try_from(posts * 8).expect("a resident column fits usize");
    let values_offset = PAGE + posts_bytes.next_multiple_of(PAGE);
    let values_bytes =
        usize::try_from(2 * edges * u64::from(width)).expect("a resident column fits usize");
    let expected = (values_offset + values_bytes) as u64;
    if bytes.len() as u64 != expected {
        return Err(LegacyAdjacencyError::Length {
            expected,
            actual: bytes.len() as u64,
        });
    }

    let fenceposts = <[U64<LE>]>::ref_from_bytes(
        field(PAGE, posts_bytes).expect("the length equation covers the fencepost region"),
    )
    .expect("the little-endian column is unaligned-safe")
    .iter()
    .map(|post| post.get())
    .collect();
    let values =
        field(values_offset, values_bytes).expect("the length equation covers the value region");
    let values = if width == 4 {
        <[U32<LE>]>::ref_from_bytes(values)
            .expect("the little-endian column is unaligned-safe")
            .iter()
            .map(|value| u64::from(value.get()))
            .collect()
    } else {
        <[U64<LE>]>::ref_from_bytes(values)
            .expect("the little-endian column is unaligned-safe")
            .iter()
            .map(|value| value.get())
            .collect()
    };

    Ok(Adjacency { fenceposts, values })
}

/// Encodes the adjacency in the retired format, for migration tests.
///
/// # Panics
///
/// Panics when `width` is neither of the retired format's two, or when
/// a value does not fit a narrow encoding.
#[cfg(test)]
#[expect(
    clippy::little_endian_bytes,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the retired format pins little-endian regions and two slots per edge"
)]
pub(crate) fn write_legacy(adjacency: &Adjacency, width: u32) -> Vec<u8> {
    assert!(width == 4 || width == 8, "the retired format's two widths");
    let nodes = ((adjacency.fenceposts.len() - 1) / 2) as u64;
    let edges = (adjacency.values.len() / 2) as u64;

    let mut bytes = vec![0_u8; PAGE];
    bytes[0..8].copy_from_slice(MAGIC);
    bytes[8..12].copy_from_slice(&VERSION.to_le_bytes());
    bytes[12..16].copy_from_slice(&width.to_le_bytes());
    bytes[16..24].copy_from_slice(&nodes.to_le_bytes());
    bytes[24..32].copy_from_slice(&edges.to_le_bytes());

    for post in &adjacency.fenceposts {
        bytes.extend_from_slice(&post.to_le_bytes());
    }
    bytes.resize(bytes.len().next_multiple_of(PAGE), 0);
    for &value in &adjacency.values {
        if width == 4 {
            let narrow = u32::try_from(value).expect("narrow values fit four bytes");
            bytes.extend_from_slice(&narrow.to_le_bytes());
        } else {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
    }

    bytes
}
