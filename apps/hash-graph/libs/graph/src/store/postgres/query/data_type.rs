use core::iter::once;

use hash_graph_store::{
    data_type::DataTypeQueryPath,
    subgraph::edges::{EdgeDirection, OntologyEdgeKind},
};

use crate::store::postgres::query::{
    PostgresQueryPath,
    table::{
        Column, DataTypeConversionAggregation, DataTypeEmbeddings, DataTypes, JsonField,
        OntologyAdditionalMetadata, OntologyIds, OntologyOwnedMetadata, OntologyTemporalMetadata,
        ReferenceTable, Relation,
    },
};

impl PostgresQueryPath for DataTypeQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::OntologyId
            | Self::VersionedUrl
            | Self::Title
            | Self::Description
            | Self::Type
            | Self::Schema(_) => vec![Relation::DataTypeIds],
            Self::BaseUrl | Self::Version => vec![Relation::OntologyIds],
            Self::OwnedById => vec![Relation::OntologyOwnedMetadata],
            Self::AdditionalMetadata => vec![Relation::OntologyAdditionalMetadata],
            Self::Embedding => vec![Relation::DataTypeEmbeddings],
            Self::TransactionTime | Self::EditionProvenance(_) => vec![],
            Self::DataTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                path,
                direction,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::DataTypeInheritsFrom {
                    inheritance_depth: *inheritance_depth,
                },
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsValuesOn,
                direction: EdgeDirection::Incoming,
            })
            .chain(path.relations())
            .collect(),
            Self::DataTypeEdge { .. } | Self::PropertyTypeEdge { .. } => {
                unreachable!("Invalid path: {self}")
            }
            Self::TargetConversionBaseUrls | Self::FromConversions | Self::IntoConversions => {
                once(Relation::DataTypeConversions).collect()
            }
        }
    }

    fn terminating_column(&self) -> (Column, Option<JsonField<'_>>) {
        match self {
            Self::BaseUrl => (Column::OntologyIds(OntologyIds::BaseUrl), None),
            Self::Version => (Column::OntologyIds(OntologyIds::Version), None),
            Self::TransactionTime => (
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::TransactionTime),
                None,
            ),
            Self::OwnedById => (
                Column::OntologyOwnedMetadata(OntologyOwnedMetadata::WebId),
                None,
            ),
            Self::OntologyId => (Column::DataTypes(DataTypes::OntologyId), None),
            Self::Embedding => (
                Column::DataTypeEmbeddings(DataTypeEmbeddings::Embedding),
                None,
            ),
            Self::Schema(path) => (
                Column::DataTypes(DataTypes::Schema),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::VersionedUrl => (
                Column::DataTypes(DataTypes::Schema),
                Some(JsonField::StaticText("$id")),
            ),
            Self::Title => (
                Column::DataTypes(DataTypes::Schema),
                Some(JsonField::StaticText("title")),
            ),
            Self::Type => (
                Column::DataTypes(DataTypes::Schema),
                Some(JsonField::StaticText("type")),
            ),
            Self::Description => (
                Column::DataTypes(DataTypes::Schema),
                Some(JsonField::StaticText("description")),
            ),
            Self::DataTypeEdge { path, .. } => path.terminating_column(),
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::AdditionalMetadata => (
                Column::OntologyAdditionalMetadata(OntologyAdditionalMetadata::AdditionalMetadata),
                None,
            ),
            Self::EditionProvenance(path) => (
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::Provenance),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::TargetConversionBaseUrls => (
                Column::DataTypeConversionAggregation(
                    DataTypeConversionAggregation::TargetDataTypeBaseUrls,
                ),
                None,
            ),
            Self::FromConversions => (
                Column::DataTypeConversionAggregation(DataTypeConversionAggregation::Froms),
                None,
            ),
            Self::IntoConversions => (
                Column::DataTypeConversionAggregation(DataTypeConversionAggregation::Intos),
                None,
            ),
        }
    }
}
