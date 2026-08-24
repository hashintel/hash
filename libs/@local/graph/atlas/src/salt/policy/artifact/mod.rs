//! Writes the resolved policy table to one policy file and reads it back through a mapping.
//!
//! The certified table publishes as one [`crate::file::policy`] file in the strictly ascending
//! relation order its type carries. [`PolicyTableArchive`]
//! reopens the file over a whole-file mapping and validates the table invariants once. An open
//! table then serves its rows as a borrowed [`RelationPolicy`] slice. The domain type's `repr(C)`
//! layout is the file's pinned wire row, so reads decode nothing.

use core::{error::Error, fmt, mem::offset_of};
use std::io;

use hashql_core::id::Id as _;
use zerocopy::{FromBytes as _, IntoBytes as _, TryFromBytes as _};

use super::{CertifiedPolicies, RelationPolicy};
use crate::{
    file::{
        WriteAs, WriteInto,
        policy::{PolicyRow, read::PolicyFile, write::write_rows},
        salt::artifact,
    },
    identity::OntologyRowId,
    integrity::{Sha256, Sha256Digest, Writer},
};

#[cfg(test)]
mod tests;

// The cast between the file's wire row and the domain type is sound exactly while their layouts
// agree. Any drift fails compilation here.
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
    /// A policy row's bits are not a canonical encoding of the domain types.
    ///
    /// A fraction outside `[0, 1]`, a strength that is not finite and non-negative, or a
    /// negative zero where the domain stores canonical zero.
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

// The certified table is its own on-disk form: the rows write in the table's certified order,
// every value as its own bytes.
impl WriteInto for CertifiedPolicies {
    type Error = io::Error;

    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        let rows = <[PolicyRow]>::ref_from_bytes(self.as_slice().as_bytes())
            .expect("the policy row layouts are pinned equal at compile time");
        write_rows(rows, &mut writer)?;

        Ok(writer.accumulator.finalize())
    }
}

impl WriteAs<artifact::Policy> for CertifiedPolicies {}

/// A published policy table opened over its mapped file.
///
/// Construction checks the table invariants once (relations strictly ascending, every value in its
/// domain), so an open table only serves valid policies and consumers re-validate nothing. The rows
/// stay in the page cache under memory pressure and off the heap.
#[derive(Debug)]
pub(crate) struct PolicyTableArchive {
    file: PolicyFile,
}

impl PolicyTableArchive {
    /// Opens the table over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates a table invariant.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: PolicyFile) -> Result<Self, InvalidPolicyFile> {
        let rows = file.rows();

        if let Some(position) = rows
            .array_windows::<2>()
            .position(|[left, right]| left.relation >= right.relation)
        {
            return Err(InvalidPolicyFile::UnorderedRelations {
                index: position + 1,
            });
        }

        // The domain types carry every value bound in their bit validity, so the typed
        // try-cast is the whole domain check.
        if let Some(index) = rows
            .iter()
            .position(|row| RelationPolicy::try_read_from_bytes(row.as_bytes()).is_err())
        {
            return Err(InvalidPolicyFile::Domain { index });
        }

        Ok(Self { file })
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
        <[RelationPolicy]>::try_ref_from_bytes(self.file.rows().as_bytes()).expect(
            "opening validated every row against the domain types' bit validity, and the layouts \
             are pinned equal at compile time",
        )
    }

    /// Looks up the policy resolving `relation`.
    #[must_use]
    pub(crate) fn find(&self, relation: OntologyRowId) -> Option<RelationPolicy> {
        let policies = self.policies();
        let index = policies
            .binary_search_by_key(&relation.as_u64(), |policy| policy.relation.as_u64())
            .ok()?;

        Some(policies[index])
    }
}
