//! Validated `.salt` container types.
//!
//! Every type here wraps a raw image from [`ll`] behind constructors that
//! enforce the structural rules documented on [`crate::file`], so holding a
//! value is proof that its wire image is well-formed. Decoding funnels
//! through one entrance per image ([`Slot::decode`], [`MappingSlot::decode`],
//! [`Container::decode`]) and yields a typed value or a rejection, never an
//! unchecked intermediate; encoding is only possible from typed values, so
//! writers cannot emit invalid images.
//!
//! Rules that span a whole segment or container - offset ordering, sorted
//! entry prefixes, mapping prefix sums, inline alignment, gap zeroing -
//! cannot be seen from one image and belong to the container codec built on
//! these types.
//!
//! [`ll`]: super::ll
//! [`Slot::decode`]: entry::Slot::decode
//! [`MappingSlot::decode`]: container::MappingSlot::decode
//! [`Container::decode`]: container::Container::decode

pub(crate) mod container;
pub(crate) mod entry;
pub(crate) mod section;

#[cfg(test)]
mod tests;
