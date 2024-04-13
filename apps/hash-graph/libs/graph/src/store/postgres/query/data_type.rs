use std::iter::once;

use crate::{
    ontology::DataTypeQueryPath,
    store::postgres::query::{
        table::{
            Column, DataTypeEmbeddings, DataTypes, JsonField, OntologyAdditionalMetadata,
            OntologyIds, OntologyOwnedMetadata, OntologyTemporalMetadata, ReferenceTable, Relation,
        },
        PostgresQueryPath,
    },
    subgraph::edges::{EdgeDirection, OntologyEdgeKind},
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
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsValuesOn,
                direction: EdgeDirection::Incoming,
            })
            .chain(path.relations())
            .collect(),
            Self::PropertyTypeEdge { .. } => unreachable!("Invalid path: {self}"),
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::BaseUrl => Column::OntologyIds(OntologyIds::BaseUrl),
            Self::Version => Column::OntologyIds(OntologyIds::Version),
            Self::TransactionTime => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::TransactionTime)
            }
            Self::OwnedById => Column::OntologyOwnedMetadata(OntologyOwnedMetadata::WebId),
            Self::OntologyId => Column::DataTypes(DataTypes::OntologyId),
            Self::Embedding => Column::DataTypeEmbeddings(DataTypeEmbeddings::Embedding),
            Self::Schema(path) => path
                .as_ref()
                .map_or(Column::DataTypes(DataTypes::Schema(None)), |path| {
                    Column::DataTypes(DataTypes::Schema(Some(JsonField::JsonPath(path))))
                }),
            Self::VersionedUrl => {
                Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("$id"))))
            }
            Self::Title => {
                Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("title"))))
            }
            Self::Type => Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("type")))),
            Self::Description => Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText(
                "description",
            )))),
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::AdditionalMetadata => {
                Column::OntologyAdditionalMetadata(OntologyAdditionalMetadata::AdditionalMetadata)
            }
            Self::EditionProvenance(path) => path.as_ref().map_or(
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::Provenance(None)),
                |path| {
                    Column::OntologyTemporalMetadata(OntologyTemporalMetadata::Provenance(Some(
                        JsonField::JsonPath(path),
                    )))
                },
            ),
        }
    }
}
