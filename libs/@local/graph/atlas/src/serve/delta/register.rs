//! The mutable fold the consumer writes: standings, verdicts, captures, and placements.
//!
//! [`DeltaRegister`] is the poll arm's single-writer state. A standing folds last-writer-wins
//! by version, while a classification or a placement holds first-delivery for the process's
//! lifetime, because neither can change meaning under the never-reassign row law. Every
//! mutation answers a [`Disposition`], and a hold that would grow a row domain past the
//! codec's range refuses as [`UniverseExhausted`]. The contracts behind these rules live in
//! the parent module's doc.

use core::{
    cmp::Ordering,
    fmt,
    ops::{BitOr, BitOrAssign},
};

use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::collections::{FastHashMap, FastHashMapEntry, fast_hash_map, fast_hash_set};
use type_system::knowledge::entity::id::EntityEditionId;

use super::{
    DeltaEdge, DeltaEvent, DeltaNode, DeltaRevision, IdentityTables, ProjectedArrival, Standing,
    overlay::IdentityTableOverlay, snapshot::DeltaSnapshot,
};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Icon, Label, OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    postgres::{
        Classification,
        id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    },
    serve::{Atlas, codec::Universe},
};

/// The newest applied event's version and standing, for one identity.
#[derive(Debug, Copy, Clone)]
struct AppliedEvent {
    /// The applied event's transaction time.
    version: Timestamp<TransactionTime>,
    /// The applied event's standing.
    standing: Standing,
}

impl AppliedEvent {
    /// Returns whether this event replaces `incumbent` under the fold.
    ///
    /// The comparison is the fold's total order: version, then standing rank, then edition between
    /// two live standings. An event never supersedes an equal one, which is what makes
    /// re-delivery idempotent.
    fn supersedes(&self, incumbent: &Self) -> bool {
        match self.version.cmp(&incumbent.version) {
            Ordering::Greater => true,
            Ordering::Less => false,
            Ordering::Equal => match (self.standing, incumbent.standing) {
                (Standing::Withdrawn, Standing::Live { .. }) => true,
                (Standing::Withdrawn | Standing::Live { .. }, Standing::Withdrawn) => false,
                (
                    Standing::Live { edition },
                    Standing::Live {
                        edition: incumbent_edition,
                    },
                ) => edition > incumbent_edition,
            },
        }
    }
}

/// One identity's captured legend, keyed to the edition the capture read.
///
/// The edition decides staleness. A register edition past the captured one lists the identity
/// for a fresh capture at the next poll, and the newest capture serves meanwhile, exactly as a
/// placement's coordinate serves until refit.
#[derive(Debug, Clone)]
struct EditionLegend {
    /// The edition the capture read.
    edition: EntityEditionId,
    /// The legend the read answered.
    legend: OwnedLegend,
}

/// A refusal to allocate a row past the domain its holder can carry.
///
/// For node and edge rows the bound is the wire codec's `u32` row domain, enforced at the
/// register's allocation sites. For every row domain the id type's own end bounds allocation
/// last. The refusal fails closed. The allocation records nothing and the arrival stays staged
/// or unclassified. Every later first allocation refuses the same way until a refit retires
/// the register.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct UniverseExhausted;

impl fmt::Display for UniverseExhausted {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the accepted universe is at its row domain's bound")
    }
}

impl core::error::Error for UniverseExhausted {}

/// The register's disposition of one delivered classification verdict or placement.
///
/// Publication's resolution input changes on [`Disposition::Resolving`] alone, and
/// [`Disposition::changes_resolution`] reads exactly that. Dispositions join through `|` into
/// the strongest one delivered, with [`Disposition::AlreadyHeld`] as the neutral element.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Disposition {
    /// Newly held for a live arrival, so publication's resolution input changed.
    Resolving,
    /// Newly held for an identity not standing live, so resolution stays unchanged until the
    /// feed reports the identity live.
    Dormant,
    /// A holding for the identity already stood, so the delivery recorded nothing.
    AlreadyHeld,
}

