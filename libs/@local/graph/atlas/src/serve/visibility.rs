//! The visibility seam.
//!
//! The server-held proof of which rows are visible, and the single join point every row ingress
//! factors through.
//!
//! [`VisibilityProof`] is the visible row set `V_u` as a value: caller-supplied row masks
//! interpreted against the opened generation's row universes. The value carries the row sets
//! alone; generation, scope, and permission-epoch binding are its caller's contract, not fields of
//! the type. The proof covers two domains, node rows and link rows, because a link entity carries
//! authorization of its own that its endpoints do not imply - a caller may read two entities and
//! not the relation between them - so an edge delivers only when the proof holds its link row and
//! both of its endpoints. The two masks are separate types, so neither can be read where the other
//! belongs. Every assembly path takes a proof by construction; no `Option` exists whose `None`
//! means "everything", and the full-visibility value is a distinct, named constructor rather than
//! a default.
//!
//! [`Atlas::resolve`] is the single resolution seam: decode the wire id, then test mask
//! membership, with decode failure, out-of-universe values, and mask misses all collapsing to the
//! same [`None`] before any rendering observes the cause. [`VisibleRow`] has no other constructor,
//! so a row that reaches point-lookup assembly carries its visibility in the type; [`VisibleEdge`]
//! is the same discipline over the link domain, minted only by
//! [`VisibilityProof::verify_edge`], which is the delivery rule itself. Set-shaped node paths
//! (tile gathers) mask through [`VisibilityProof::intersect`] and [`VisibilityProof::contains`]
//! wholesale instead of minting a value per row.

use hashql_core::id::{Id, bit_vec::DenseBitSet};

use super::{Atlas, WireRow};
use crate::{
    bitset::CompressedBitSet,
    identity::{EdgeRowId, NodeRowId},
};

/// The server-held visibility proof: the visible node-row and link-row sets every assembly path
/// masks by.
///
/// A proof enters a handler by construction - the assembly signatures take one, so a missing proof
/// is unrepresentable rather than defaulted. The two constructors mark the two legitimate origins:
/// [`Self::full_visibility`] for operator serving without sessions, and [`Self::from_masks`] for
/// server-held evaluated visibility masks.
///
/// Membership is fail-closed: a row a held mask does not admit is not visible, so a proof built
/// against a smaller universe hides the excess rather than revealing it. The value authenticates
/// nothing: masks from the wrong universe mask the wrong rows undetected, so holding the proof to
/// the generation it was evaluated for is the caller's contract.
#[derive(Debug, Clone)]
pub struct VisibilityProof {
    nodes: Rows<NodeRowId>,
    edges: Rows<EdgeRowId>,
}

/// One domain's visible row set: everything, or exactly the mask.
///
/// The domain is the type parameter, so a node mask and a link mask are values of different types
/// and reading one where the other belongs does not compile.
#[derive(Debug, Clone)]
enum Rows<T: Id> {
    /// Every row of the domain is visible.
    Full,
    /// Exactly the set rows are visible.
    Mask(CompressedBitSet<T>),
}

impl<T: Id> Rows<T> {
    /// Returns whether `row` is visible.
    ///
    /// Fail-closed at every edge: a row the mask does not admit is hidden, including one above the
    /// mask's representable domain, so a mask evaluated against a narrower universe hides the
    /// excess.
    fn contains(&self, row: T) -> bool {
        match self {
            Self::Full => true,
            Self::Mask(mask) => mask.contains(row),
        }
    }

    /// Returns whether this set was built as the unmasked one.
    const fn is_full(&self) -> bool {
        matches!(self, Self::Full)
    }
}

impl VisibilityProof {
    /// Constructs the full-visibility proof: every row of every domain is visible.
    ///
    /// This is the operator constructor. A process that serves without scoped sessions - the
    /// standalone development server, operator tooling against a trusted port - constructs this
    /// value explicitly at startup. Caller requirement: this value is never a default and never
    /// the answer to a missing or failed session - the type performs no session resolution, so
    /// only deliberate operator configuration may construct it.
    #[must_use]
    pub const fn full_visibility() -> Self {
        Self {
            nodes: Rows::Full,
            edges: Rows::Full,
        }
    }

