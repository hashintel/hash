//! Mutable changes and immutable publications over one fitted generation.
//!
//! A delta lifetime starts at [`Delta::new`]. Clones, working revisions and published revisions
//! preserve its [`DeltaId`]. Opening another delta over the same world starts a distinct logical
//! lifetime with a newly sampled tag.

#![expect(
    clippy::empty_enums,
    reason = "zerocopy derives generate uninhabited field-marker types"
)]

pub(crate) mod epoch;
mod history;
mod id;
mod importance;
pub(crate) mod layout;
pub(crate) mod overlay;
pub(crate) mod topology;

use alloc::sync::Arc;

use hashql_core::id::Id as _;
use rand::TryCryptoRng;
use zerocopy::{NativeEndian, U64};

use self::{
    layout::{LayoutDelta, provider::NaiveLayoutProvider},
    overlay::{
        DeltaIdentityProvider, IdentityProviderResidual, NaiveIdentityProvider,
        VersionedIdentityProvider as _,
    },
    topology::{TopologyDelta, provider::NaiveTopologyProvider},
};
use super::{codec::RowCodec, world::World};
use crate::{
    dataset::auxiliary::{OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
};

hashql_core::id::newtype! {
    /// A sequence value for one delta's published states.
    ///
    /// Incrementing by one uses `usize` arithmetic. On a 32-bit target, the conversion discards the upper 32 bits before addition.
    ///
    /// # Panics
    ///
    /// With overflow checking, a unit increment panics when the converted value equals `usize::MAX`.
    ///
    /// # Warning
    ///
    /// Without overflow checking, a unit increment at `usize::MAX` wraps to zero. Reused revisions no longer distinguish publications. Recording a visibility decision before its history's latest transition panics.
    #[id(unaligned)]
    pub(crate) struct DeltaRevision(u64)
}

/// A random tag used to distinguish one delta lifetime.
///
/// A lifetime begins with [`Delta::new`] and includes its clones and published revisions. Cloning
/// and revision changes preserve the tag. Each initialization samples its own 64-bit value,
/// including when reusing the same [`World`]. Collisions are possible and are not detected.
/// Equality is a probabilistic lifetime identity rather than a global uniqueness guarantee.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::FromBytes,
)]
#[repr(transparent)]
pub(crate) struct DeltaId(U64<NativeEndian>);

impl DeltaId {
    /// Samples a lifetime tag from `rng`.
    ///
    /// # Errors
    ///
    /// Returns `rng`'s error if it fails to produce randomness.
    fn new<R>(mut rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let bytes = rng.try_next_u64()?;
        Ok(Self(U64::new(bytes)))
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::FromBytes,
)]
/// A delta lifetime tag and revision naming one published state.
///
/// Revisions distinguish publications within a lifetime only before [`DeltaRevision`]'s narrowing
/// or wrap reuses a value. The lifetime component retains [`DeltaId`]'s probabilistic collision
/// semantics.
#[repr(C)]
pub(crate) struct DeltaReference {
    /// The sampled tag shared by the lifetime's clones and revisions.
    pub id: DeltaId,
    /// The publication's revision within that lifetime.
    pub revision: DeltaRevision,
}

/// Mutable additions, withdrawals and relabellings past one generation's fitted base.
///
/// The feed accumulates changes in a working value. Publication moves or clones that value behind
/// a [`DeltaReader`], after which retained epochs keep the published copy immutable. Cloning a
/// [`Delta`] preserves both its lifetime tag and current revision. Only [`Delta::new`] begins
/// another logical lifetime.
pub(crate) struct Delta {
    world: Arc<World>,

    id: DeltaId,
    revision: DeltaRevision,

    ontology: IdentityProviderResidual<ArchivedOntologyTypeUuid, OntologyRowId, OwnedIcon>,

    node: IdentityProviderResidual<ArchivedEntityId, NodeRowId, OwnedLegend>,
    edge: IdentityProviderResidual<ArchivedEntityId, EdgeRowId, OwnedLegend>,

    topology: TopologyDelta,
    layout: LayoutDelta,
}

impl Delta {
    /// Starts an empty delta over `world` at [`DeltaRevision::MIN`].
    ///
    /// The new logical lifetime samples a [`DeltaId`] from `rng` without checking whether the
    /// value differs from an earlier lifetime.
    ///
    /// # Errors
    ///
    /// Returns `rng`'s error if it fails to produce randomness for the delta's identity.
    pub(crate) fn new<R>(world: Arc<World>, rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let id = DeltaId::new(rng)?;
        let revision = DeltaRevision::MIN;

        Ok(Self {
            id,
            revision,
            ontology: IdentityProviderResidual::new(NaiveIdentityProvider::from_ref(
                &world.ontology.identity,
            )),
            node: IdentityProviderResidual::new(NaiveIdentityProvider::from_ref(
                &world.layout.index.identity,
            )),
            edge: IdentityProviderResidual::new(NaiveIdentityProvider::from_ref(
                &world.topology.identity,
            )),
            topology: TopologyDelta::default(),
            layout: LayoutDelta::default(),
            world,
        })
    }

    /// Resolves an allocated node row, including a withdrawn node.
    fn node_row(&self, entity: ArchivedEntityId) -> Option<NodeRowId> {
        DeltaIdentityProvider::from_parts(
            &self.node,
            NaiveIdentityProvider::from_ref(&self.world.layout.index.identity),
        )
        .provide_allocated_row_of(entity)
    }