impl Disposition {
    /// Returns whether this disposition changed publication's resolution input.
    #[must_use]
    pub(crate) const fn changes_resolution(self) -> bool {
        matches!(self, Self::Resolving)
    }
}

impl BitOr for Disposition {
    type Output = Self;

    /// Joins two dispositions into the stronger one, by resolution strength.
    ///
    /// [`Disposition::Resolving`] absorbs, [`Disposition::AlreadyHeld`] is the neutral element,
    /// and [`Disposition::Dormant`] sits between, so a fold over a batch answers whether any
    /// delivery resolved while still recording that a new holding exists. The joined value's
    /// consumed meaning is [`Disposition::changes_resolution`] alone; the Dormant-over-held
    /// preference keeps the new-holding fact in the value, which no consumer reads yet.
    fn bitor(self, rhs: Self) -> Self {
        match (self, rhs) {
            (Self::Resolving, _) | (_, Self::Resolving) => Self::Resolving,
            (Self::Dormant, _) | (_, Self::Dormant) => Self::Dormant,
            (Self::AlreadyHeld, Self::AlreadyHeld) => Self::AlreadyHeld,
        }
    }
}

impl BitOrAssign for Disposition {
    fn bitor_assign(&mut self, rhs: Self) {
        *self = *self | rhs;
    }
}

/// The mutable fold of the feed since the generation's fit-time snapshot.
///
/// One [`AppliedEvent`] per identity, last-writer-wins on the event's transaction time. The map
/// grows with the distinct identities the feed has reported, and a refit retires it along with
/// the generation whose delta it states.
#[derive(Debug)]
pub(crate) struct DeltaRegister {
    /// The newest applied event per identity.
    applied: FastHashMap<ArchivedEntityId, AppliedEvent>,
    /// The held classification verdict per identity, insert-only.
    classifications: FastHashMap<ArchivedEntityId, Classification>,
    /// The published node payload per placed identity, insert-only.
    placements: FastHashMap<ArchivedEntityId, DeltaNode>,
    /// The captured legend per identity, replaced when a newer edition's capture lands.
    legends: FastHashMap<ArchivedEntityId, EditionLegend>,
    /// Every allocated node row beside the accepted universe the allocations grew.
    node_rows: IdentityTableOverlay<ArchivedEntityId, NodeRowId>,
    /// The edge rows allocated for complete-pair links at their classification hold.
    edge_rows: IdentityTableOverlay<ArchivedEntityId, EdgeRowId>,
    /// The ontology rows allocated for types the generation never tabulated.
    ontology_rows: IdentityTableOverlay<ArchivedOntologyTypeUuid, OntologyRowId>,
    /// The icons recorded at the allocated ontology rows, written once at allocation.
    ontology_icons: FastHashMap<OntologyRowId, OwnedIcon>,
}

impl DeltaRegister {
    /// Builds an empty register over a generation whose row universes are `nodes`, `edges` and
    /// `ontology`.
    ///
    /// Row allocation starts at each bound, so the first placement takes the first node row past
    /// the generation's fitted rows, the first complete link verdict the first edge row past the
    /// generation's fitted edges, and the first unknown type the first ontology row past the
    /// generation's tabulated types.
    pub(crate) fn new(
        nodes: Universe<NodeRowId>,
        edges: Universe<EdgeRowId>,
        ontology: Universe<OntologyRowId>,
    ) -> Self {
        Self {
            applied: fast_hash_map(),
            classifications: fast_hash_map(),
            placements: fast_hash_map(),
            legends: fast_hash_map(),
            node_rows: IdentityTableOverlay::new(nodes),
            edge_rows: IdentityTableOverlay::new(edges),
            ontology_rows: IdentityTableOverlay::new(ontology),
            ontology_icons: fast_hash_map(),
        }
    }

    /// Creates a new delta register from the atlas's node, edge, and ontology universes.
    pub(crate) fn from_atlas(atlas: &Atlas) -> Self {
        Self::new(
            atlas.node_universe(),
            atlas.edge_universe(),
            atlas.ontology_universe(),
        )
    }

