//! Raw wire images of the `.salt` layout.
//! The definitions here fix sizes, field order, and endianness. Identity
//! fields (magic, version) are pinned through [`zerocopy::TryFromBytes`]
//! single-variant enums, so bytes of the wrong format fail to parse;
//! everything else admits any bit pattern, and structural validation
//! belongs to the layers built on top. The normative layout is documented
//! on [`crate::file`].
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

pub(crate) mod entry;
pub(crate) mod flags;
pub(crate) mod preamble;
pub(crate) mod salt;
pub(crate) mod segment;
