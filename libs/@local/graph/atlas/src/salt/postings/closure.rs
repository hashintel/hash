//! The type closure map gives each type a descendant bitset over the parent graph.
//!
//! Request-time inheritance expansion is one OR. A requested type's descendant row names every type
//! whose instances the request matches, so expanding a request is `OR` of the requested rows and
//! testing a type against a request is one bit read. The map derives at open from the published
//! parent edges, the one authority for inheritance, and lives on the heap: `T^2` bits stay in the
//! low megabytes while `T` stays in the low thousands.
//!
//! The same derivation resolves the icon memo: each type's nearest icon-bearing ancestor, settled
//! once at open, so a tile read costs one memo lookup per direct type. The memo records row
//! identities, and payload bytes resolve at read time against the table that owns them.

use hashql_core::id::{
    Id as _, IdVec,
    bit_vec::{BitMatrix, BitRelations as _, RowRef},
};

use super::artifact::Membership;
use crate::{
    bitset::DenseBitSlice,
    identity::{BasePosition, OntologyRowId},
    salt::postings::artifact::PostingsArchive,
};

/// The parent graph holds a cycle, so no descendant order exists.
///
/// Type inheritance is acyclic at the source, so a cycle in published bytes means the generation's
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

/// One type's nearest icon-bearing ancestor.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct IconSource {
    /// The icon-bearing type row.
    pub source: OntologyRowId,
    /// Parent edges walked from the resolving type to [`Self::source`].
    ///
    /// A type carrying its own icon resolves to itself at depth zero.
    pub depth: u32,
}

/// Descendant bitsets over the type domain, one row per type.
///
/// Row `t` marks every type whose instances a filter or coloring request naming `t` matches: `t`
/// itself and every type reaching `t` through parent edges - a `T` by `T` [`BitMatrix`], so a
/// request's expansion ORs whole rows word-wise.
#[derive(Debug, Clone)]
pub(crate) struct ClosureMap {
    bits: BitMatrix<OntologyRowId, OntologyRowId>,
    icon_sources: IdVec<OntologyRowId, Option<IconSource>>,
    memberships: IdVec<OntologyRowId, Option<Box<DenseBitSlice<BasePosition>>>>,
}

impl ClosureMap {
    /// Derives the closure map from the opened postings' parent graph.
    ///
    /// The derivation walks types children-first in Kahn's ordering over the parent edges. A type's
    /// settled descendant row ORs into each of its parents' rows, so every row settles in one pass
    /// over the edges.
    ///
    /// `icons` names the type rows carrying their own icon, and a second pass unwinds the recorded
    /// settle order, so every type follows its whole ancestor cone, resolving each type's
    /// [`IconSource`]. An icon row resolves to itself at depth zero. Every other type takes the
    /// shallowest parent resolution one edge deeper, and equal depths resolve to the earlier parent
    /// in the run.
    ///
    /// # Errors
    ///
    /// Returns [`ParentCycle`] when the parent graph holds a cycle, in which case the generation's
    /// ontology stream was defective.
    ///
    /// # Panics
    ///
    /// This panics when `icons` names a row outside the postings' type domain.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(
        postings: &PostingsArchive,
        icons: impl IntoIterator<Item = OntologyRowId>,
    ) -> Result<Self, ParentCycle> {
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

        let mut settled: Vec<OntologyRowId> = Vec::with_capacity(types);
        while let Some(r#type) = ready.pop() {
            settled.push(r#type);

            let parents = postings
                .parents(r#type)
                .expect("the loop iterates the postings' own domain");
            for &parent in parents {
                bits.union_rows(r#type, parent);

                pending[parent] -= 1;
                if pending[parent] == 0 {
                    ready.push(parent);
                }
            }
        }

        if settled.len() != types {
            return Err(ParentCycle {
                entangled: types as u64 - settled.len() as u64,
            });
        }

        // An icon row is its own source at depth zero, and the resolution pass below leaves
        // these seeded entries standing.
        let mut icon_sources: IdVec<OntologyRowId, Option<IconSource>> =
            IdVec::from_elem(None, types);
        for source in icons {
            icon_sources[source] = Some(IconSource { source, depth: 0 });
        }

        // The walk settled children before parents, so unwinding it hands every type its
        // ancestors first: each type resolves against parents that already have.
        while let Some(r#type) = settled.pop() {
            if icon_sources[r#type].is_some() {
                continue;
            }

            let parents = postings
                .parents(r#type)
                .expect("the settle order names the postings' own domain");

            let mut best: Option<IconSource> = None;
            for &parent in parents {
                let Some(IconSource { source, depth }) = icon_sources[parent] else {
                    continue;
                };
                let depth = depth + 1;

                // Strictly-shallower replaces, so an equal-depth tie keeps the earlier parent
                // in the run: ascending rows, the artifact contract.
                if best.is_none_or(|held| depth < held.depth) {
                    best = Some(IconSource { source, depth });
                }
            }

            icon_sources[r#type] = best;
        }

        let mut memberships = IdVec::new();
        for r#type in bits.rows() {
            let row = bits.row(r#type);
            if row.count() == 1 {
                continue;
            }

            // We need to compute the membership instead
            let mut membership = DenseBitSlice::new_empty(
                usize::try_from(postings.points())
                    .expect("resident point domains should fit usize"),
            );
            for col in row {
                match postings
                    .membership(col)
                    .expect("membership should be available")
                {
                    Membership::List(base_positions) => {
                        for &position in base_positions {
                            membership.insert(position);
                        }
                    }
                    Membership::Dense(direct) => {
                        membership.union(direct);
                    }
                }
            }

            memberships.insert(r#type, membership);
        }

        Ok(Self {
            bits,
            icon_sources,
            memberships,
        })
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

    /// Resolves the nearest icon-bearing ancestor within the closure.
    ///
    /// Returns [`None`] outside the type domain or for an icon-free cone. Equal-depth candidates
    /// resolve to the earlier parent in the artifact's ascending-row parent order.
    #[must_use]
    pub(crate) fn icon_source(&self, type_row: OntologyRowId) -> Option<IconSource> {
        self.icon_sources.lookup(type_row).copied()
    }

    pub(crate) fn membership(
        &self,
        type_row: OntologyRowId,
    ) -> Option<&DenseBitSlice<BasePosition>> {
        self.memberships.lookup(type_row).map(|slice| &**slice)
    }

    /// Returns whether `descendant` descends from `ancestor` (a type descends from itself).
    ///
    /// [`None`] when either row is out of domain.
    #[must_use]
    #[cfg(test)] // The postings tests probe ancestry pairs directly.
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