    /// Resolves a representative type into its ontology row, allocating past the baked bound
    /// for a type the generation never tabulated.
    ///
    /// The generation's table answers first and the extension second, so a reader learns
    /// nothing about which side answered. A type neither holds allocates the next row, and the
    /// allocation records `icon` at exactly that moment. Tabulated types resolve their icons
    /// through the baked closure artifact, which leaves the extension recording icons for its
    /// own rows alone. A later capture for the same type replaces nothing: the refit repairs
    /// icon staleness exactly as it repairs coordinates.
    ///
    /// [`None`] is the ontology row domain's own end.
    fn resolve_representative(
        &mut self,
        representative: ArchivedOntologyTypeUuid,
        icon: &Icon,
        tables: &impl IdentityTables,
    ) -> Option<OntologyRowId> {
        if let Some(row) = tables.ontology_row_of(representative) {
            return Some(row);
        }
        if let Some(row) = self.ontology_rows.row_of(representative) {
            return Some(row);
        }

        let row = self.ontology_rows.resolve(representative)?;
        self.ontology_icons.insert(row, icon.to_owned());
        Some(row)
    }

    /// Applies one event, returning whether publication's resolution input changed.
    ///
    /// The fold is last-writer-wins per identity. An event that supersedes the held register under
    /// the total order replaces it. Every other event changes nothing, because the register already
    /// reflects a later state of the same entity, and re-delivery of an already-applied event is
    /// idempotent.
    ///
    /// The return value is the publication decision's input: `true` when an identity arrives, a
    /// standing flips, or a live standing's edition moves, and `false` when only the version moved.
    /// The signal over-approximates, because a new live identity the generation fitted resolves to
    /// nothing, so a poll acting on it publishes a snapshot equivalent to the held one. A poll
    /// whose applications all return `false` can skip publishing.
    pub(crate) fn apply(
        &mut self,
        DeltaEvent {
            entity,
            version,
            standing,
        }: DeltaEvent,
    ) -> bool {
        let challenger = AppliedEvent { version, standing };

        match self.applied.entry(entity) {
            FastHashMapEntry::Vacant(slot) => {
                slot.insert(challenger);
                true
            }
            FastHashMapEntry::Occupied(mut slot) => {
                let incumbent = *slot.get();
                if !challenger.supersedes(&incumbent) {
                    return false;
                }

                slot.insert(challenger);
                incumbent.standing != standing
            }
        }
    }

    /// Iterates the live arrivals holding no classification verdict.
    ///
    /// An arrival is a live identity the generation never fitted. A withdrawn identity never
    /// lists, because it serves nothing whatever its category, and the feed's own withdrawal is
    /// what resolves an arrival whose present ended between its event and a lookup. A fitted
    /// identity never lists, because the generation's tables already decide its category.
    pub(crate) fn unclassified(
        &self,
        tables: &impl IdentityTables,
    ) -> impl Iterator<Item = ArchivedEntityId> {
        self.applied
            .iter()
            .filter(|&(entity, applied)| {
                matches!(applied.standing, Standing::Live { .. })
                    && !self.classifications.contains_key(entity)
                    && tables.node_row_of(*entity).is_none()
                    && tables.edge_row_of(*entity).is_none()
            })
            .map(|(&entity, _)| entity)
    }

