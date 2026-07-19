//! The type closure map: descendant bitsets over the parent graph.
//!
//! Request-time inheritance expansion is one OR: a requested type's
//! descendant row names every type whose instances the request
//! matches, so expanding a request is `OR` of the requested rows and
//! testing a type against a request is one bit read. The map derives
//! at open from the published parent edges, the one authority for
//! inheritance, and lives on the heap: `T^2` bits stay in the low
//! megabytes while `T` stays in the low thousands (`PLAN.md` "Serving
//! contract requirements").

use crate::{dataset::OntologyRowId, salt::postings::mapped::MappedPostings};

/// The parent graph holds a cycle, so no descendant order exists.
///
/// Type inheritance is acyclic at the source; a cycle in published
/// bytes means the generation's ontology stream was defective.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ParentCycle {
    /// Types entangled in cycles: every type whose descendant set
    /// never settled.
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
/// Row `t` marks every type whose instances a filter or coloring
/// request naming `t` matches: `t` itself and every type reaching `t`
/// through parent edges. Rows are `ceil(T/64)` words, LSB-first, laid
/// out row-major so a request's expansion ORs whole rows word-wise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ClosureMap {
    /// The type domain `T`.
    types: usize,
    /// Words per row: `ceil(T/64)`.
    stride: usize,
    /// `T` rows of `stride` words.
    bits: Box<[u64]>,
}

impl ClosureMap {
    /// Derives the closure map from the opened postings' parent graph.
    ///
    /// Types are processed children-first (Kahn's ordering over the
    /// parent edges): a type's settled descendant row ORs into each of
    /// its parents' rows, so every row settles in one pass over the
    /// edges.
    ///
    /// # Errors
    ///
    /// Returns [`ParentCycle`] when the parent graph holds a cycle, in
    /// which case the generation's ontology stream was defective.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(postings: &MappedPostings) -> Result<Self, ParentCycle> {
        let types = usize::try_from(postings.types()).expect("resident type domains fit usize");
        let stride = types.div_ceil(u64::BITS as usize);
        let mut bits = vec![0_u64; types * stride].into_boxed_slice();

        // Every type descends from itself: a request naming `t`
        // matches instances of `t` directly.
        for type_row in 0..types {
            bits[type_row * stride + (type_row >> 6)] |= 1 << (type_row & 63);
        }

        // Pending children per type; a type's row settles once every
        // child's row has been folded into it.
        let mut pending = vec![0_u64; types];
        for type_row in 0..types {
            for &parent in parents(postings, type_row) {
                pending[parent as usize] += 1;
            }
        }

        let mut ready: Vec<usize> = (0..types).filter(|&row| pending[row] == 0).collect();
        let mut settled = 0_u64;
        let mut scratch = vec![0_u64; stride];
        while let Some(type_row) = ready.pop() {
            settled += 1;

            // The settled row is copied out once so the fold below can
            // borrow the matrix mutably at each parent.
            scratch.copy_from_slice(&bits[type_row * stride..(type_row + 1) * stride]);
            for &parent in parents(postings, type_row) {
                let parent = parent as usize;
                let row = &mut bits[parent * stride..(parent + 1) * stride];
                for (word, &child_word) in row.iter_mut().zip(&scratch) {
                    *word |= child_word;
                }

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

        Ok(Self {
            types,
            stride,
            bits,
        })
    }

    /// Returns the type domain `T`.
    #[inline]
    #[must_use]
    pub(crate) const fn types(&self) -> usize {
        self.types
    }

    /// Returns the words per row: the length expansion scratch rows
    /// allocate at.
    #[inline]
    #[must_use]
    pub(crate) const fn stride(&self) -> usize {
        self.stride
    }

    /// Borrows `type_row`'s descendant row, when the row is in domain:
    /// `ceil(T/64)` words, LSB-first.
    #[must_use]
    pub(crate) fn descendants(&self, type_row: OntologyRowId) -> Option<&[u64]> {
        let row = usize::try_from(type_row.get())
            .ok()
            .filter(|&row| row < self.types)?;
        Some(&self.bits[row * self.stride..(row + 1) * self.stride])
    }

    /// Returns whether `descendant` descends from `ancestor` (a type
    /// descends from itself), [`None`] when either row is out of
    /// domain.
    #[must_use]
    pub(crate) fn contains(
        &self,
        ancestor: OntologyRowId,
        descendant: OntologyRowId,
    ) -> Option<bool> {
        let row = self.descendants(ancestor)?;
        let bit = usize::try_from(descendant.get())
            .ok()
            .filter(|&bit| bit < self.types)?;

        Some(row[bit >> 6] & (1 << (bit & 63)) != 0)
    }
}

/// Borrows `type_row`'s validated parent list.
fn parents(postings: &MappedPostings, type_row: usize) -> &[u32] {
    postings
        .parents(OntologyRowId::new(type_row as u64))
        .expect("the loop iterates the postings' own domain")
}
