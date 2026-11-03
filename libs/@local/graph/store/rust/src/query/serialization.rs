use core::fmt;

use serde::{
    Serialize, Serializer,
    ser::{Error as _, SerializeSeq},
};

use crate::{
    data_type::{DataTypeQueryPath, DataTypeQueryToken},
    entity::{EntityQueryPath, EntityQuerySortingToken, EntityQueryToken, MetaTag},
    entity_type::{EntityTypeQueryPath, EntityTypeQueryToken},
    filter::{JsonPath, Parameter, PathToken, Selector},
    property_type::{PropertyTypeQueryPath, PropertyTypeQueryToken},
    subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
};

trait SerializePath {
    fn write_path<S: SerializeSeq>(&self, sequence: &mut S) -> Result<(), S::Error>;
}

macro_rules! serialize_path {
    ($($path:ident),+ $(,)?) => {$ (
        impl Serialize for $path<'_> {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                let mut sequence = serializer.serialize_seq(None)?;
                self.write_path(&mut sequence)?;
                sequence.end()
            }
        }
    )+};
}

serialize_path!(
    EntityQueryPath,
    EntityTypeQueryPath,
    PropertyTypeQueryPath,
    DataTypeQueryPath
);

fn unsupported<E: serde::ser::Error>(path: &impl fmt::Display) -> E {
    E::custom(format!(
        "query path `{path}` has no Graph API representation"
    ))
}

fn with_depth(token: &str, depth: Option<u32>) -> String {
    depth.map_or_else(
        || token.to_owned(),
        |depth| format!("{token}(inheritanceDepth={depth})"),
    )
}

fn json_path<S: SerializeSeq>(
    sequence: &mut S,
    token: impl Serialize,
    path: Option<&JsonPath<'_>>,
) -> Result<(), S::Error> {
    sequence.serialize_element(&token)?;
    if let Some(path) = path {
        for token in path.path_tokens() {
            sequence.serialize_element(token)?;
        }
    }
    Ok(())
}

impl SerializePath for EntityQueryPath<'_> {
    fn write_path<S: SerializeSeq>(&self, sequence: &mut S) -> Result<(), S::Error> {
        let token = match self {
            Self::Uuid => EntityQueryToken::Uuid,
            Self::WebId => EntityQueryToken::WebId,
            Self::DraftId => EntityQueryToken::DraftId,
            Self::EditionId => EntityQueryToken::EditionId,
            Self::Archived => EntityQueryToken::Archived,
            Self::CreatedById => EntityQueryToken::CreatedById,
            Self::EditionCreatedById => EntityQueryToken::EditionCreatedById,
            Self::CreatedAtTransactionTime => EntityQueryToken::CreatedAtTransactionTime,
            Self::CreatedAtDecisionTime => EntityQueryToken::CreatedAtDecisionTime,
            Self::Embedding => EntityQueryToken::Embedding,
            Self::Properties(path) => {
                return json_path(sequence, EntityQueryToken::Properties, path.as_ref());
            }
            Self::Provenance(path) => {
                return json_path(sequence, EntityQueryToken::Provenance, path.as_ref());
            }
            Self::EditionProvenance(path) => {
                return json_path(sequence, EntityQueryToken::EditionProvenance, path.as_ref());
            }
            Self::Label { inheritance_depth } => {
                return sequence.serialize_element(&with_depth("label", *inheritance_depth));
            }
            Self::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
                inheritance_depth,
            } => {
                sequence.serialize_element(&with_depth("type", *inheritance_depth))?;
                return path.write_path(sequence);
            }
            Self::EntityEdge {
                edge_kind,
                path,
                direction,
            } => {
                let token = match (edge_kind, direction) {
                    (KnowledgeGraphEdgeKind::HasLeftEntity, EdgeDirection::Outgoing) => {
                        EntityQueryToken::LeftEntity
                    }
                    (KnowledgeGraphEdgeKind::HasRightEntity, EdgeDirection::Outgoing) => {
                        EntityQueryToken::RightEntity
                    }
                    (KnowledgeGraphEdgeKind::HasLeftEntity, EdgeDirection::Incoming) => {
                        EntityQueryToken::OutgoingLinks
                    }
                    (KnowledgeGraphEdgeKind::HasRightEntity, EdgeDirection::Incoming) => {
                        EntityQueryToken::IncomingLinks
                    }
                };
                sequence.serialize_element(&token)?;
                return path.write_path(sequence);
            }
            Self::PropertyMetadata(Some(path)) => {
                sequence.serialize_element(&EntityQueryToken::Properties)?;
                let mut tokens = path.path_tokens();
                while let [PathToken::Field(value), property, rest @ ..] = tokens {
                    if value != "value" {
                        break;
                    }
                    sequence.serialize_element(property)?;
                    tokens = rest;
                }
                return match tokens {
                    [PathToken::Field(metadata), PathToken::Field(field)]
                        if metadata == "metadata" && field == "dataTypeId" =>
                    {
                        sequence.serialize_element(&MetaTag::DataTypeId)
                    }
                    [PathToken::Field(metadata), PathToken::Field(field), target]
                        if metadata == "metadata" && field == "canonical" =>
                    {
                        sequence.serialize_element(&MetaTag::Convert)?;
                        sequence.serialize_element(target)
                    }
                    _ => Err(unsupported(self)),
                };
            }
            Self::DecisionTime
            | Self::TransactionTime
            | Self::DirectTypeCount
            | Self::EntityConfidence
            | Self::LeftEntityConfidence
            | Self::LeftEntityProvenance
            | Self::RightEntityConfidence
            | Self::RightEntityProvenance
            | Self::ReadOnly
            | Self::ScalarProperties
            | Self::PropertyCount
            | Self::PropertyMetadata(None)
            | Self::FirstTypeTitle
            | Self::FirstLabel
            | Self::FirstLabelProperty => return Err(unsupported(self)),
        };
        sequence.serialize_element(&token)
    }
}