    /// Holds one classification verdict, returning the register's disposition of it.
    ///
    /// The first verdict per identity holds for the process's lifetime, and a later verdict for
    /// the same identity changes nothing, so re-delivery of a verdict is idempotent and comes
    /// back [`Disposition::AlreadyHeld`]. A complete link verdict allocates the link's edge row
    /// at the hold. That row is the next past the accepted edge universe and stands for the
    /// process's lifetime, so a published link speaks the row domain fitted edges speak. A newly
    /// held verdict is [`Disposition::Resolving`] exactly when the identity stands live,
    /// because only a live arrival resolves through its classification at publication, and
    /// [`Disposition::Dormant`] otherwise.
    ///
    /// # Errors
    ///
    /// Returns [`UniverseExhausted`] when one more edge row would grow the accepted edge
    /// universe past the wire codec's `u32` row domain, or when the edge row domain has no next
    /// row to allocate. The hold records nothing and the identity stays unclassified, so the
    /// next poll retries it and meets the same refusal until a refit retires the register.
    pub(crate) fn classify(
        &mut self,
        entity: ArchivedEntityId,
        verdict: Classification,
    ) -> Result<Disposition, UniverseExhausted> {
        if self.classifications.contains_key(&entity) {
            return Ok(Disposition::AlreadyHeld);
        }

        if let Classification::Edge {
            source: Some(_),
            target: Some(_),
        } = verdict
        {
            self.edge_rows.resolve(entity).ok_or(UniverseExhausted)?;
        }

        self.classifications.insert(entity, verdict);
        Ok(
            if matches!(
                self.applied.get(&entity),
                Some(AppliedEvent {
                    standing: Standing::Live { .. },
                    ..
                })
            ) {
                Disposition::Resolving
            } else {
                Disposition::Dormant
            },
        )
    }

    /// Lists the identities whose current edition no captured legend matches, each with the
    /// edition to read.
    ///
    /// An identity lists when its legend capture is stale or absent and serving consults it or
    /// will. Fitted identities list, since a post-fit edition revises the baked legend, and so
    /// does a link-classified arrival with a complete attachment pair, since publication
    /// withholds an uncaptured link. A fitted node's capture has no serving reader yet - the
    /// edges trailer asks only for links - and exists for the tile and locate label overlay that
    /// will read request-time legends through the register, so narrowing the listing to links
    /// would leave that overlay nothing to read. Node-classified arrivals never list, because
    /// staging reads their displays before placement, and neither does a withdrawn identity,
    /// which serves nothing.
    pub(crate) fn pending_captures(
        &self,
        tables: &impl IdentityTables,
    ) -> impl Iterator<Item = (ArchivedEntityId, EntityEditionId)> {
        self.applied.iter().filter_map(move |(&entity, applied)| {
            let Standing::Live { edition } = applied.standing else {
                return None;
            };
            if let Some(captured) = self.legends.get(&entity)
                && captured.edition == edition
            {
                return None;
            }

            let fitted =
                tables.node_row_of(entity).is_some() || tables.edge_row_of(entity).is_some();
            let serving_link = matches!(
                self.classifications.get(&entity),
                Some(Classification::Edge {
                    source: Some(_),
                    target: Some(_),
                })
            );

            (fitted || serving_link).then_some((entity, edition))
        })
    }

    /// Holds one captured legend, keyed to the edition its read answered.
    ///
    /// The newest capture replaces the held one, because a capture for an edition the register
    /// has moved past lists the identity again at the next poll, and the held legend serves
    /// meanwhile. The representative type resolves into its ontology row here. The generation's
    /// table answers a tabulated type, and for one the generation never saw the register's own
    /// extension answers or allocates, recording `icon` beside a freshly allocated row.
    ///
    /// # Errors
    ///
    /// Returns [`UniverseExhausted`] when the ontology row domain has no next row to allocate.
    /// The capture records nothing and the identity lists again at the next poll.
    pub(crate) fn capture_display(
        &mut self,
        entity: ArchivedEntityId,
        edition: EntityEditionId,
        label: &Label,
        icon: &Icon,
        representative: ArchivedOntologyTypeUuid,
        tables: &impl IdentityTables,
    ) -> Result<(), UniverseExhausted> {
        let representative = self
            .resolve_representative(representative, icon, tables)
            .ok_or(UniverseExhausted)?;

        self.legends.insert(
            entity,
            EditionLegend {
                edition,
                legend: OwnedLegend::new(representative, label),
            },
        );
        Ok(())
    }

