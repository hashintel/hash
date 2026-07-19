//! The policy table's published form: one policy file and its mapped
//! reader.
//!
//! The resolved table publishes as one [`crate::file::policy`] file in
//! the order [`resolve`](super::resolve) produces: strictly ascending by
//! relation row. [`MappedPolicyTable`] reopens the file over a
//! whole-file mapping, validates the table invariants once, and hands
//! out the rows as a borrowed [`RelationPolicy`] slice: the domain
//! type's `repr(C)` layout is the file's pinned wire row, so reads
//! decode nothing.

use core::{error::Error, fmt, mem::offset_of};
use std::io;

use zerocopy::{FromBytes as _, IntoBytes as _};

use super::RelationPolicy;
use crate::{
    dataset::OntologyRowId,
    file::policy::{PolicyRow, read::PolicyFile, write::write_rows},
    integrity::{Sha256, Sha256Digest, Writer},
};

#[cfg(test)]
mod tests;

// The cast between the file's wire row and the domain type is sound
// exactly while their layouts agree; any drift fails compilation here.
const _: () = {
    assert!(size_of::<RelationPolicy>() == size_of::<PolicyRow>());
    assert!(offset_of!(RelationPolicy, relation) == offset_of!(PolicyRow, relation));
    assert!(
        offset_of!(RelationPolicy, attraction.coincident)
            == offset_of!(PolicyRow, attraction_coincident)
    );
    assert!(
        offset_of!(RelationPolicy, attraction.proximal)
            == offset_of!(PolicyRow, attraction_proximal)
    );
    assert!(
        offset_of!(RelationPolicy, selected.coincident)
            == offset_of!(PolicyRow, selected_coincident)
    );
    assert!(
        offset_of!(RelationPolicy, selected.proximal) == offset_of!(PolicyRow, selected_proximal)
    );
    assert!(offset_of!(RelationPolicy, applicability) == offset_of!(PolicyRow, applicability));
    assert!(offset_of!(RelationPolicy, strength) == offset_of!(PolicyRow, strength));
};

/// An opened policy file does not hold a valid table.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum InvalidPolicyFile {
    /// The rows break the strictly ascending relation order.
    UnorderedRelations { index: usize },
    /// A policy carries a value outside its domain: a probability or
    /// applicability outside `[0, 1]`, or a strength that is not
    /// finite and nonnegative.
    Domain { index: usize },
}

impl fmt::Display for InvalidPolicyFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::UnorderedRelations { index } => write!(
                fmt,
                "the policy at index {index} breaks the strictly ascending relation order",
            ),
            Self::Domain { index } => write!(
                fmt,
                "the policy at index {index} carries a value outside its domain",
            ),
        }
    }
}

impl Error for InvalidPolicyFile {}

/// Writes the resolved policies as a policy file.
///
/// `policies` is [`resolve`](super::resolve)'s output: strictly
/// ascending by relation row, every value in its domain, written as
/// its own bytes. Returns the SHA-256 of the written bytes: the
/// identity the repository records for the published file.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when the policies are not strictly ascending by relation,
/// which violates the resolution contract.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; an unordered table is a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_policies(
    policies: &[RelationPolicy],
    write: impl io::Write,
) -> io::Result<Sha256Digest> {
    assert!(
        policies
            .iter()
            .zip(policies.iter().skip(1))
            .all(|(left, right)| left.relation.get() < right.relation.get()),
        "the resolved table is strictly ascending by relation",
    );

    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: write,
    };

    let rows = <[PolicyRow]>::ref_from_bytes(policies.as_bytes())
        .expect("the policy row layouts are pinned equal at compile time");
    write_rows(rows, &mut writer)?;

    Ok(writer.accumulator.finalize())
}

/// A published policy table opened over its mapped file.
///
/// Construction checks the table invariants once - relations strictly
/// ascending, every value in its domain - so an open table only serves
/// valid policies and consumers re-validate nothing. The rows stay in
/// the page cache under memory pressure and off the heap.
#[derive(Debug)]
pub(crate) struct MappedPolicyTable {
    file: PolicyFile,
}

impl MappedPolicyTable {
    /// Opens the table over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates a table invariant.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: PolicyFile) -> Result<Self, InvalidPolicyFile> {
        let table = Self { file };
        let policies = table.policies();

        if let Some(position) = policies
            .iter()
            .zip(policies.iter().skip(1))
            .position(|(left, right)| left.relation.get() >= right.relation.get())
        {
            return Err(InvalidPolicyFile::UnorderedRelations {
                index: position + 1,
            });
        }

        if let Some(index) = policies.iter().position(|policy| !policy.in_domain()) {
            return Err(InvalidPolicyFile::Domain { index });
        }

        Ok(table)
    }

    /// Returns the resolved relation count.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> usize {
        self.file.rows().len()
    }

    /// Views the policies, strictly ascending by relation.
    #[must_use]
    pub(crate) fn policies(&self) -> &[RelationPolicy] {
        <[RelationPolicy]>::ref_from_bytes(self.file.rows().as_bytes()).expect(
            "the policy row layouts are pinned equal at compile time and the mapped region is \
             page-aligned",
        )
    }

    /// Looks up the policy resolving `relation`.
    #[must_use]
    pub(crate) fn find(&self, relation: OntologyRowId) -> Option<RelationPolicy> {
        let policies = self.policies();
        let index = policies
            .binary_search_by_key(&relation.get(), |policy| policy.relation.get())
            .ok()?;
        Some(policies[index])
    }
}
