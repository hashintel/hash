//! Fixed node placements with revision-dependent visibility.
//!
//! Retaining the first placement keeps a node's coordinates stable until refitting. [`LayoutDelta`]
//! records visibility separately, allowing withdrawal and revival without reprojection.

use hashql_core::{collections::FastHashMap, id::IdVec};

use super::{
    DeltaRevision,
    history::{EntryKind, History, Versioned},
    id::DeltaRowId,
};
use crate::{identity::NodeRowId, math::Vec2};

#[cfg(test)]
mod tests;

pub(crate) mod provider;

use self::provider::{DeltaLayoutProvider, VersionedLayoutProvider};

/// Added placements and inherited-node visibility decisions.
///
/// Added nodes remain absent before their first placement's birth revision. Evicted decisions fall
/// back to the base provider for inherited nodes and to live for placed additions.
#[derive(Debug, Default)]
pub(crate) struct LayoutDelta {
    positions: IdVec<DeltaRowId<NodeRowId>, Option<Versioned<Vec2>>>,
    history: FastHashMap<NodeRowId, History>,
}

impl LayoutDelta {
    /// Returns an added node's retained position or the base provider's position.
    pub(super) fn recorded_position(
        &self,
        base: &(impl VersionedLayoutProvider + ?Sized),
        node: NodeRowId,
    ) -> Option<Vec2> {
        if let Some(delta) = DeltaRowId::derive(base.provide_node_domain(), node) {
            return self
                .positions
                .get(delta)?
                .as_ref()
                .map(|entry| *entry.data());
        }
        base.provide_position(node)
    }

    fn get(
        &self,
        base: &(impl VersionedLayoutProvider + ?Sized),
        node: NodeRowId,
        revision: Option<DeltaRevision>,
    ) -> Option<Vec2> {
        if let Some(delta) = DeltaRowId::derive(base.provide_node_domain(), node) {
            let entry = self.positions.get(delta)?.as_ref()?;
            return entry.is_live(revision).then(|| *entry.data());
        }

        let decision = self.history.get(&node).and_then(|history| {
            revision.map_or_else(|| Some(history.now()), |revision| history.at(revision))
        });

        match decision {
            Some(EntryKind::Withdrawn) => None,
            Some(EntryKind::Live) | None => revision.map_or_else(
                || base.provide_position(node),
                |revision| base.provide_position_at(node, revision),
            ),
        }
    }

    /// Includes an allocated row in the domain before its placement is available.
    pub(crate) fn reserve_node(
        &mut self,
        base: &(impl VersionedLayoutProvider + ?Sized),
        node: NodeRowId,
    ) {
        if let Some(delta) = DeltaRowId::derive(base.provide_node_domain(), node) {
            self.positions.fill_until(delta, || None);
        }
    }

    /// Activates a node, retaining its first successful placement.
    ///
    /// Inherited nodes keep the base provider's position. Returns whether a local visibility
    /// decision changes or a placement is first recorded.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes the node's latest recorded decision.
    pub(crate) fn insert(
        &mut self,
        base: &(impl VersionedLayoutProvider + ?Sized),
        node: NodeRowId,
        position: Vec2,
        revision: DeltaRevision,
    ) -> bool {
        let Some(delta) = DeltaRowId::derive(base.provide_node_domain(), node) else {
            return self
                .history
                .get_mut(&node)
                .is_some_and(|history| history.push(EntryKind::Live, revision));
        };

        if let Some(entry) = self.positions.lookup_mut(delta) {
            return entry.push(EntryKind::Live, revision);
        }

        self.positions
            .insert(delta, Versioned::new(position, revision));
        true
    }

    /// Hides a placed node without discarding its coordinates.
    ///
    /// An unplaced addition remains unchanged. Returns whether the local visibility decision
    /// changes.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes the node's latest recorded decision.
    pub(crate) fn withdraw(
        &mut self,
        base: &(impl VersionedLayoutProvider + ?Sized),
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> bool {
        if let Some(delta) = DeltaRowId::derive(base.provide_node_domain(), node) {
            let Some(entry) = self.positions.lookup_mut(delta) else {
                return false;
            };

            return entry.push(EntryKind::Withdrawn, revision);
        }

        let mut changed = false;
        let history = self.history.entry(node).or_insert_with(|| {
            changed = true;
            History::new(EntryKind::Withdrawn, revision)
        });

        history.push(EntryKind::Withdrawn, revision) | changed
    }

    pub(crate) const fn bind<'delta, B>(&'delta self, base: B) -> DeltaLayoutProvider<'delta, B> {
        DeltaLayoutProvider::from_parts(self, base)
    }
}

impl Clone for LayoutDelta {
    fn clone(&self) -> Self {
        Self {
            positions: self.positions.clone(),
            history: self.history.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        let Self { positions, history } = self;
        positions.clone_from(&source.positions);
        history.clone_from(&source.history);
    }
}
