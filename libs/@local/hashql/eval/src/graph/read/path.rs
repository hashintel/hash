use alloc::borrow::Cow;

use hash_graph_store::{
    entity::EntityQueryPath,
    filter::{JsonPath, PathToken, QueryPath},
    subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind},
};
use hashql_core::{heap::Heap, literal::LiteralKind, symbol::Symbol, value::Value};

pub(crate) trait CompleteQueryPath<'heap>: QueryPath {
    type PartialQueryPath: PartialQueryPath<'heap, QueryPath = Self>;
}

pub(crate) trait PartialQueryPath<'heap>: Sized {
    type QueryPath;

    fn from_field(heap: &'heap Heap, field: Symbol<'heap>) -> Option<Self>;
    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self>;
    fn from_index(heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Option<Self>;
    fn access_index(self, heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Result<Self, Self>;
    fn finish(self) -> Option<Self::QueryPath>;
}

impl<'heap> CompleteQueryPath<'heap> for EntityQueryPath<'heap> {
    type PartialQueryPath = PartialEntityQueryPath<'heap>;
}

pub(crate) fn traverse_into_field<'heap, P>(
    path: Option<P>,
    heap: &'heap Heap,
    field: Symbol<'heap>,
) -> Result<P, Option<P>>
where
    P: PartialQueryPath<'heap>,
{
    #[expect(clippy::option_if_let_else, reason = "readability")]
    match path {
        Some(path) => path.access_field(heap, field).map_err(Some),
        None => P::from_field(heap, field).ok_or(None),
    }
}

