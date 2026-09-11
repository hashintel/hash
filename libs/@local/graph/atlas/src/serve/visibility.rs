//! The visibility join point.
//!
//! The server-held proof of which rows are visible, and the single path every row ingress
//! factors through.
//!
//! [`VisibilityProof`] is the visible row set `V_u` as a value, the caller-supplied row masks
//! interpreted against the opened generation's row universes. The value carries the row sets alone.
//! Generation, scope, and permission-epoch binding are its caller's contract rather than fields of
//! the type. The proof covers two row domains, node rows and link rows, because a link entity
//! carries authorization of its own that its endpoints do not imply. A third, identity-keyed
//! domain covers delta links, the post-fit links a placement cohort publishes: their edge rows
//! are register-allocated past the baked bound, where no mask built over the generation's
//! universe can name them. Admission therefore keys by entity identity. Reading two entities never
//! implies reading the relation between them, so an edge delivers only when the proof admits its
//! link row and both of its endpoints. A node mask and a link mask are separate types, so nothing
//! reads one where the other belongs. Every assembly path takes a proof by construction. No
//! `Option` exists whose `None` means "everything", and the full-visibility value is a distinct,
//! named constructor rather than a default.
//!
//! [`Atlas::resolve`] is the single resolution path. It decodes the wire id and then tests mask
//! membership, with decode failure, out-of-universe values, and mask misses all collapsing to the
//! same [`None`] before any rendering observes the cause. [`VisibleRow`] has no other constructor,
//! so a row that reaches point-lookup assembly carries its visibility in the type; [`VisibleEdge`]
//! is the same discipline over the link domain, created only by [`VisibilityProof::verify_edge`],
//! which is the delivery rule itself. Set-shaped node paths (tile gathers) mask through
//! [`VisibilityProof::intersect`] and [`VisibilityProof::contains`] wholesale instead of creating
//! a value per row.

use hashql_core::{
    collections::FastHashSet,
    id::{Id, bit_vec::DenseBitSet},
};

use super::{
    Atlas, WireRow,
    delta::{DeltaSnapshot, PlacementCohort},
};
use crate::{
    bitset::CompressedBitSet,
    identity::{EdgeRowId, NodeRowId},
    postgres::id::ArchivedEntityId,
};

/// One domain's visible row set, either everything or exactly the mask.
///
/// The domain is the type parameter, so a node mask and a link mask are values of different types
/// and reading one where the other belongs does not compile.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Rows<T: Id> {
    /// Every row of the domain is visible.
    Full,
    /// Exactly the set rows are visible.
    Mask(CompressedBitSet<T>),
}

impl<T: Id> Rows<T> {
    /// Returns whether `row` is visible.
    ///
    /// The answer is fail-closed at every edge. A row the mask does not admit stays hidden,
    /// including one above the mask's representable domain, so a mask evaluated against a narrower
    /// universe hides the excess.
    fn contains(&self, row: T) -> bool {
        match self {
            Self::Full => true,
            Self::Mask(mask) => mask.contains(row),
        }
    }

    /// Returns whether this set is the unmasked one.
    const fn is_full(&self) -> bool {
        matches!(self, Self::Full)
    }

    /// Returns the axis's retained mask bytes, zero for the unmasked one.
    fn heap_bytes(&self) -> u64 {
        match self {
            Self::Full => 0,
            Self::Mask(mask) => mask.heap_bytes(),
        }
    }
}

/// Which delivery contract a proof serves.
///
/// [`VisibilityProof::full_visibility`] holds the corpus outright and answers [`Self::Corpus`].
/// [`VisibilityProof::from_masks`] declares a scope and answers [`Self::Scope`], whatever its masks
/// admit. A proof's kind and the `ViewSchedule` variant built over it are one bit spelled twice,
/// and binding a view refuses a pair that disagrees.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ProofKind {
    /// The whole corpus is visible, so the generation's corpus schedule serves this proof.
    ///
    /// Every zoom keeps its recorded cut, and no delivery-cut offset applies.
    Corpus,
    /// The proof declares a scope, so that scope's own cascade serves it.
    ///
    /// The cascade takes a delivery-cut offset, which an issuance over this proof resolves.
    Scope,
}

