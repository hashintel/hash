//! The visibility seam.
//!
//! The server-held proof of what one scope may see, and the single join point every row ingress
//! factors through.
//!
//! [`VisibilityProof`] is the visible row set `V_u` as a value: the node rows one scope
//! may see under one generation and permission epoch. The proof covers the node universe alone - an
//! edge is visible exactly when both its endpoints are, so edge visibility derives wherever a node
//! set is already masked. Every assembly path takes a proof by construction; no `Option` exists
//! whose `None` means "everything", and the full-visibility value is a distinct, named constructor
//! rather than a default.
//!
//! [`Atlas::resolve`] is the single resolution seam: decode the wire id, then test mask
//! membership, with decode failure, out-of-universe values, and mask misses all collapsing to the
//! same [`None`] before any rendering observes the cause. [`VisibleRow`] has no other constructor,
//! so a row that reaches point-lookup assembly carries its visibility in the type; set-shaped paths
//! (tile gathers, edge endpoint sets) mask through [`VisibilityProof::intersect`] and
//! [`VisibilityProof::contains`] wholesale instead of minting a value per row.

use super::Atlas;
use crate::bitset::BitSet;

/// The server-held visibility proof of one scope: the node rows the scope may see.
///
/// A proof enters a handler by construction - the assembly signatures take one, so a missing proof
/// is unrepresentable rather than defaulted. The two constructors mark the two legitimate origins:
/// [`Self::full_visibility`] for operator serving without sessions, and [`Self::from_bitmap`] for a
/// scope's evaluated visibility bitmap.
///
/// Membership is fail-closed: a row beyond the held bitmap's capacity is not visible, so a proof
/// built against the wrong universe hides rows rather than revealing them.
#[derive(Debug, Clone)]
pub struct VisibilityProof {
    rows: Rows,
}

/// The proof's row set: everything, or exactly the bitmap.
#[derive(Debug, Clone)]
enum Rows {
    /// Every row of every universe is visible.
    Full,
    /// Exactly the set node rows are visible.
    Mask(BitSet),
}

impl VisibilityProof {
    /// Constructs the full-visibility proof: every row is visible.
    ///
    /// This is the operator constructor. A process that serves without scoped sessions - the
    /// standalone development server, operator tooling against a trusted port - constructs this
    /// value explicitly at startup. It is never a default and never the answer to a missing or
    /// failed session: a scope whose bitmap cannot be obtained is served nothing, not everything.
    #[must_use]
    pub const fn full_visibility() -> Self {
        Self { rows: Rows::Full }
    }

    /// Constructs a proof from one scope's visibility bitmap.
    ///
    /// Bit `r` set means node row `r` is visible.
    ///
    /// The bitmap is server-held state (a fresh visibility evaluation or a verified sealed blob),
    /// never a client-supplied value. Rows at or beyond the bitmap's capacity read as hidden.
    #[must_use]
    pub const fn from_bitmap(bitmap: BitSet) -> Self {
        Self {
            rows: Rows::Mask(bitmap),
        }
    }

    /// Returns whether this is the full-visibility proof, the masked paths' fast-path test.
    pub(super) const fn is_full(&self) -> bool {
        matches!(self.rows, Rows::Full)
    }

    /// Returns whether node row `row` is visible.
    pub(super) const fn contains(&self, row: u32) -> bool {
        match &self.rows {
            Rows::Full => true,
            Rows::Mask(bitmap) => {
                let index = row as usize;
                index < bitmap.len() && bitmap.contains(index)
            }
        }
    }

    /// Returns whether the edge with endpoints `source` and `target` is visible.
    ///
    /// Edge visibility is both endpoints', derived, never independently granted.
    pub(super) const fn edge_visible(&self, source: u32, target: u32) -> bool {
        self.contains(source) && self.contains(target)
    }

    /// Removes every hidden row from `set`, leaving the visible subset.
    pub(super) fn intersect(&self, set: &mut BitSet) {
        match &self.rows {
            Rows::Full => {}
            Rows::Mask(bitmap) => set.intersect_with(bitmap),
        }
    }

    /// Counts the visible rows of the universe `[0, n)`.
    pub(super) fn visible_below(&self, n: u64) -> u64 {
        match &self.rows {
            Rows::Full => n,
            Rows::Mask(bitmap) => bitmap.iter().take_while(|&row| (row as u64) < n).count() as u64,
        }
    }

    /// Proves one row visible: the sole [`VisibleRow`] constructor.
    ///
    /// Wire-domain ingress reaches this through [`Atlas::resolve`]; identity-domain ingress
    /// (translate, locate by entity id) lands on internal rows without a decode and calls this
    /// directly. Either way every failure is the same [`None`].
    pub(super) fn verify(&self, row: u32) -> Option<VisibleRow> {
        self.contains(row).then_some(VisibleRow { row })
    }
}

/// A node row that carries its visibility proof in the type.
///
/// The only constructor is the resolution seam, so an assembly function that takes a [`VisibleRow`]
/// cannot be reached with an unproven row. The value is the internal row id for in-process gathers;
/// it never crosses the wire.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct VisibleRow {
    row: u32,
}

impl VisibleRow {
    /// Returns the proven row id.
    pub(super) const fn get(self) -> u32 {
        self.row
    }
}

impl Atlas {
    /// Resolves a wire node row id to its proven-visible internal row.
    ///
    /// The single join point of the response discipline.
    ///
    /// Decode failure (out-of-universe wire values) and mask misses (rows the proof hides) both
    /// answer the same [`None`], so forbidden and nonexistent are indistinguishable to everything
    /// downstream - the transport renders one problem body for both, and nothing upstream of this
    /// seam logs or branches on the cause.
    #[must_use]
    pub fn resolve(&self, proof: &VisibilityProof, wire: u32) -> Option<VisibleRow> {
        proof.verify(self.node_codec.decode(wire)?)
    }
}
