use std::{collections::HashMap, fmt};

use serde::{Deserialize, Serialize};
use utoipa::Component;

use super::EntityId;
use crate::ontology::types::uri::VersionedUri;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct Link {
    source_entity: EntityId,
    target_entity: EntityId,
    link_type_uri: VersionedUri,
}

impl Link {
    #[must_use]
    pub const fn new(
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_uri: VersionedUri,
    ) -> Self {
        Self {
            source_entity,
            target_entity,
            link_type_uri,
        }
    }

    #[must_use]
    pub const fn source_entity(&self) -> EntityId {
        self.source_entity
    }

    #[must_use]
    pub const fn target_entity(&self) -> EntityId {
        self.target_entity
    }

    #[must_use]
    pub const fn link_type_uri(&self) -> &VersionedUri {
        &self.link_type_uri
    }
}

impl fmt::Display for Link {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:?}", &self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OutgoingLink {
    Single(EntityId),
    Multiple(Vec<EntityId>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Links {
    #[serde(flatten)]
    links: HashMap<VersionedUri, OutgoingLink>,
}

impl Links {
    #[must_use]
    pub const fn new(links: HashMap<VersionedUri, OutgoingLink>) -> Self {
        Self { links }
    }

    #[must_use]
    pub const fn inner(&self) -> &HashMap<VersionedUri, OutgoingLink> {
        &self.links
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_link(json: &str) {
        let json_value: serde_json::Value = serde_json::from_str(json).expect("invalid JSON");

        let link: Links = serde_json::from_value(json_value.clone()).expect("invalid link");

        assert_eq!(
            serde_json::to_value(link.clone()).expect("could not serialize"),
            json_value,
            "{link:#?}"
        );
    }

    #[test]
    fn written_by() {
        test_link(
            r#"
            {
                "https://blockprotocol.org/types/@alice/link-type/written-by/v/1": "00000000-0000-0000-0000-000000000000"
            }
            "#,
        );
    }

    #[test]
    fn friend_of() {
        test_link(
            r#"
            {
                "https://blockprotocol.org/types/@alice/link-type/friend-of/v/1": ["00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000"]
            }
            "#,
        );
    }
}