/// The delta-link identities a proof admits, either every one or exactly the captured set.
///
/// A delta link's edge row is register-allocated past the baked bound, outside any mask built
/// over the generation's universe, so admission keys by entity identity where node and
/// link rows mask by row id. The full arm admits every live delta link of the caller's snapshot,
/// the same all-admitted semantics the row domains carry. The admitted arm holds exactly the
/// identities the scope's own resolution returned.
#[derive(Debug, Clone, PartialEq, Eq)]
enum DeltaLinks {
    /// The proof admits every live delta link of the caller's snapshot.
    Full,
    /// The proof admits exactly the captured identities.
    Admitted(FastHashSet<ArchivedEntityId>),
}

impl DeltaLinks {
    /// Returns whether the set admits the delta link `id` names.
    ///
    /// Fail-closed exactly as [`Rows::contains`]: an identity the captured set does not hold is
    /// not admitted, whatever the caller's snapshot publishes for it.
    fn admits(&self, id: ArchivedEntityId) -> bool {
        match self {
            Self::Full => true,
            Self::Admitted(links) => links.contains(&id),
        }
    }

    /// Returns the axis's retained set bytes, zero for the unmasked one.
    fn heap_bytes(&self) -> u64 {
        match self {
            Self::Full => 0,
            Self::Admitted(links) => links.allocation_size() as u64,
        }
    }
}

/// The server-held visibility proof, the visible node-row and link-row sets every assembly path
/// masks by.
///
/// A proof enters a handler by construction, because the assembly signatures take one, so a missing
/// proof is unrepresentable rather than defaulted. [`Self::from_masks`] builds the proof of an
/// evaluated scope, one mask per identity domain, and [`Self::full_visibility`] the proof that
/// admits every row of every domain, for a context that holds authority over the whole corpus.
///
/// Membership is fail-closed. A row a held mask does not admit is not visible, so a proof built
/// against a smaller universe hides the excess rather than revealing it. The value authenticates
/// nothing, so masks from the wrong universe mask the wrong rows undetected, and pinning the proof
/// to its own generation is the caller's contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct VisibilityProof {
    nodes: Rows<NodeRowId>,
    edges: Rows<EdgeRowId>,
    delta_links: DeltaLinks,
}

impl VisibilityProof {
    /// Constructs the proof under which every row of every domain is visible.
    ///
    /// The proof carries authority over the whole corpus, and a caller states that authority by
    /// choosing this constructor. The type performs no session resolution, so this value carries no
    /// evidence of its own.
    ///
    /// Caller requirement: a served request answers under the proof of the scope resolved for it.
    /// This value is the authority of a context that holds the corpus outright, such as operator
    /// tooling over a trusted port and the fixtures that assert unmasked delivery.
    #[must_use]
    pub(crate) const fn full_visibility() -> Self {
        Self {
            nodes: Rows::Full,
            edges: Rows::Full,
            delta_links: DeltaLinks::Full,
        }
    }

    /// Constructs a proof from server-held visibility masks, one per domain.
    ///
    /// An admitted row is visible: `nodes` masks the node rows, `edges` the link rows, and
    /// `delta_links` admits the delta-link identities beside them. The proof needs all of them,
    /// because none implies another - the link rows a caller may read are not a function of the
    /// node rows it may read, and a delta link's register-allocated row is one neither mask
    /// could name.
    ///
    /// Caller requirement: the masks are server-held state (a fresh visibility evaluation or a
    /// verified sealed blob), never client-supplied values - the constructor accepts any masks and
    /// verifies no origin. A row either mask does not admit stays hidden, and a delta link
    /// outside the captured set never serves.
    #[must_use]
    pub(crate) const fn from_masks(
        nodes: CompressedBitSet<NodeRowId>,
        edges: CompressedBitSet<EdgeRowId>,
        delta_links: FastHashSet<ArchivedEntityId>,
    ) -> Self {
        Self {
            nodes: Rows::Mask(nodes),
            edges: Rows::Mask(edges),
            delta_links: DeltaLinks::Admitted(delta_links),
        }
    }

