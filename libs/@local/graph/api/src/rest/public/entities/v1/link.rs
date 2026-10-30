//! The public form of what a link entity connects.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use type_system::knowledge::{
    self,
    entity::{EntityId, LinkEndpoint},
    property::metadata::PropertyProvenance,
};

use super::entity::LiveEntityId;

/// An entity a link connects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EntityRef {
    /// The ID of the entity.
    entity_id: LiveEntityId,
}

impl EntityRef {
    /// The entity that `entity_id` names in a stored link.
    ///
    /// The store keeps no draft ID for the entities a link connects.
    const fn stored(entity_id: EntityId) -> Self {
        Self {
            entity_id: LiveEntityId::new(entity_id.web_id, entity_id.entity_uuid),
        }
    }
}

impl From<EntityRef> for LinkEndpoint {
    fn from(entity: EntityRef) -> Self {
        Self {
            entity_id: EntityId::from(entity.entity_id),
            confidence: None,
            provenance: PropertyProvenance::default(),
        }
    }
}

/// The entities a link entity connects. More kinds may follow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Link {
    /// A link that points from `source` to `target`.
    #[schemars(title = "Directed")]
    Directed {
        /// The entity the link points from.
        source: EntityRef,
        /// The entity the link points to.
        target: EntityRef,
    },
}

impl From<knowledge::entity::Link> for Link {
    fn from(link: knowledge::entity::Link) -> Self {
        match link {
            knowledge::entity::Link::Directed { source, target } => Self::Directed {
                source: EntityRef::stored(source.entity_id),
                target: EntityRef::stored(target.entity_id),
            },
        }
    }
}

impl From<Link> for knowledge::entity::Link {
    fn from(link: Link) -> Self {
        match link {
            Link::Directed { source, target } => Self::Directed {
                source: LinkEndpoint::from(source),
                target: LinkEndpoint::from(target),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use type_system::{
        knowledge::{
            self,
            entity::{EntityId, id::EntityUuid},
        },
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{EntityRef, Link};
    use crate::rest::public::entities::v1::entity::LiveEntityId;

    fn live(id: u128) -> LiveEntityId {
        LiveEntityId::new(
            WebId::new(Uuid::from_u128(id)),
            EntityUuid::new(Uuid::from_u128(id + 1)),
        )
    }

    #[test]
    fn stored_directed() {
        let link = Link::Directed {
            source: EntityRef { entity_id: live(1) },
            target: EntityRef { entity_id: live(3) },
        };

        let stored = knowledge::entity::Link::from(link);

        let knowledge::entity::Link::Directed { source, target } = &stored;
        assert_eq!(
            (source.entity_id, target.entity_id),
            (EntityId::from(live(1)), EntityId::from(live(3))),
            "the stored link should keep the source and the target"
        );
        assert_eq!(
            Link::from(stored),
            link,
            "the stored link should read back as the same link"
        );
    }
}