impl SerializePath for EntityTypeQueryPath<'_> {
    fn write_path<S: SerializeSeq>(&self, sequence: &mut S) -> Result<(), S::Error> {
        let token = match self {
            Self::BaseUrl => EntityTypeQueryToken::BaseUrl,
            Self::Version => EntityTypeQueryToken::Version,
            Self::VersionedUrl => EntityTypeQueryToken::VersionedUrl,
            Self::WebId => EntityTypeQueryToken::WebId,
            Self::Title => EntityTypeQueryToken::Title,
            Self::Description => EntityTypeQueryToken::Description,
            Self::Required => EntityTypeQueryToken::Required,
            Self::LabelProperty => EntityTypeQueryToken::LabelProperty,
            Self::Icon => EntityTypeQueryToken::Icon,
            Self::Embedding => EntityTypeQueryToken::Embedding,
            Self::EditionProvenance(path) => {
                return json_path(
                    sequence,
                    EntityTypeQueryToken::EditionProvenance,
                    path.as_ref(),
                );
            }
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                inheritance_depth,
            } => {
                sequence.serialize_element(&with_depth("properties", *inheritance_depth))?;
                sequence.serialize_element(&Selector::Asterisk)?;
                return path.write_path(sequence);
            }
            Self::EntityTypeEdge {
                edge_kind,
                path,
                direction,
                inheritance_depth,
            } => {
                let token = match (edge_kind, direction) {
                    (OntologyEdgeKind::ConstrainsLinksOn, EdgeDirection::Outgoing) => "links",
                    (OntologyEdgeKind::ConstrainsLinkDestinationsOn, EdgeDirection::Outgoing) => {
                        "linkDestinations"
                    }
                    (OntologyEdgeKind::InheritsFrom, EdgeDirection::Outgoing) => "inheritsFrom",
                    (OntologyEdgeKind::InheritsFrom, EdgeDirection::Incoming) => "children",
                    _ => return Err(unsupported(self)),
                };
                sequence.serialize_element(&with_depth(token, *inheritance_depth))?;
                sequence.serialize_element(&Selector::Asterisk)?;
                return path.write_path(sequence);
            }
            Self::TransactionTime
            | Self::PropertyTypeEdge { .. }
            | Self::EntityEdge { .. }
            | Self::OntologyId
            | Self::Schema(_)
            | Self::ClosedSchema(_)
            | Self::AdditionalMetadata => return Err(unsupported(self)),
        };
        sequence.serialize_element(&token)
    }
}

impl SerializePath for PropertyTypeQueryPath<'_> {
    fn write_path<S: SerializeSeq>(&self, sequence: &mut S) -> Result<(), S::Error> {
        let token = match self {
            Self::BaseUrl => PropertyTypeQueryToken::BaseUrl,
            Self::Version => PropertyTypeQueryToken::Version,
            Self::VersionedUrl => PropertyTypeQueryToken::VersionedUrl,
            Self::WebId => PropertyTypeQueryToken::WebId,
            Self::Title => PropertyTypeQueryToken::Title,
            Self::Description => PropertyTypeQueryToken::Description,
            Self::Embedding => PropertyTypeQueryToken::Embedding,
            Self::EditionProvenance(path) => {
                return json_path(
                    sequence,
                    PropertyTypeQueryToken::EditionProvenance,
                    path.as_ref(),
                );
            }
            Self::DataTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => {
                sequence.serialize_element(&PropertyTypeQueryToken::DataTypes)?;
                sequence.serialize_element(&Selector::Asterisk)?;
                return path.write_path(sequence);
            }
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                direction: EdgeDirection::Outgoing,
            } => {
                sequence.serialize_element(&PropertyTypeQueryToken::PropertyTypes)?;
                sequence.serialize_element(&Selector::Asterisk)?;
                return path.write_path(sequence);
            }
            Self::TransactionTime
            | Self::DataTypeEdge { .. }
            | Self::PropertyTypeEdge { .. }
            | Self::EntityTypeEdge { .. }
            | Self::OntologyId
            | Self::Schema(_)
            | Self::AdditionalMetadata => return Err(unsupported(self)),
        };
        sequence.serialize_element(&token)
    }
}