    /// Holds one placement, returning the register's disposition of it.
    ///
    /// The first placement per identity takes the next row past the accepted universe and holds
    /// for the process's lifetime. A later placement for the same identity changes nothing,
    /// because the coordinate and the row never move, so re-delivery of a placement is
    /// idempotent and comes back [`Disposition::AlreadyHeld`]. A placement for an identity
    /// standing withdrawn records all the same, so an unarchive republishes the recorded
    /// coordinate on its former row. A newly held placement is [`Disposition::Resolving`]
    /// exactly when the identity stands live, because only a live arrival resolves through its
    /// placement at publication, and [`Disposition::Dormant`] otherwise.
    ///
    /// The arrival's representative type resolves into its ontology row here, exactly as
    /// [`Self::capture_display`] resolves one, so the published node's legend speaks the row
    /// domain every fitted legend speaks.
    ///
    /// # Errors
    ///
    /// Returns [`UniverseExhausted`] when one more node row would grow the accepted universe past
    /// the wire codec's `u32` row domain, or when the ontology row domain has no next row to
    /// allocate. The placement records nothing and the arrival stays staged.
    pub(crate) fn place(
        &mut self,
        entity: ArchivedEntityId,
        &ProjectedArrival {
            edition,
            position,
            ref label,
            ref icon,
            representative: representative_type_uuid,
        }: &ProjectedArrival,
        tables: &impl IdentityTables,
    ) -> Result<Disposition, UniverseExhausted> {
        if self.placements.contains_key(&entity) {
            return Ok(Disposition::AlreadyHeld);
        }

        // The codec permutes node rows over u32, so a row past that domain could never encode.
        // The refusal sits before any allocation, which keeps a refused placement free of side
        // effects in the node domain.
        if self.node_rows.universe().size() > u32::MAX as usize {
            return Err(UniverseExhausted);
        }

        let representative = self
            .resolve_representative(representative_type_uuid, icon, tables)
            .ok_or(UniverseExhausted)?;
        let id = self.node_rows.resolve(entity).ok_or(UniverseExhausted)?;

        self.placements.insert(
            entity,
            DeltaNode {
                id,
                edition,
                position,
                legend: OwnedLegend::new(representative, label),
            },
        );

        Ok(
            if matches!(
                self.applied.get(&entity),
                Some(AppliedEvent {
                    standing: Standing::Live { .. },
                    ..
                })
            ) {
                Disposition::Resolving
            } else {
                Disposition::Dormant
            },
        )
    }

    /// Estimates the fold's resident bytes.
    ///
    /// A weighted estimate for replay telemetry rather than an allocator-faithful ceiling: the
    /// event, classification, placement, and legend maps' heap allocations, the captured legends'
    /// bytes on both holders, and the row-domain extensions.
    #[must_use]
    pub(crate) fn resident_estimate(&self) -> usize {
        let placement_legends: usize = self
            .placements
            .values()
            .map(|node| node.legend.heap_bytes())
            .sum::<u64>()
            .saturating_cast();
        let captured_legends: usize = self
            .legends
            .values()
            .map(|captured| captured.legend.heap_bytes())
            .sum::<u64>()
            .saturating_cast();
        let allocated_icons: usize = self
            .ontology_icons
            .values()
            .map(|icon| icon.as_ref().len() as u64)
            .sum::<u64>()
            .saturating_cast();

        self.applied.allocation_size()
            + self.classifications.allocation_size()
            + self.placements.allocation_size()
            + self.legends.allocation_size()
            + self.node_rows.resident_estimate()
            + self.edge_rows.resident_estimate()
            + self.ontology_rows.resident_estimate()
            + self.ontology_icons.allocation_size()
            + placement_legends
            + captured_legends
            + allocated_icons
    }

