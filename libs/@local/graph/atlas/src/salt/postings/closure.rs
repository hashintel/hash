//! The type closure map: descendant bitsets over the parent graph.
//!
//! Request-time inheritance expansion is one OR: a requested type's descendant row names every type
//! whose instances the request matches, so expanding a request is `OR` of the requested rows and
//! testing a type against a request is one bit read. The map derives at open from the published
//! parent edges, the one authority for inheritance, and lives on the heap: `T^2` bits stay in the
//! low megabytes while `T` stays in the low thousands.

use hashql_core::id::{
    Id as _,
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
    /// Types are processed children-first (Kahn's ordering over the parent edges): a type's settled
    /// descendant row ORs into each of its parents' rows, so every row settles in one pass over the
    /// edges.
    ///
    /// # Errors
    ///
    /// Returns [`ParentCycle`] when the parent graph holds a cycle, in which case the generation's
    /// ontology stream was defective.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(postings: &PostingsArchive) -> Result<Self, ParentCycle> {
        let types = usize::try_from(postings.types()).expect("resident type domains fit usize");
        let mut bits = BitMatrix::new(types, types);

        // Every type descends from itself: a request naming `t`
        // matches instances of `t` directly.
        for type_row in 0..types {
            let type_row = OntologyRowId::from_usize(type_row);
            bits.insert(type_row, type_row);
        }

        // Pending children per type; a type's row settles once every
        // child's row has been folded into it.
        let mut pending = vec![0_u64; types];
        for type_row in 0..types {
            let parents = postings
                .parents(OntologyRowId::from_usize(type_row))
                .expect("the loop iterates the postings' own domain");
            for &parent in parents {
                pending[parent as usize] += 1;
            }
        }

        let mut ready: Vec<usize> = (0..types).filter(|&row| pending[row] == 0).collect();
        let mut settled = 0_u64;
        while let Some(type_row) = ready.pop() {
            settled += 1;

            let parents = postings
                .parents(OntologyRowId::from_usize(type_row))
                .expect("the loop iterates the postings' own domain");
            for &parent in parents {
                let parent = parent as usize;
                bits.union_rows(
                    OntologyRowId::from_usize(type_row),
                    OntologyRowId::from_usize(parent),
                );

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
