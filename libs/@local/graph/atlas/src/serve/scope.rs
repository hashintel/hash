//! The scope seam.
//!
//! Which serving surfaces the bound authority reaches, beside the row set it may see.
//!
//! A read is answered under two independent statements. [`VisibilityProof`] says which rows the
//! bound authority sees, and refuses inside a response: a hidden row leaves bytes shaped exactly
//! as if it never existed. [`ScopeReach`] says which surfaces answer the authority at all, and
//! refuses before assembly: an unreachable surface produces no response.
//!
//! Link-bearing surfaces answer the operator scope. Edge sets are derived from node visibility,
//! and node visibility answers nothing about whether the authority may see the link rows
//! themselves, so a surface whose subject is links has no statement of its own authorization to
//! serve under and refuses instead.

use super::visibility::VisibilityProof;

/// How far one bound authority reaches across the read surface.
///
/// The value names an authority's reach over the surfaces; [`VisibilityProof`] names its reach
/// over rows. Both accompany every request, and a request satisfies both.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ScopeReach {
    /// Every surface, over the whole corpus.
    Operator,
    /// The node-bearing surfaces, over a restricted view of the corpus.
    Restricted,
}

impl ScopeReach {
    /// Derives the reach from the proof the transport holds.
    ///
    /// [`VisibilityProof::full_visibility`] is the operator constructor, so a proof built through
    /// it resolves [`Operator`](Self::Operator) and a proof built from a visibility bitmap
    /// resolves [`Restricted`](Self::Restricted). The reading is of the constructor, never of the
    /// row count: a bitmap admitting every row of the corpus resolves restricted, because the
    /// authority that supplied it declared a scope rather than operator authority.
    ///
    /// The reading decides reach alone. A resolved cut, a permission epoch, and an encoder or
    /// protocol selection are authenticated statements an authority supplies; a proof carries
    /// none of them, and none is derivable from one.
    #[must_use]
    pub const fn from_proof(proof: &VisibilityProof) -> Self {
        if proof.is_full() {
            Self::Operator
        } else {
            Self::Restricted
        }
    }

    /// Returns whether the link-bearing surfaces answer under this scope.
    ///
    /// The edges and locate endpoints and translate's link domain are link-bearing; the tile,
    /// manifest, current, and translate node surfaces answer under every scope.
    #[must_use]
    pub const fn serves_links(self) -> bool {
        matches!(self, Self::Operator)
    }
}