    /// Publishes the fold as an immutable snapshot resolved against `tables`.
    ///
    /// `revision` and `watermark` are the publisher's: the revision names this publication in
    /// publication order, and the watermark is the feed position the publisher had folded through
    /// when it published.
    ///
    /// # Panics
    ///
    /// This panics when `tables` resolves an identity to a row above the row bitsets' representable
    /// domain, which is an implementor bug rather than feed data.
    #[must_use]
    pub(crate) fn snapshot(
        &self,
        tables: &impl IdentityTables,
        revision: DeltaRevision,
        watermark: Timestamp<TransactionTime>,
    ) -> DeltaSnapshot {
        let mut withdrawn = fast_hash_set();
        let mut withdrawn_nodes = CompressedBitSet::new();
        let mut withdrawn_edges = CompressedBitSet::new();
        let mut staged = fast_hash_map();
        let mut nodes = fast_hash_map();
        let mut edges = fast_hash_map();
        let mut legends = fast_hash_map();

        for (&entity, applied) in &self.applied {
            match applied.standing {
                Standing::Withdrawn => {
                    withdrawn.insert(entity);

                    if let Some(row) = tables.node_row_of(entity) {
                        withdrawn_nodes.insert(row);
                    } else if let Some(row) = tables.edge_row_of(entity) {
                        withdrawn_edges.insert(row);
                    } else {
                        // An unfitted withdrawal has no generation row to subtract, and the
                        // identity set above already carries it.
                    }
                }
                Standing::Live { edition } => {
                    if tables.node_row_of(entity).is_some() || tables.edge_row_of(entity).is_some()
                    {
                        // A fitted identity with a post-fit edition revises its baked legend:
                        // the captured legend publishes, and holders read it map-first. A
                        // revision the read has not yet answered keeps answering from what
                        // the holder already reads - the previous capture, or the fit-time
                        // payload when the register never captured one - until its capture
                        // read lands.
                        if let Some(captured) = self.legends.get(&entity) {
                            legends.insert(entity, captured.legend.clone());
                        }
                    } else {
                        match self.classifications.get(&entity) {
                            Some(Classification::Node) => {
                                if let Some(node) = self.placements.get(&entity) {
                                    nodes.insert(entity, node.clone().with_edition(edition));
                                } else {
                                    staged.insert(entity, edition);
                                }
                            }
                            Some(&Classification::Edge {
                                source: Some(source),
                                target: Some(target),
                            }) => {
                                let resolve = |endpoint: ArchivedEntityId| {
                                    tables
                                        .node_row_of(endpoint)
                                        .or_else(|| self.node_rows.row_of(endpoint))
                                };

                                if let Some(captured) = self.legends.get(&entity)
                                    && let Some(source) = resolve(source)
                                    && let Some(target) = resolve(target)
                                {
                                    let id = self.edge_rows.row_of(entity).expect(
                                        "classification allocated the edge row at the hold",
                                    );

                                    edges.insert(
                                        entity,
                                        DeltaEdge {
                                            id,
                                            edition,
                                            source,
                                            target,
                                        },
                                    );
                                    legends.insert(entity, captured.legend.clone());
                                }
                            }
                            Some(Classification::Edge { .. }) | None => {
                                // An unclassified arrival and a link with an incomplete
                                // attachment pair publish nowhere: nothing serves until a
                                // verdict supplies the data to serve it.
                            }
                        }
                    }
                }
            }
        }

        // Locate's link-label pass consumes this containment as an `unreachable!` arm: the
        // edge insert and the legend insert above share one `if let` block, so a published
        // edge always carries a legend. The check lives here, where the walk establishes the
        // invariant, rather than at the consumer.
        debug_assert!(
            edges.keys().all(|entity| legends.contains_key(entity)),
            "every published edge carries its captured legend",
        );

        DeltaSnapshot {
            revision,
            watermark,
            withdrawn,
            withdrawn_nodes,
            withdrawn_edges,
            staged,
            nodes,
            edges,
            legends,
            node_rows: self.node_rows.clone(),
            edge_rows: self.edge_rows.clone(),
            ontology_rows: self.ontology_rows.clone(),
            ontology_icons: self.ontology_icons.clone(),
        }
    }
}
