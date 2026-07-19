//! The policy table's published form: one policy file and its mapped
//! reader.
//!
//! The resolved table publishes as one [`crate::file::policy`] file in
//! the order [`resolve`](super::resolve) produces: strictly ascending by
//! relation row. [`MappedPolicyTable`] reopens the file over a
//! whole-file mapping and validates the table invariants once, so
//! consumers look up certified policies without holding the table on
//! the heap.

use core::{error::Error, fmt};
use std::io;

use zerocopy::{F32, U64};

use super::{ClassProbabilities, RelationPolicy};
use crate::{
    dataset::OntologyRowId,
    file::policy::{PolicyRow, read::PolicyFile, write::write_rows},
    integrity::{Sha256, Sha256Digest, Writer},
};

#[cfg(test)]
mod tests;

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

/// Encodes one resolved policy in wire form.
const fn encode(policy: &RelationPolicy) -> PolicyRow {
    PolicyRow {
        relation: U64::new(policy.relation.get()),
        attraction_coincident: F32::new(policy.attraction.coincident),
        attraction_proximal: F32::new(policy.attraction.proximal),
        selected_coincident: F32::new(policy.selected.coincident),
        selected_proximal: F32::new(policy.selected.proximal),
        applicability: F32::new(policy.applicability),
        strength: F32::new(policy.strength),
    }
}

/// Decodes one wire row into its resolved policy.
const fn decode(row: &PolicyRow) -> RelationPolicy {
    RelationPolicy {
        relation: OntologyRowId::new(row.relation.get()),
        attraction: ClassProbabilities {
            coincident: row.attraction_coincident.get(),
            proximal: row.attraction_proximal.get(),
        },
        selected: ClassProbabilities {
            coincident: row.selected_coincident.get(),
            proximal: row.selected_proximal.get(),
        },
        applicability: row.applicability.get(),
        strength: row.strength.get(),
    }
}

/// Writes the resolved policies as a policy file.
///
/// `policies` is [`resolve`](super::resolve)'s output: strictly
/// ascending by relation row, every value in its domain. Returns the
/// SHA-256 of the written bytes: the identity the repository records
/// for the published file.
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

    let rows: Vec<PolicyRow> = policies.iter().map(encode).collect();
    write_rows(&rows, &mut writer)?;

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
    pub(crate) fn new(file: PolicyFile) -> Result<Self, InvalidPolicyFile> {
        let rows = file.rows();

        if let Some(position) = rows
            .iter()
            .zip(rows.iter().skip(1))
            .position(|(left, right)| left.relation.get() >= right.relation.get())
        {
            return Err(InvalidPolicyFile::UnorderedRelations {
                index: position + 1,
            });
        }

        for (index, row) in rows.iter().enumerate() {
            if !decode(row).in_domain() {
                return Err(InvalidPolicyFile::Domain { index });
            }
        }

        Ok(Self { file })
    }

    /// Returns the resolved relation count.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> usize {
        self.file.rows().len()
    }

    /// Returns the policies, strictly ascending by relation.
    #[inline]
    pub(crate) fn policies(&self) -> impl ExactSizeIterator<Item = RelationPolicy> {
        self.file.rows().iter().map(decode)
    }

    /// Looks up the policy resolving `relation`.
    #[must_use]
    pub(crate) fn find(&self, relation: OntologyRowId) -> Option<RelationPolicy> {
        let rows = self.file.rows();
        let index = rows
            .binary_search_by_key(&relation.get(), |row| row.relation.get())
            .ok()?;
        Some(decode(&rows[index]))
    }
}
