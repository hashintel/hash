use alloc::borrow::Cow;

use hash_graph_store::{
    entity::EntityQueryPath,
    filter::{JsonPath, PathToken, QueryPath},
    subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind},
};
use hashql_core::{
    heap::Heap,
    symbol::{Symbol, sym},
    value::{Primitive, Value},
};

pub(crate) trait CompleteQueryPath<'heap>: QueryPath {
    type PartialQueryPath: PartialQueryPath<'heap, QueryPath = Self>;
}

pub(crate) trait PartialQueryPath<'heap>: Sized {
    type QueryPath;

    const UNSUPPORTED: bool = false;

    fn from_field(heap: &'heap Heap, field: Symbol<'heap>) -> Option<Self>;
    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self>;
    fn from_index(heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Option<Self>;
    fn access_index(self, heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Result<Self, Self>;
    fn finish(self) -> Option<Self::QueryPath>;
}

impl<'heap> PartialQueryPath<'heap> for ! {
    type QueryPath = !;

    const UNSUPPORTED: bool = true;

    fn from_field(_: &'heap Heap, _: Symbol<'heap>) -> Option<Self> {
        None
    }

    fn access_field(self, _: &'heap Heap, _: Symbol<'heap>) -> Result<Self, Self> {
        self
    }

    fn from_index(_: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, _: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Result<Self, Self> {
        self
    }

    fn finish(self) -> Option<Self::QueryPath> {
        None
    }
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

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        match field.as_constant()? {
            sym::web_id::CONST => Some(Self::WebId),
            sym::entity_uuid::CONST => Some(Self::EntityUuid),
            sym::draft_id::CONST => Some(Self::DraftId),
            _ => None,
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
    EditionId,
}

impl<'heap> PartialQueryPath<'heap> for PartialEntityRecordIdPath {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        match field.as_constant()? {
            sym::entity_id::CONST => Some(Self::EntityId(None)),
            sym::edition_id::CONST => Some(Self::EditionId),
            _ => None,
        }
    }

    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        match self {
            Self::EntityId(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::EntityId)
                .map_err(Self::EntityId),
            Self::EditionId => Err(self),
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
            Self::EditionId => Err(self),
        }
    }

    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::EntityId(Some(partial)) => partial.finish(),
            Self::EntityId(None) => None,
            Self::EditionId => Some(EntityQueryPath::EditionId),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialLinkDataPath {
    LeftEntityId(Option<PartialEntityIdQueryPath>),
    RightEntityId(Option<PartialEntityIdQueryPath>),
    LeftEntityConfidence,
    LeftEntityProvenance,
    RightEntityConfidence,
    RightEntityProvenance,
}

impl<'heap> PartialQueryPath<'heap> for PartialLinkDataPath {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        match field.as_constant()? {
            sym::left_entity_id::CONST => Some(Self::LeftEntityId(None)),
            sym::right_entity_id::CONST => Some(Self::RightEntityId(None)),
            sym::left_entity_confidence::CONST => Some(Self::LeftEntityConfidence),
            sym::left_entity_provenance::CONST => Some(Self::LeftEntityProvenance),
            sym::right_entity_confidence::CONST => Some(Self::RightEntityConfidence),
            sym::right_entity_provenance::CONST => Some(Self::RightEntityProvenance),
            _ => None,
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
            Self::LeftEntityConfidence
            | Self::LeftEntityProvenance
            | Self::RightEntityConfidence
            | Self::RightEntityProvenance => Err(self),
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
            Self::LeftEntityConfidence
            | Self::LeftEntityProvenance
            | Self::RightEntityConfidence
            | Self::RightEntityProvenance => Err(self),
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

            Self::LeftEntityConfidence => Some(EntityQueryPath::LeftEntityConfidence),
            Self::LeftEntityProvenance => Some(EntityQueryPath::LeftEntityProvenance),
            Self::RightEntityConfidence => Some(EntityQueryPath::RightEntityConfidence),
            Self::RightEntityProvenance => Some(EntityQueryPath::RightEntityProvenance),
        }
    }
}

fn value_as_usize(value: &Value<'_>) -> Option<usize> {
    match value {
        Value::Primitive(Primitive::Integer(integer)) => integer.as_usize(),
        Value::Primitive(Primitive::Float(float)) if let Some(integer) = float.as_integer() => {
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
pub(crate) enum PartialEntityMetadataPath<'heap> {
    RecordId(Option<PartialEntityRecordIdPath>),
    TemporalVersioning(Option<PartialTemporalVersioningPath>),
    Archived,
    Confidence,
    EntityTypeIds,
    Provenance(Option<PartialEntityProvenancePath<'heap>>),
    Properties(Option<JsonPath<'heap>>),
}

impl<'heap> PartialQueryPath<'heap> for PartialEntityMetadataPath<'heap> {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        match field.as_constant()? {
            sym::record_id::CONST => Some(Self::RecordId(None)),
            sym::temporal_versioning::CONST => Some(Self::TemporalVersioning(None)),
            sym::archived::CONST => Some(Self::Archived),
            sym::confidence::CONST => Some(Self::Confidence),
            sym::entity_type_ids::CONST => Some(Self::EntityTypeIds),
            sym::provenance::CONST => Some(Self::Provenance(None)),
            sym::properties::CONST => Some(Self::Properties(None)),
            _ => None,
        }
    }

    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        match self {
            Self::RecordId(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::RecordId)
                .map_err(Self::RecordId),
            Self::TemporalVersioning(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::TemporalVersioning)
                .map_err(Self::TemporalVersioning),
            Self::Provenance(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Provenance)
                .map_err(Self::Provenance),
            Self::Properties(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Properties)
                .map_err(Self::Properties),
            Self::Archived | Self::Confidence | Self::EntityTypeIds => Err(self),
        }
    }

    fn from_index(_: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Result<Self, Self> {
        match self {
            Self::RecordId(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::RecordId)
                .map_err(Self::RecordId),
            Self::Properties(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::Properties)
                .map_err(Self::Properties),
            Self::TemporalVersioning(_)
            | Self::Archived
            | Self::Confidence
            | Self::EntityTypeIds
            | Self::Provenance(_) => Err(self),
        }
    }

    #[expect(clippy::match_same_arms, reason = "readability")]
    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::RecordId(Some(partial)) => partial.finish(),
            Self::RecordId(None) => None,

            Self::TemporalVersioning(Some(partial)) => partial.finish(),
            Self::TemporalVersioning(None) => None,

            Self::Archived => Some(EntityQueryPath::Archived),
            Self::Confidence => Some(EntityQueryPath::EntityConfidence),
            Self::EntityTypeIds => Some(EntityQueryPath::EntityTypeEdge {
                edge_kind: hash_graph_store::subgraph::edges::SharedEdgeKind::IsOfType,
                path: hash_graph_store::entity_type::EntityTypeQueryPath::VersionedUrl,
                inheritance_depth: Some(0),
            }),

            Self::Provenance(Some(partial)) => partial.finish(),
            Self::Provenance(None) => None,

            Self::Properties(Some(partial)) => {
                Some(EntityQueryPath::PropertyMetadata(Some(partial.finish()?)))
            }
            Self::Properties(None) => Some(EntityQueryPath::PropertyMetadata(None)),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialTemporalVersioningPath {
    DecisionTime,
    TransactionTime,
}

impl<'heap> PartialQueryPath<'heap> for PartialTemporalVersioningPath {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        match field.as_constant()? {
            sym::decision_time::CONST => Some(Self::DecisionTime),
            sym::transaction_time::CONST => Some(Self::TransactionTime),
            _ => None,
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
            Self::DecisionTime => Some(EntityQueryPath::DecisionTime),
            Self::TransactionTime => Some(EntityQueryPath::TransactionTime),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialEntityProvenancePath<'heap> {
    Inferred(Option<JsonPath<'heap>>),
    Edition(Option<JsonPath<'heap>>),
}

impl<'heap> PartialQueryPath<'heap> for PartialEntityProvenancePath<'heap> {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        match field.as_constant()? {
            sym::inferred::CONST => Some(Self::Inferred(None)),
            sym::edition::CONST => Some(Self::Edition(None)),
            _ => None,
        }
    }

    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        match self {
            Self::Inferred(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Inferred)
                .map_err(Self::Inferred),
            Self::Edition(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Edition)
                .map_err(Self::Edition),
        }
    }

    fn from_index(_: &'heap Heap, _: Cow<'_, Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, heap: &'heap Heap, index: Cow<'_, Value<'heap>>) -> Result<Self, Self> {
        match self {
            Self::Inferred(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::Inferred)
                .map_err(Self::Inferred),
            Self::Edition(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::Edition)
                .map_err(Self::Edition),
        }
    }

    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::Inferred(path) => {
                Some(EntityQueryPath::Provenance(path.and_then(JsonPath::finish)))
            }
            Self::Edition(path) => Some(EntityQueryPath::EditionProvenance(
                path.and_then(JsonPath::finish),
            )),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum PartialEntityQueryPath<'heap> {
    Properties(Option<JsonPath<'heap>>),
    LinkData(Option<PartialLinkDataPath>),
    Metadata(Option<PartialEntityMetadataPath<'heap>>),
}

impl<'heap> PartialQueryPath<'heap> for PartialEntityQueryPath<'heap> {
    type QueryPath = EntityQueryPath<'heap>;

    fn from_field(_: &'heap Heap, field: Symbol<'heap>) -> Option<Self> {
        match field.as_constant()? {
            sym::properties::CONST => Some(Self::Properties(None)),
            sym::link_data::CONST => Some(Self::LinkData(None)),
            sym::metadata::CONST => Some(Self::Metadata(None)),
            _ => None,
        }
    }

    fn access_field(self, heap: &'heap Heap, field: Symbol<'heap>) -> Result<Self, Self> {
        match self {
            Self::Properties(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Properties)
                .map_err(Self::Properties),
            Self::LinkData(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::LinkData)
                .map_err(Self::LinkData),
            Self::Metadata(path) => traverse_into_field(path, heap, field)
                .map(Some)
                .map(Self::Metadata)
                .map_err(Self::Metadata),
        }
    }

    fn from_index(_: &'heap Heap, _: Cow<Value<'heap>>) -> Option<Self> {
        None
    }

    fn access_index(self, heap: &'heap Heap, index: Cow<Value<'heap>>) -> Result<Self, Self> {
        match self {
            Self::Properties(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::Properties)
                .map_err(Self::Properties),
            Self::LinkData(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::LinkData)
                .map_err(Self::LinkData),
            Self::Metadata(path) => traverse_into_index(path, heap, index)
                .map(Some)
                .map(Self::Metadata)
                .map_err(Self::Metadata),
        }
    }

    #[expect(clippy::match_same_arms, reason = "readability")]
    fn finish(self) -> Option<Self::QueryPath> {
        match self {
            Self::Properties(Some(partial)) => {
                Some(EntityQueryPath::Properties(Some(partial.finish()?)))
            }
            Self::Properties(None) => Some(EntityQueryPath::Properties(None)),

            Self::LinkData(Some(partial)) => partial.finish(),
            Self::LinkData(None) => None,

            Self::Metadata(Some(partial)) => partial.finish(),
            Self::Metadata(None) => None,
        }
    }
}
