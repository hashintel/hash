//! Display payloads a dataset supplies beside its row identities.
//!
//! An identity file carries one display value per row in its payload region, stored as raw
//! bytes and read back as the typed view the id type declares through
//! [`Key::Payload`](crate::file::identity::Key::Payload). [`Label`] is the display value of a
//! node or edge row and [`Icon`] the display value of an ontology-type row. Both are UTF-8
//! text at byte level, so casting a payload span to either type validates UTF-8 and rejects a
//! span that holds anything else. A row that displays nothing carries the empty value.

/// The display text of a node or edge row.
///
/// A `Label` is UTF-8 text. Reading one out of a payload region validates the bytes, and the
/// empty label is the display of a row that has none.
#[derive(
    Debug,
    zerocopy::ByteEq,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
// `repr(C)`: the `KnownLayout` derive supports an unsized struct only under it.
#[repr(C)]
pub(crate) struct Label(str);

/// The icon of an ontology-type row.
///
/// An `Icon` is UTF-8 text. Reading one out of a payload region validates the bytes, and the
/// empty icon is the display of a row that has none.
#[derive(
    Debug,
    zerocopy::ByteEq,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
// `repr(C)`: the `KnownLayout` derive supports an unsized struct only under it.
#[repr(C)]
pub(crate) struct Icon(str);