    /// Constructs a proof from server-held visibility masks, one per domain.
    ///
    /// An admitted row is visible: `nodes` masks the node rows, `edges` the link rows. Both are
    /// required, because neither implies the other - the link rows a caller may read are not a
    /// function of the node rows it may read.
    ///
    /// Caller requirement: the masks are server-held state (a fresh visibility evaluation or a
    /// verified sealed blob), never client-supplied values - the constructor accepts any masks and
    /// verifies no origin. A row either mask does not admit is hidden.
    #[must_use]
    pub const fn from_masks(
        nodes: CompressedBitSet<NodeRowId>,
        edges: CompressedBitSet<EdgeRowId>,
    ) -> Self {
        Self {
            nodes: Rows::Mask(nodes),
            edges: Rows::Mask(edges),
        }
    }

    /// Returns whether this is the full-visibility proof, the masked paths' fast-path test.
    ///
    /// This reads which constructor built the value, never how many rows its masks admit: masks
    /// admitting every row of a generation are still a declared scope, and reading them as the
    /// operator proof would serve that scope the operator surface.
    pub(super) const fn is_full(&self) -> bool {
        self.nodes.is_full() && self.edges.is_full()
    }

    /// Returns whether node row `row` is visible.
    pub(super) fn contains(&self, row: NodeRowId) -> bool {
        self.nodes.contains(row)
    }

    /// Removes every hidden row from `set`, leaving the visible subset.
    pub(super) fn intersect(&self, set: &mut DenseBitSet<NodeRowId>) {
        if self.nodes.is_full() {
            return;
        }

        let hidden: Vec<NodeRowId> = set.iter().filter(|&row| !self.contains(row)).collect();
        for row in hidden {
            set.remove(row);
        }
    }

    /// Counts the visible node rows of the universe `[0, n)`.
    pub(super) fn visible_below(&self, n: u64) -> u64 {
        match &self.nodes {
            Rows::Full => n,
            Rows::Mask(mask) => mask.iter().take_while(|row| row.as_u64() < n).count() as u64,
        }
    }

    /// Proves one node row visible: the sole [`VisibleRow`] constructor.
    ///
    /// Wire-domain ingress reaches this through [`Atlas::resolve`]; identity-domain ingress
    /// (translate, locate by entity id) lands on internal rows without a decode and calls this
    /// directly. Either way every failure is the same [`None`].
    pub(super) fn verify(&self, row: NodeRowId) -> Option<VisibleRow> {
        self.contains(row).then_some(VisibleRow(row))
    }

    /// Proves one edge deliverable: the sole [`VisibleEdge`] constructor.
    ///
    /// An edge delivers only when the proof holds its own link row and both of its endpoints. The
    /// link row carries the link entity's authorization, which the endpoints do not imply; the
    /// endpoints carry the two entities every edge response names. A hidden link row, a hidden
    /// endpoint, and an edge the generation never held all answer the same [`None`].
    ///
    /// Caller requirement: `source` and `target` are `edge`'s own endpoints as the generation
    /// records them, read off the endpoint column rather than supplied by a request.
    pub(super) fn verify_edge(
        &self,
        edge: EdgeRowId,
        source: NodeRowId,
        target: NodeRowId,
    ) -> Option<VisibleEdge> {
        (self.edges.contains(edge) && self.contains(source) && self.contains(target))
            .then_some(VisibleEdge(edge))
    }
}

/// A node row that carries its visibility proof in the type.
///
/// The only constructor is the resolution seam, so an assembly function that takes a [`VisibleRow`]
/// cannot be reached with an unproven row. The value is the internal row id for in-process gathers;
/// it never crosses the wire.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct VisibleRow(NodeRowId);

impl VisibleRow {
    /// Returns the proven row id.
    pub(super) const fn get(self) -> NodeRowId {
        self.0
    }
}

/// A link row that carries its delivery proof in the type.
///
/// The only constructor is [`VisibilityProof::verify_edge`], which is the delivery rule itself, so
/// an assembly value holding one cannot exist for an edge the proof withholds - the check is
/// consumed rather than consulted. The value is the internal row id for in-process gathers; it
/// never crosses the wire.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct VisibleEdge(EdgeRowId);

impl VisibleEdge {
    /// Returns the proven row id.
    pub(super) const fn get(self) -> EdgeRowId {
        self.0
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
    pub fn resolve(&self, proof: &VisibilityProof, wire: WireRow<NodeRowId>) -> Option<VisibleRow> {
        proof.verify(self.node_codec.decode(wire)?)
    }
}
