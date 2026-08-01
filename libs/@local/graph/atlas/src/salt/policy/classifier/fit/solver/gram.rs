//! The data Gram matrix `K` and the fold views the inner solves read it through.
//!
//! The exact Newton engine's capacitance blocks read pairwise embedding products `Kᵢⱼ = x̄ᵢᵀx̄ⱼ`.
//! Embeddings never change across outer iterations, regularization candidates, or folds, so the fit
//! assembles [`Gram`] once over the full training corpus and every fold solve reads its subset
//! through a [`GramView`] carrying the fold's member indices. Entries accumulate in `f64` through
//! the exact-product kernel [`AlignedVecN::dot_accumulated`], one independent dot per entry, so the
//! assembled bytes are deterministic and a view's entries equal a direct assembly over the subset
//! bit for bit.
//!
//! Storage is the packed lower triangle - `n(n+1)/2` components for `n` rows - and lookups are
//! symmetric: `entry(i, j)` and `entry(j, i)` read the same component.

use super::work::WorkCounters;
use crate::{dataset::CANONICAL_DIMENSIONS, math::AlignedVecN};

/// The packed symmetric Gram matrix of one training corpus.
#[derive(Debug)]
pub(crate) struct Gram {
    /// Corpus rows covered by the matrix.
    order: usize,
    /// The lower triangle in row order: row `i` holds `i + 1` components starting at `i·(i+1)/2`.
    entries: Box<[f64]>,
}

impl Gram {
    /// Assembles the Gram matrix over the corpus embeddings in one charged pass.
    ///
    /// Each entry is one independent double-accumulated dot, so the assembly is deterministic at
    /// any traversal order. Rows fill in ascending index. The work is `n(n+1)/2` wide dots, once
    /// per fit.
    pub(crate) fn assemble(
        embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>],
        counters: &mut WorkCounters,
    ) -> Self {
        counters.record_gram_assembly();

        let order = embeddings.len();
        let mut entries = Vec::with_capacity(packed_length(order));

        for (row, row_embedding) in embeddings.iter().enumerate() {
            for column_embedding in &embeddings[..=row] {
                entries.push(row_embedding.dot_accumulated(column_embedding));
            }
        }

        Self {
            order,
            entries: entries.into_boxed_slice(),
        }
    }

    /// Corpus rows covered by the matrix.
    pub(crate) const fn order(&self) -> usize {
        self.order
    }

    /// Returns the entry `Kᵢⱼ = x̄ᵢᵀx̄ⱼ`, symmetric in its indices.
    ///
    /// # Panics
    ///
    /// This panics when an index is not below the order.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the packed row offset divides the even product row·(row + 1) exactly"
    )]
    #[inline]
    pub(crate) fn entry(&self, i: usize, j: usize) -> f64 {
        let (row, column) = if i >= j { (i, j) } else { (j, i) };
        assert!(
            row < self.order,
            "gram index {row} is out of bounds for order {order}",
            order = self.order,
        );

        self.entries[row * (row + 1) / 2 + column]
    }
}

/// The packed lower-triangle length for `order` rows.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the triangle length divides the even product order·(order + 1) exactly"
)]
const fn packed_length(order: usize) -> usize {
    order * (order + 1) / 2
}

/// One solve's window onto a fit-level [`Gram`].
///
/// A full-corpus solve reads the matrix directly; a fold solve carries the ascending original
/// indices of its member rows and reads the full matrix through them. Either way, `entry(i, j)`
/// speaks the solve's own row indices.
#[derive(Debug, Copy, Clone)]
pub(crate) struct GramView<'fit> {
    /// The fit-level matrix.
    gram: &'fit Gram,
    /// Original corpus index per solve row.
    ///
    /// [`None`] is the identity of a full-corpus solve.
    members: Option<&'fit [usize]>,
}

impl<'fit> GramView<'fit> {
    /// The identity view of a full-corpus solve.
    pub(crate) const fn full(gram: &'fit Gram) -> Self {
        Self {
            gram,
            members: None,
        }
    }

    /// A fold view reading the member rows of the full matrix.
    ///
    /// # Panics
    ///
    /// This panics when a member index is not below the matrix order.
    pub(crate) fn subset(gram: &'fit Gram, members: &'fit [usize]) -> Self {
        assert!(
            members.iter().all(|member| *member < gram.order()),
            "every fold member indexes a row of the fit-level gram matrix",
        );

        Self {
            gram,
            members: Some(members),
        }
    }

    /// Rows covered by the view.
    pub(crate) fn order(&self) -> usize {
        self.members
            .map_or_else(|| self.gram.order(), <[usize]>::len)
    }

    /// Returns the entry `Kᵢⱼ` in the view's own row indices, symmetric in its indices.
    ///
    /// # Panics
    ///
    /// This panics when an index is not below the view's order.
    #[inline]
    pub(crate) fn entry(&self, i: usize, j: usize) -> f64 {
        self.members.map_or_else(
            || self.gram.entry(i, j),
            |members| self.gram.entry(members[i], members[j]),
        )
    }
}