    /// Folds `snapshot`'s withdrawals out of the proof's masked domains.
    ///
    /// A withdrawn fitted node or edge row leaves its mask, and a withdrawn identity leaves the
    /// admitted delta-link set, so a folded scoped proof admits nothing `snapshot` withdraws.
    /// Full domains stay full: admission subtraction remains the corpus proof's whole withdrawal
    /// authority, and the fold never narrows an authority the resolution declared corpus-wide.
    ///
    /// The arrival surfaces need no fold. A snapshot publishes placed arrivals, slots, and links
    /// only for identities standing live at its publication, so no admitted slot or captured
    /// link can name an identity the same snapshot withdraws.
    ///
    /// Caller requirement: `snapshot` is the one the proof's own resolution read. Folding a
    /// different publication leaves rows that publication withdraws admitted, and the masks
    /// carry no record of which snapshot they folded.
    pub(crate) fn fold_withdrawn(&mut self, snapshot: &DeltaSnapshot) {
        if let Rows::Mask(nodes) = &mut self.nodes {
            for row in snapshot.withdrawn_node_rows() {
                nodes.remove(row);
            }
        }

        if let Rows::Mask(edges) = &mut self.edges {
            for row in snapshot.withdrawn_edge_rows() {
                edges.remove(row);
            }
        }

        if let DeltaLinks::Admitted(links) = &mut self.delta_links {
            links.retain(|&id| !snapshot.withdraws(id));
        }
    }

