//! Inherited type memberships and icon sources derived from the parent graph.
//!
//! The published parent edges are the authority for inheritance. For a domain of `T` types, a `T`
//! by `T` descendant matrix names every type whose instances a request naming an ancestor matches.
//! Each row folds into one membership bitset over base positions per type with descendants beyond
//! itself. A type whose only descendant is itself keeps no closure membership. Use its postings'
//! direct membership instead. The map retains the descendant matrix alongside these derived
//! memberships.
//!
//! The topological order also resolves each type's nearest icon-bearing ancestor once at open. The
//! memo records row identities. Payload bytes resolve at read time against the table that owns
//! them.

#[cfg(test)]
use hashql_core::id::bit_vec::RowRef;
use hashql_core::id::{
    Id as _, IdVec,
    bit_vec::{BitMatrix, BitRelations as _},
};

use super::artifact::Membership;
use crate::{
    bitset::DenseBitSlice,
    identity::{BasePosition, OntologyRowId},
    salt::postings::artifact::PostingsArchive,
};

/// A cycle preventing a children-first ordering of the parent graph.
///
/// Type inheritance requires an acyclic parent graph. This error reports a cycle in the supplied
/// parent edges.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ParentCycle {
    /// Types whose descendant sets never settled: cycle members and all of their ancestors.
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

/// Inherited memberships and nearest icon sources for the type domain.
///
/// A filter or coloring request naming `t` matches the instances of `t` itself and of every type
/// reaching `t` through parent edges. [`membership`](Self::membership) answers that set as one
/// bitset over base positions for types with descendants beyond themselves. For a type whose only
/// descendant is itself, use its direct postings membership. [`icon_source`](Self::icon_source)
/// resolves the memoized icon ancestor.
#[derive(Debug, Clone)]
pub(crate) struct ClosureMap {
    /// Reflexive descendant reachability for each ontology row.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "closure map requires that the closure is correct, changing layout after \
                      test is strictly worse."
        )
    )]
    bits: BitMatrix<OntologyRowId, OntologyRowId>,
    icon_sources: IdVec<OntologyRowId, Option<IconSource>>,
    memberships: IdVec<OntologyRowId, Option<Box<DenseBitSlice<BasePosition>>>>,
}

impl ClosureMap {
    /// Derives the closure map from the opened postings' parent graph.
    ///
    /// In an acyclic parent graph, a type's descendants are itself and the union of its children's
    /// descendants. The derivation seeds the diagonal and processes types children-first in Kahn's
    /// order, combining each settled row into its parents' rows with bitwise OR. Therefore every
    /// row contains exactly its type's descendants once all of its children have settled.
    ///
    /// `icons` names the type rows carrying their own icon. A second pass reverses the settle order
    /// to resolve each type's [`IconSource`] after its parents. Each icon row resolves to itself at
    /// depth zero. Every other type takes the shallowest parent resolution one edge deeper. Equal
    /// depths resolve to the earlier parent in the run.
    ///
    /// # Errors
    ///
    /// Returns [`ParentCycle`] when the supplied parent graph holds a cycle.
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

        // every type descends from itself: a request naming `t` matches instances of `t` directly.
        for type_row in OntologyRowId::MIN..bound {
            bits.insert(type_row, type_row);
        }

        // a type's row settles once it has absorbed every child's row.
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

        // an icon row is its own source at depth zero. The resolution pass preserves these entries.
        let mut icon_sources: IdVec<OntologyRowId, Option<IconSource>> =
            IdVec::from_elem(None, types);
        for source in icons {
            icon_sources[source] = Some(IconSource { source, depth: 0 });
        }

        // reversing the children-first order resolves every parent before its children.
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

                // an equal-depth tie keeps the earlier parent in the run: ascending rows, the
                // artifact contract.
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
    #[cfg(test)] // The postings tests check the derived domain against the fixture.
    pub(crate) const fn types(&self) -> usize {
        self.bits.row_domain_size()
    }

    /// Borrows `type_row`'s descendant row, when the row is in domain.
    #[must_use]
    #[cfg(test)] // The postings tests verify the derivation against hand-derived descendant rows.
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

    /// Borrows the base positions of every instance of `type_row` or of a type descending from it.
    ///
    /// Returns [`None`] outside the type domain and for a type whose only descendant is itself,
    /// whose instances the postings' direct membership already names.
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
