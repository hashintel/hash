use crate::{knowledge::EntityId, store::query::LinkTypeQuery};

#[derive(Debug, Default)]
pub struct LinkQuery<'q> {
    link_type_query: Option<LinkTypeQuery<'q>>,
    source_entity_id: Option<EntityId>,
}

impl LinkQuery<'_> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            link_type_query: None,
            source_entity_id: None,
        }
    }
}

/// Methods for building up a query.
impl<'q> LinkQuery<'q> {
    #[must_use]
    pub fn by_link_types<Q>(mut self, link_type_query: Q) -> Self
    where
        Q: FnOnce(LinkTypeQuery<'q>) -> LinkTypeQuery<'q>,
    {
        self.link_type_query = Some(link_type_query(LinkTypeQuery::new()));
        self
    }

    #[must_use]
    pub const fn by_source_entity_id(mut self, source_entity_id: EntityId) -> Self {
        self.source_entity_id = Some(source_entity_id);
        self
    }
}

/// Parameters specified in the query.
impl<'q> LinkQuery<'q> {
    #[must_use]
    pub const fn link_type_query(&self) -> Option<&LinkTypeQuery<'q>> {
        self.link_type_query.as_ref()
    }

    #[must_use]
    pub const fn source_entity_id(&self) -> Option<EntityId> {
        self.source_entity_id
    }
}