    /// Returns which delivery contract this proof serves.
    ///
    /// The answer reads which constructor built the value, never how many rows its masks admit.
    /// Masks admitting every row of a generation are still a declared scope, and reading them as
    /// the corpus proof would serve that scope the operator's own schedule and cut. Both callers
    /// are cheap paths that ask before doing work: the masked gathers skip their masking when the
    /// whole corpus is visible, and an issuance resolves an occupancy aggregate only for a scope.
    #[must_use]
    pub(crate) const fn kind(&self) -> ProofKind {
        if self.nodes.is_full() && self.edges.is_full() {
            ProofKind::Corpus
        } else {
            ProofKind::Scope
        }
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

    /// Returns whether the node axis admits every row of the universe `[0, n)`.
    ///
    /// The answer reads visibility rather than the constructor, so a mask admitting the whole
    /// universe answers `true` exactly as the full constructor does, and stays a declared scope
    /// under [`Self::kind`]. Rows a mask admits at or above `n` never count against the answer.
    pub(super) fn nodes_saturated_below(&self, n: u64) -> bool {
        match &self.nodes {
            Rows::Full => true,
            Rows::Mask(mask) => mask.contains_below(n),
        }
    }

    /// Returns the proof's retained mask bytes.
    ///
    /// A full axis holds no mask and counts zero, so the figure prices exactly what holding
    /// this proof keeps allocated. The delta-link set prices its identities beside the two row
    /// masks.
    pub(super) fn heap_bytes(&self) -> u64 {
        self.nodes.heap_bytes() + self.edges.heap_bytes() + self.delta_links.heap_bytes()
    }

    /// Returns whether the proof admits the delta link `id` names.
    ///
    /// The full-visibility proof admits every one, and a scoped proof exactly the identities its
    /// own resolution captured. The caller's snapshot bounds which links exist. This answers
    /// which of them the scope may see.
    pub(super) fn admits_delta_link(&self, id: ArchivedEntityId) -> bool {
        self.delta_links.admits(id)
    }

    /// Proves one node row visible: the sole [`VisibleRow`] constructor.
    ///
    /// Wire-domain ingress reaches this through [`Atlas::resolve`]; identity-domain ingress
    /// (translate, locate by entity id) lands on internal rows without a decode and calls this
    /// directly. Either way every failure is the same [`None`].
    pub(super) fn verify(&self, row: NodeRowId) -> Option<VisibleRow> {
        self.contains(row).then_some(VisibleRow(row))
    }

    /// Proves one edge deliverable, as the sole [`VisibleEdge`] constructor.
    ///
    /// An edge delivers only when the proof admits its link row and both of its endpoints. The link
    /// row carries the link entity's authorization, which the endpoints do not imply. The endpoints
    /// carry the two entities every edge response names. A hidden link row, a hidden endpoint, and
    /// an edge the generation never held all answer the same [`None`].
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
/// The only constructor is [`Atlas::resolve`], so an unproven row cannot reach an assembly
/// function that takes a [`VisibleRow`]. The value is the internal row id for in-process gathers,
/// and it never crosses the wire.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct VisibleRow(NodeRowId);

impl VisibleRow {
    /// Returns the proven row id.
    pub(super) const fn get(self) -> NodeRowId {
        self.0
    }
}

/// A link row that carries its delivery proof in the type.
///
/// The only constructor is [`VisibilityProof::verify_edge`], which is the delivery rule itself, so
/// an assembly value holding one cannot exist for an edge the proof withholds. Constructing the
/// value consumes the check rather than consulting it. The value is the internal row id for
/// in-process gathers, and it never crosses the wire.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct VisibleEdge(EdgeRowId);

impl VisibleEdge {
    /// Returns the proven row id.
    pub(super) const fn get(self) -> EdgeRowId {
        self.0
    }
}

/// One wire node ingress resolved into the domain that publishes it.
///
/// The decode answers from two domains under one universe. A row below the generation's
/// fitted bound is a fitted row and carries its visibility proof in the vessel. A row at or past
/// the bound is a cohort slot serving a placed arrival, answered by the identity it publishes,
/// and the caller resolves the arrival's delivery values against the view's own arrival table,
/// which holds exactly the admitted arrivals.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ResolvedRow {
    /// A fitted row, proven visible.
    Fitted(VisibleRow),
    /// A placed arrival's identity, admitted on its cohort slot.
    Arrival(ArchivedEntityId),
}

impl Atlas {
    /// Resolves a wire node row id into the domain that publishes it.
    ///
    /// The single join point of the response discipline. The decode runs under `cohort`'s
    /// accepted universe, so a wire id allocated for a cohort slot resolves exactly while an entry
    /// bound to that publication serves the request. A decoded row below the generation's fitted
    /// bound resolves against the proof as a fitted row, and a row at or past it resolves through
    /// the cohort's slot index as a placed arrival, admitted exactly when the proof's widened
    /// mask holds the slot.
    ///
    /// Decode failure (out-of-universe wire values), mask misses (rows the proof hides), and
    /// slots the cohort does not serve all answer the same [`None`]. Forbidden and nonexistent
    /// are indistinguishable to everything downstream. The transport renders one problem body
    /// for both, and nothing upstream of this point logs or branches on the cause.
    #[must_use]
    pub(crate) fn resolve(
        &self,
        proof: &VisibilityProof,
        cohort: PlacementCohort<'_>,
        wire: WireRow<NodeRowId>,
    ) -> Option<ResolvedRow> {
        let row = self
            .node_codec
            .decode(wire, cohort.universe(self.node_universe))?;
        if self.node_universe.contains(row) {
            proof.verify(row).map(ResolvedRow::Fitted)
        } else {
            let (identity, _) = cohort.node_at(row)?;

            proof
                .contains(row)
                .then_some(ResolvedRow::Arrival(identity))
        }
    }
}