impl SerializePath for DataTypeQueryPath<'_> {
    fn write_path<S: SerializeSeq>(&self, sequence: &mut S) -> Result<(), S::Error> {
        let token = match self {
            Self::BaseUrl => DataTypeQueryToken::BaseUrl,
            Self::Version => DataTypeQueryToken::Version,
            Self::VersionedUrl => DataTypeQueryToken::VersionedUrl,
            Self::WebId => DataTypeQueryToken::WebId,
            Self::Title => DataTypeQueryToken::Title,
            Self::Description => DataTypeQueryToken::Description,
            Self::Type => DataTypeQueryToken::Type,
            Self::Embedding => DataTypeQueryToken::Embedding,
            Self::EditionProvenance(path) => {
                return json_path(
                    sequence,
                    DataTypeQueryToken::EditionProvenance,
                    path.as_ref(),
                );
            }
            Self::DataTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                path,
                direction,
                inheritance_depth,
            } => {
                let token = match direction {
                    EdgeDirection::Outgoing => "inheritsFrom",
                    EdgeDirection::Incoming => "children",
                };
                sequence.serialize_element(&with_depth(token, *inheritance_depth))?;
                sequence.serialize_element(&Selector::Asterisk)?;
                return path.write_path(sequence);
            }
            Self::TransactionTime
            | Self::OntologyId
            | Self::Schema(_)
            | Self::DataTypeEdge { .. }
            | Self::PropertyTypeEdge { .. }
            | Self::AdditionalMetadata
            | Self::TargetConversionBaseUrls
            | Self::FromConversions
            | Self::IntoConversions => return Err(unsupported(self)),
        };
        sequence.serialize_element(&token)
    }
}

impl Serialize for Parameter<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Boolean(value) => value.serialize(serializer),
            Self::Decimal(value) => value.serialize(serializer),
            Self::Text(value) => value.serialize(serializer),
            Self::Vector(value) => value.serialize(serializer),
            Self::Any(value) => value.serialize(serializer),
            Self::Uuid(value) => value.serialize(serializer),
            Self::OntologyTypeVersion(value) => value.serialize(serializer),
            Self::Timestamp(value) => value.serialize(serializer),
        }
    }
}

pub(crate) fn sorting_path<S: Serializer>(
    path: &EntityQueryPath<'_>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let token = match path {
        EntityQueryPath::Uuid => EntityQuerySortingToken::Uuid,
        EntityQueryPath::Archived => EntityQuerySortingToken::Archived,
        EntityQueryPath::TransactionTime => {
            EntityQuerySortingToken::EditionCreatedAtTransactionTime
        }
        EntityQueryPath::DecisionTime => EntityQuerySortingToken::EditionCreatedAtDecisionTime,
        EntityQueryPath::CreatedAtTransactionTime => {
            EntityQuerySortingToken::CreatedAtTransactionTime
        }
        EntityQueryPath::CreatedAtDecisionTime => EntityQuerySortingToken::CreatedAtDecisionTime,
        EntityQueryPath::FirstTypeTitle => EntityQuerySortingToken::TypeTitle,
        EntityQueryPath::FirstLabel => EntityQuerySortingToken::Label,
        EntityQueryPath::WebId
        | EntityQueryPath::DraftId
        | EntityQueryPath::EditionId
        | EntityQueryPath::DirectTypeCount
        | EntityQueryPath::EntityConfidence
        | EntityQueryPath::LeftEntityConfidence
        | EntityQueryPath::LeftEntityProvenance
        | EntityQueryPath::RightEntityConfidence
        | EntityQueryPath::RightEntityProvenance
        | EntityQueryPath::ReadOnly
        | EntityQueryPath::CreatedById
        | EntityQueryPath::EditionCreatedById
        | EntityQueryPath::EntityTypeEdge { .. }
        | EntityQueryPath::EntityEdge { .. }
        | EntityQueryPath::Properties(_)
        | EntityQueryPath::ScalarProperties
        | EntityQueryPath::PropertyCount
        | EntityQueryPath::Label { .. }
        | EntityQueryPath::Provenance(_)
        | EntityQueryPath::EditionProvenance(_)
        | EntityQueryPath::PropertyMetadata(_)
        | EntityQueryPath::Embedding
        | EntityQueryPath::FirstLabelProperty => {
            return Err(S::Error::custom(format!(
                "query path `{path}` is not a Graph API sorting path"
            )));
        }
    };
    [token].serialize(serializer)
}

