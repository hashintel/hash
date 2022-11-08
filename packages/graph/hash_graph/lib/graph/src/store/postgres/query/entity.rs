use std::iter::once;

use postgres_types::ToSql;

use crate::{
    knowledge::{Entity, EntityQueryPath},
    ontology::EntityTypeQueryPath,
    store::postgres::query::{ColumnAccess, Path, PostgresQueryRecord, Relation, Table, TableName},
};

impl PostgresQueryRecord for Entity {
    fn base_table() -> Table {
        Table {
            name: TableName::Entities,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'static [Self::Path<'static>] {
        &[
            EntityQueryPath::Properties(None),
            EntityQueryPath::Id,
            EntityQueryPath::Version,
            EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri),
            EntityQueryPath::OwnedById,
            EntityQueryPath::CreatedById,
            EntityQueryPath::UpdatedById,
        ]
    }
}

impl Path for EntityQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::Type(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "entity_type_version_id",
                },
                join_table_name: TableName::EntityTypes,
                join_column_access: EntityTypeQueryPath::VersionId.column_access(),
            })
            .chain(path.relations())
            .collect(),
            Self::LeftEntity(Some(path)) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "left_entity_id",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "entity_id",
                },
            })
            .chain(path.relations())
            .collect(),
            Self::RightEntity(Some(path)) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "right_entity_id",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "entity_id",
                },
            })
            .chain(path.relations())
            .collect(),
            Self::OutgoingLinks(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "entity_id",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "left_entity_id",
                },
            })
            .chain(path.relations())
            .collect(),
            Self::IncomingLinks(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "entity_id",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "right_entity_id",
                },
            })
            .chain(path.relations())
            .collect(),
            _ => vec![],
        }
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::Id
            | Self::OwnedById
            | Self::CreatedById
            | Self::UpdatedById
            | Self::RemovedById
            | Self::Version
            | Self::Archived
            | Self::LeftEntity(None)
            | Self::RightEntity(None)
            | Self::LeftOrder
            | Self::RightOrder
            | Self::Properties(_) => TableName::Entities,
            Self::Type(path) => path.terminating_table_name(),
            Self::IncomingLinks(path)
            | Self::OutgoingLinks(path)
            | Self::LeftEntity(Some(path))
            | Self::RightEntity(Some(path)) => path.terminating_table_name(),
        }
    }

    fn column_access(&self) -> ColumnAccess {
        match self {
            Self::Id => ColumnAccess::Table {
                column: "entity_id",
            },
            Self::Version => ColumnAccess::Table { column: "version" },
            Self::Archived => ColumnAccess::Table { column: "archived" },
            Self::Type(path) => path.column_access(),
            Self::OwnedById => ColumnAccess::Table {
                column: "owned_by_id",
            },
            Self::CreatedById => ColumnAccess::Table {
                column: "created_by_id",
            },
            Self::UpdatedById => ColumnAccess::Table {
                column: "updated_by_id",
            },
            Self::RemovedById => ColumnAccess::Table {
                column: "removed_by_id",
            },
            Self::LeftEntity(None) => ColumnAccess::Table {
                column: "left_entity_id",
            },
            Self::RightEntity(None) => ColumnAccess::Table {
                column: "right_entity_id",
            },
            Self::LeftEntity(Some(path))
            | Self::RightEntity(Some(path))
            | Self::IncomingLinks(path)
            | Self::OutgoingLinks(path) => path.column_access(),
            Self::LeftOrder => ColumnAccess::Table {
                column: "left_order",
            },
            Self::RightOrder => ColumnAccess::Table {
                column: "right_order",
            },
            Self::Properties(path) => path.as_ref().map_or(
                ColumnAccess::Table {
                    column: "properties",
                },
                |path| ColumnAccess::Json {
                    column: "properties",
                    field: path.as_ref(),
                },
            ),
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        if let Self::Properties(Some(field)) = self {
            Some(field)
        } else {
            None
        }
    }
}
