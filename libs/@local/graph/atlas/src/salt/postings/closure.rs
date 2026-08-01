//! The type closure map gives each type a descendant bitset over the parent graph.
//!
//! Request-time inheritance expansion is one OR. A requested type's descendant row names every type
//! whose instances the request matches, so expanding a request is `OR` of the requested rows and
//! testing a type against a request is one bit read. The map derives at open from the published
//! parent edges, the one authority for inheritance, and lives on the heap: `T^2` bits stay in the
//! low megabytes while `T` stays in the low thousands.

use hashql_core::id::{
    Id as _, IdVec,
    bit_vec::{BitMatrix, RowRef},
};

use crate::{identity::OntologyRowId, salt::postings::artifact::PostingsArchive};

/// The parent graph holds a cycle, so no descendant order exists.
///
/// Type inheritance is acyclic at the source; a cycle in published bytes means the generation's
/// ontology stream was defective.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ParentCycle {
    /// Types entangled in cycles: every type whose descendant set never settled.
    pub entangled: u64,
}

impl core::fmt::Display for ParentCycle {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            fmt,
            "the parent graph holds a cycle entangling {} types",
            self.entangled,
        )
    }
}

impl core::error::Error for ParentCycle {}

/// Descendant bitsets over the type domain, one row per type.
///
/// Row `t` marks every type whose instances a filter or coloring request naming `t` matches: `t`
/// itself and every type reaching `t` through parent edges - a `T` by `T` [`BitMatrix`], so a
/// request's expansion ORs whole rows word-wise.
#[derive(Debug, Clone)]
pub(crate) struct ClosureMap {
    bits: BitMatrix<OntologyRowId, OntologyRowId>,
}

impl ClosureMap {
    /// Derives the closure map from the opened postings' parent graph.
    ///
    /// The derivation walks types children-first in Kahn's ordering over the parent edges. A type's
    /// settled descendant row ORs into each of its parents' rows, so every row settles in one pass
    /// over the edges.
    ///
    /// # Errors
    ///
    /// Returns [`ParentCycle`] when the parent graph holds a cycle, in which case the generation's
    /// ontology stream was defective.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(postings: &PostingsArchive) -> Result<Self, ParentCycle> {
        let types = usize::try_from(postings.types()).expect("resident type domains fit usize");
        let bound = OntologyRowId::from_usize(types);
        let mut bits = BitMatrix::new(types, types);

        // Every type descends from itself: a request naming `t`
        // matches instances of `t` directly.
        for type_row in OntologyRowId::MIN..bound {
            bits.insert(type_row, type_row);
        }

        // Pending children per type. A type's row settles once it has absorbed every child's row.
        let mut pending: IdVec<OntologyRowId, u64> = IdVec::from_elem(0, types);
        for type_row in OntologyRowId::MIN..bound {
            let parents = postings
                .parents(type_row)
                .expect("the loop iterates the postings' own domain");
            for &parent in parents {
                pending[parent] += 1;
            }
        }

        let mut ready: Vec<OntologyRowId> = pending
            .iter_enumerated()
            .filter(|&(_, &children)| children == 0)
            .map(|(row, _)| row)
            .collect();
        let mut settled = 0_u64;
        while let Some(type_row) = ready.pop() {
            settled += 1;

            let parents = postings
                .parents(type_row)
                .expect("the loop iterates the postings' own domain");
            for &parent in parents {
                bits.union_rows(type_row, parent);

                pending[parent] -= 1;
                if pending[parent] == 0 {
                    ready.push(parent);
                }
            }
        }

        if settled != types as u64 {
            return Err(ParentCycle {
                entangled: types as u64 - settled,
            });
        }

        Ok(Self { bits })
    }

    /// Returns the type domain `T`.
    #[inline]
    #[must_use]
    pub(crate) const fn types(&self) -> usize {
        self.bits.row_domain_size()
    }

    /// Borrows `type_row`'s descendant row, when the row is in domain.
    #[must_use]
    pub(crate) fn descendants(&self, type_row: OntologyRowId) -> Option<RowRef<'_, OntologyRowId>> {
        (type_row.as_usize() < self.bits.row_domain_size()).then(|| self.bits.row(type_row))
    }

    /// Returns whether `descendant` descends from `ancestor` (a type descends from itself).
    ///
    /// [`None`] when either row is out of domain.
    #[must_use]
    pub(crate) fn contains(
        &self,
        ancestor: OntologyRowId,
        descendant: OntologyRowId,
    ) -> Option<bool> {
        let in_domain = ancestor.as_usize() < self.bits.row_domain_size()
            && descendant.as_usize() < self.bits.col_domain_size();

        in_domain.then(|| self.bits.contains(ancestor, descendant))
    }
}
