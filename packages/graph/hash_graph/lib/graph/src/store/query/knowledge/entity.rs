use crate::knowledge::EntityId;

#[derive(Debug, Copy, Clone)]
pub enum EntityVersion {
    Latest,
}

#[derive(Debug, Default)]
pub struct EntityQuery {
    id: Option<EntityId>,
    version: Option<EntityVersion>,
}

impl EntityQuery {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            id: None,
            version: None,
        }
    }
}

/// Methods for building up a query.
impl EntityQuery {
    #[must_use]
    pub const fn by_id(mut self, id: EntityId) -> Self {
        self.id = Some(id);
        self
    }

    #[must_use]
    pub const fn by_latest_version(mut self) -> Self {
        self.version = Some(EntityVersion::Latest);
        self
    }
}

/// Parameters specified in the query.
impl EntityQuery {
    #[must_use]
    pub const fn id(&self) -> Option<EntityId> {
        self.id
    }

    #[must_use]
    pub const fn version(&self) -> Option<EntityVersion> {
        self.version
    }
}
