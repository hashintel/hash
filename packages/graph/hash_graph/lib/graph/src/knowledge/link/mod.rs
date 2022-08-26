use std::{collections::HashMap, fmt};

use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::Component;

use super::EntityId;

/// A Link between a source and a target entity identified by [`EntityId`]s.
///
/// The link is described by a link type [`VersionedUri`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    source_entity_id: EntityId,
    target_entity_id: EntityId,
    #[component(value_type = String)]
    link_type_uri: VersionedUri,
}

impl Link {
    #[must_use]
    pub const fn new(
        source_entity_id: EntityId,
        target_entity_id: EntityId,
        link_type_uri: VersionedUri,
    ) -> Self {
        Self {
            source_entity_id,
            target_entity_id,
            link_type_uri,
        }
    }

    #[must_use]
    pub const fn source_entity(&self) -> EntityId {
        self.source_entity_id
    }

    #[must_use]
    pub const fn target_entity(&self) -> EntityId {
        self.target_entity_id
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

// TODO: Add PersistedLink to expose metadata about link instances

/// From a source entity, this is the outgoing link targeting one or more other entities given by
/// [`EntityId`]s.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Outgoing {
    Single(EntityId),
    Multiple(Vec<EntityId>),
}

/// A collection of links that originate from the same source entity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct Links {
    outgoing: HashMap<VersionedUri, Outgoing>,
}

impl Links {
    #[must_use]
    pub const fn new(links: HashMap<VersionedUri, Outgoing>) -> Self {
        Self { outgoing: links }
    }

    #[must_use]
    pub const fn outgoing(&self) -> &HashMap<VersionedUri, Outgoing> {
        &self.outgoing
    }
}

/// Specifies whether or not a link is active.
#[derive(Debug, Clone, Copy)]
#[non_exhaustive]
pub enum LinkStatus {
    Active,
    Inactive,
}

impl LinkStatus {
    #[must_use]
    const fn active(self) -> bool {
        match self {
            LinkStatus::Active => true,
            LinkStatus::Inactive => false,
        }
    }
}

impl ToSql for LinkStatus {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut postgres_types::private::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        self.active().to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool
    where
        Self: Sized,
    {
        bool::accepts(ty)
    }

    fn to_sql_checked(
        &self,
        ty: &postgres_types::Type,
        out: &mut postgres_types::private::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        self.active().to_sql_checked(ty, out)
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
                "outgoing": {
                    "https://blockprotocol.org/types/@alice/link-type/written-by/v/1": "00000000-0000-0000-0000-000000000000"
                }
            }
            "#,
        );
    }

    #[test]
    fn friend_of() {
        test_link(
            r#"
            {
                "outgoing": {
                    "https://blockprotocol.org/types/@alice/link-type/friend-of/v/1": ["00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000"]
                }
            }
            "#,
        );
    }
}