pub(crate) fn traverse_into_index<'heap, P>(
    path: Option<P>,
    heap: &'heap Heap,
    index: Cow<'_, Value<'heap>>,
) -> Result<P, Option<P>>
where
    P: PartialQueryPath<'heap>,
{
    match path {
        Some(path) => path.access_index(heap, index).map_err(Some),
        None => P::from_index(heap, index).ok_or(None),
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialEntityIdQueryPath {
    WebId,
    EntityUuid,
    DraftId,
}

impl<'heap> PartialQueryPath<'heap> for PartialEntityIdQueryPath {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(heap: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        // see: https://linear.app/hash/issue/H-4512/hashql-use-symbol-sym-constants-instead-of-string-literals
        let web_id = heap.intern_symbol("web_id");
        let entity_uuid = heap.intern_symbol("entity_uuid");
        let draft_id = heap.intern_symbol("draft_id");

        if field == web_id {
            Some(Self::WebId)
        } else if field == entity_uuid {
            Some(Self::EntityUuid)
        } else if field == draft_id {
            Some(Self::DraftId)
        } else {
            None
        }
    }

    fn access_field(self, _: &'heap Heap, _: Symbol<'heap>) -> Result<Self, Self> {
        Err(self)
    }

    fn from_index(_: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, _: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Result<Self, Self> {
        Err(self)
    }

    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::WebId => Some(EntityQueryPath::WebId),
            Self::EntityUuid => Some(EntityQueryPath::Uuid),
            Self::DraftId => Some(EntityQueryPath::DraftId),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialEntityRecordIdPath {
    EntityId(Option<PartialEntityIdQueryPath>),
    EntityEditionId,
}

impl<'heap> PartialQueryPath<'heap> for PartialEntityRecordIdPath {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(heap: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        // see: https://linear.app/hash/issue/H-4512/hashql-use-symbol-sym-constants-instead-of-string-literals
        let entity_id = heap.intern_symbol("entity_id");
        let entity_edition_id = heap.intern_symbol("entity_edition_id");

        if field == entity_id {
            Some(Self::EntityId(None))
        } else if field == entity_edition_id {
            Some(Self::EntityEditionId)
        } else {
            None
        }
    }

    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        match self {
            Self::EntityId(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::EntityId)
                .map_err(Self::EntityId),
            Self::EntityEditionId => Err(self),
        }
    }

    fn from_index(_: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Result<Self, Self> {
        match self {
            Self::EntityId(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::EntityId)
                .map_err(Self::EntityId),
            Self::EntityEditionId => Err(self),
        }
    }

    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::EntityId(Some(partial)) => partial.finish(),
            Self::EntityId(None) => None,
            Self::EntityEditionId => Some(EntityQueryPath::EditionId),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialLinkDataPath {
    LeftEntityId(Option<PartialEntityIdQueryPath>),
    RightEntityId(Option<PartialEntityIdQueryPath>),
}

impl<'heap> PartialQueryPath<'heap> for PartialLinkDataPath {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(heap: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        let left_entity_id = heap.intern_symbol("left_entity_id");
        let right_entity_id = heap.intern_symbol("right_entity_id");

        if field == left_entity_id {
            Some(Self::LeftEntityId(None))
        } else if field == right_entity_id {
            Some(Self::RightEntityId(None))
        } else {
            None
        }
    }

    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        match self {
            Self::LeftEntityId(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::LeftEntityId)
                .map_err(Self::LeftEntityId),
            Self::RightEntityId(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::RightEntityId)
                .map_err(Self::RightEntityId),
        }
    }

    fn from_index(_: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Result<Self, Self> {
        match self {
            Self::LeftEntityId(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::LeftEntityId)
                .map_err(Self::LeftEntityId),
            Self::RightEntityId(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::RightEntityId)
                .map_err(Self::RightEntityId),
        }
    }

    #[expect(clippy::match_same_arms, reason = "readability")]
    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::LeftEntityId(Some(partial)) => Some(EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(partial.finish()?),
                direction: EdgeDirection::Outgoing,
            }),
            Self::LeftEntityId(None) => None,

            Self::RightEntityId(Some(partial)) => Some(EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(partial.finish()?),
                direction: EdgeDirection::Outgoing,
            }),
            Self::RightEntityId(None) => None,
        }
    }
}

fn value_as_usize(value: &Value<'_>) -> Option<usize> {
    match value {
        Value::Primitive(LiteralKind::Integer(integer)) => integer.as_usize(),
        Value::Primitive(LiteralKind::Float(float)) if let Some(integer) = float.as_integer() => {
            integer.as_usize()
        }
        Value::Primitive(_)
        | Value::Struct(_)
        | Value::Tuple(_)
        | Value::List(_)
        | Value::Dict(_)
        | Value::Opaque(_) => None,
    }
}

impl<'heap> PartialQueryPath<'heap> for JsonPath<'heap> {
    type QueryPath = Self;

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        Some(JsonPath::from_path_tokens(vec![PathToken::Field(
            Cow::Borrowed(field.unwrap()),
        )]))
    }

    fn access_field(mut self, _: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        self.push(PathToken::Field(Cow::Borrowed(field.unwrap())));
        Ok(self)
    }

    fn from_index(_: &'heap Heap, index: Cow<Value<'heap>>) -> Option<Self> {
        let index = value_as_usize(&index)?;

        Some(JsonPath::from_path_tokens(vec![PathToken::Index(index)]))
    }

    fn access_index(mut self, _: &'heap Heap, index: Cow<Value<'heap>>) -> Result<Self, Self> {
        let Some(index) = value_as_usize(&index) else {
            return Err(self);
        };

        self.push(PathToken::Index(index));
        Ok(self)
    }

    fn finish(self) -> Option<Self::QueryPath> {
        Some(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialEntityQueryPath<'heap> {
    Id(Option<PartialEntityRecordIdPath>),
    Properties(Option<JsonPath<'heap>>),
    LinkData(Option<PartialLinkDataPath>),
}

impl<'heap> PartialQueryPath<'heap> for PartialEntityQueryPath<'heap> {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(heap: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        let id = heap.intern_symbol("id");
        let properties = heap.intern_symbol("properties");
        let link_data = heap.intern_symbol("link_data");

        if field == id {
            Some(PartialEntityQueryPath::Id(None))
        } else if field == properties {
            Some(PartialEntityQueryPath::Properties(None))
        } else if field == link_data {
            Some(PartialEntityQueryPath::LinkData(None))
        } else {
            None
        }
    }

    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        match self {
            Self::Id(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Id)
                .map_err(Self::Id),
            Self::Properties(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Properties)
                .map_err(Self::Properties),
            Self::LinkData(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::LinkData)
                .map_err(Self::LinkData),
        }
    }

    fn from_index(_: &'heap Heap, _: Cow<Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, heap: &'heap Heap, index: Cow<Value<'heap>>) -> Result<Self, Self> {
        match self {
            Self::Id(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::Id)
                .map_err(Self::Id),
            Self::Properties(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::Properties)
                .map_err(Self::Properties),
            Self::LinkData(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::LinkData)
                .map_err(Self::LinkData),
        }
    }

    #[expect(clippy::match_same_arms, reason = "readability")]
    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::Id(Some(partial)) => partial.finish(),
            Self::Id(None) => None,

            Self::Properties(Some(partial)) => {
                Some(EntityQueryPath::Properties(Some(partial.finish()?)))
            }
            Self::Properties(None) => Some(EntityQueryPath::Properties(None)),

            Self::LinkData(Some(partial)) => partial.finish(),
            Self::LinkData(None) => None,
        }
    }
}