#[cfg(test)]
mod tests {
    use rstest::rstest;
    use serde::Deserialize as _;
    use serde_json::{Value, json};
    use type_system::{
        knowledge::{
            Entity,
            entity::{EntityId, id::EntityUuid},
        },
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use crate::{
        entity::{EntityQueryPath, EntityQuerySortingRecord},
        entity_type::EntityTypeQueryPath,
        filter::{Filter, Parameter},
        query::{NullOrdering, Ordering},
    };

    #[rstest]
    #[case(json!(["webId"]))]
    #[case(json!(["uuid"]))]
    #[case(json!(["archived"]))]
    #[case(json!(["type", "versionedUrl"]))]
    #[case(json!(["type(inheritanceDepth=2)", "properties", "*", "dataTypes", "*", "versionedUrl"]))]
    #[case(json!(["type", "links", "*", "children(inheritanceDepth=1)", "*", "baseUrl"]))]
    #[case(json!(["type", "properties", "*", "propertyTypes", "*", "baseUrl"]))]
    #[case(json!(["type", "properties", "*", "dataTypes", "*", "inheritsFrom(inheritanceDepth=3)", "*", "baseUrl"]))]
    #[case(json!(["incomingLinks", "leftEntity", "uuid"]))]
    #[case(json!(["outgoingLinks", "rightEntity", "uuid"]))]
    #[case(json!(["label(inheritanceDepth=1)"]))]
    #[case(json!(["properties", "https://example.com/property/", 0]))]
    #[case(json!(["properties", "https://example.com/property/", "dataTypeId"]))]
    #[case(json!(["properties", "https://example.com/property/", "https://example.com/nested/", "convert", "https://example.com/unit/"]))]
    #[case(json!(["provenance", "sources", 0, "type"]))]
    #[case(json!(["editionProvenance", "origin", "type"]))]
    fn entity_path_wire_format(#[case] wire: Value) {
        let path = EntityQueryPath::deserialize(&wire).expect("the query path should deserialize");
        assert_eq!(
            serde_json::to_value(&path).expect("the query path should serialize"),
            wire
        );
    }

    #[rstest]
    #[case("uuid")]
    #[case("archived")]
    #[case("label")]
    #[case("typeTitle")]
    #[case("editionCreatedAtTransactionTime")]
    #[case("editionCreatedAtDecisionTime")]
    #[case("createdAtTransactionTime")]
    #[case("createdAtDecisionTime")]
    fn sorting_path_wire_format(#[case] token: &str) {
        let wire = json!({"path": [token], "ordering": "ascending", "nulls": "last"});
        let record = EntityQuerySortingRecord::deserialize(&wire)
            .expect("the sorting record should deserialize");
        assert_eq!(
            serde_json::to_value(&record).expect("the sorting record should serialize"),
            wire
        );
        assert_eq!(record.ordering, Ordering::Ascending);
        assert_eq!(record.nulls, Some(NullOrdering::Last));
    }

    #[test]
    fn entity_identity_filter_wire_format() {
        let web = Uuid::new_v4();
        let uuid = Uuid::new_v4();
        let filter = Filter::<Entity>::for_entity_by_entity_id(EntityId {
            web_id: WebId::new(web),
            entity_uuid: EntityUuid::new(uuid),
            draft_id: None,
        });
        assert_eq!(
            serde_json::to_value(&filter).expect("the identity filter should serialize"),
            json!({"all": [
                {"equal": [{"path": ["webId"]}, {"parameter": web}]},
                {"equal": [{"path": ["uuid"]}, {"parameter": uuid}]}
            ]})
        );
        assert_eq!(
            serde_json::to_value(Parameter::Uuid(uuid))
                .expect("the UUID parameter should serialize"),
            json!(uuid)
        );
    }

    #[test]
    fn internal_paths() {
        assert!(
            serde_json::to_value(EntityQueryPath::DirectTypeCount).is_err(),
            "an internal entity path should be rejected"
        );
        assert!(
            serde_json::to_value(EntityTypeQueryPath::OntologyId).is_err(),
            "an internal ontology path should be rejected"
        );
    }
}