    /// Returns a node's retained wire coordinates, including after withdrawal.
    fn node_position(&self, entity: ArchivedEntityId) -> Option<Vec2> {
        self.layout.recorded_position(
            &NaiveLayoutProvider::new(&self.world.layout),
            self.node_row(entity)?,
        )
    }

    /// Hides an entity's identity and geometry without releasing its row.
    ///
    /// # Panics
    ///
    /// Panics if recording a withdrawal would precede the affected identity, placement or edge
    /// history's latest transition.
    fn withdraw(&mut self, entity: ArchivedEntityId) -> bool {
        let node = self.node_row(entity);
        let edge = DeltaIdentityProvider::from_parts(
            &self.edge,
            NaiveIdentityProvider::from_ref(&self.world.topology.identity),
        )
        .provide_allocated_row_of(entity);

        let mut changed = self.node.withdraw(
            NaiveIdentityProvider::from_ref(&self.world.layout.index.identity),
            self.revision,
            entity,
        );
        changed |= self.edge.withdraw(
            NaiveIdentityProvider::from_ref(&self.world.topology.identity),
            self.revision,
            entity,
        );

        if let Some(node) = node {
            changed |= self.layout.withdraw(
                &NaiveLayoutProvider::new(&self.world.layout),
                node,
                self.revision,
            );
        }

        if let Some(edge) = edge {
            changed |= self.topology.withdraw(
                NaiveTopologyProvider::from_ref(&self.world.topology),
                edge,
                self.revision,
            );
        }
        changed
    }

    /// Activates a node and replaces its legend, retaining its first placement.
    ///
    /// `position` uses the [wire frame](crate::salt::lod::stage::WIRE_FRAME). Returns whether state
    /// changed, or `None` when no node row remains available: the id space has no row left, or the
    /// next row lies at [`WIRE_ROW_BOUND`](super::codec::WIRE_ROW_BOUND) and has no wire id. An
    /// entity that already holds a row, live or withdrawn, updates and revives on that row at every
    /// capacity.
    ///
    /// # Panics
    ///
    /// Panics if the current revision precedes the node's latest recorded identity or placement
    /// visibility transition.
    fn update_node(
        &mut self,
        entity: ArchivedEntityId,
        legend: OwnedLegend,
        position: Vec2,
    ) -> Option<bool> {
        let base = NaiveIdentityProvider::from_ref(&self.world.layout.index.identity);

        // Allocation places a new row at the domain's bound, which must have a wire id. An
        // allocated row already has one, and its entity passes whatever the bound.
        let identities = DeltaIdentityProvider::from_parts(&self.node, base);
        if identities.provide_allocated_row_of(entity).is_none()
            && !RowCodec::<NodeRowId>::encodes(identities.provide_domain().bound())
        {
            return None;
        }

        let (node, mut changed) = self.node.insert(base, self.revision, entity, legend)?;
        self.topology
            .reserve_node(NaiveTopologyProvider::from_ref(&self.world.topology), node);

        changed |= self.layout.insert(
            &NaiveLayoutProvider::new(&self.world.layout),
            node,
            position,
            self.revision,
        );
        Some(changed)
    }

    /// Records an edge legend and activates a resolved endpoint pair.
    ///
    /// An edge retains its first bound pair.
    ///
    /// An unresolved pair reserves the edge row without binding it. Returns whether state changed,
    /// or `None` when no edge row remains available.
    ///
    /// # Panics
    ///
    /// Panics if the current revision precedes the edge's latest recorded identity or topology
    /// visibility transition.
    fn update_edge(
        &mut self,
        entity: ArchivedEntityId,
        legend: OwnedLegend,
        endpoints: Option<[NodeRowId; 2]>,
    ) -> Option<bool> {
        let (edge, mut changed) = self.edge.insert(
            NaiveIdentityProvider::from_ref(&self.world.topology.identity),
            self.revision,
            entity,
            legend,
        )?;

        let base = NaiveTopologyProvider::from_ref(&self.world.topology);

        self.topology.reserve_edge(base, edge);
        if let Some(endpoints) = endpoints {
            changed |= self.topology.insert(base, edge, endpoints, self.revision);
        }

        Some(changed)
    }

    /// Resolves an ontology row and replaces its icon.
    ///
    /// Returns the row and whether state changed, or `None` when no ontology row remains available.
    ///
    /// # Panics
    ///
    /// Panics if the current revision precedes the ontology row's latest recorded visibility
    /// transition.
    fn register_ontology(
        &mut self,
        ontology: ArchivedOntologyTypeUuid,
        icon: OwnedIcon,
    ) -> Option<(OntologyRowId, bool)> {
        self.ontology.insert(
            NaiveIdentityProvider::from_ref(&self.world.ontology.identity),
            self.revision,
            ontology,
            icon,
        )
    }
}

impl Clone for Delta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            world: Arc::clone(&self.world),
            id: self.id,
            revision: self.revision,
            ontology: self.ontology.clone(),
            node: self.node.clone(),
            edge: self.edge.clone(),
            topology: self.topology.clone(),
            layout: self.layout.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            world,
            id,
            revision,
            ontology,
            node,
            edge,
            topology,
            layout,
        } = self;

        world.clone_from(&source.world);
        id.clone_from(&source.id);
        revision.clone_from(&source.revision);
        ontology.clone_from(&source.ontology);
        node.clone_from(&source.node);
        edge.clone_from(&source.edge);
        topology.clone_from(&source.topology);
        layout.clone_from(&source.layout);
    }
}
