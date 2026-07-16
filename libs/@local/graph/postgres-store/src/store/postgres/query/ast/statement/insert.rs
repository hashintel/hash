use core::{fmt, fmt::Formatter};
use std::collections::HashSet;

use postgres_types::ToSql;

use crate::store::postgres::query::{
    ColumnName, PostgresType, TableName, Transpile, rows::PostgresRow, table::DatabaseColumn as _,
};

/// Conflict handling for a bulk insert.
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub enum OnConflict {
    /// Fail the statement when a row conflicts with an existing one.
    #[default]
    Error,
    /// Skip conflicting rows.
    DoNothing,
}

/// A bulk `INSERT` reading its rows from `unnest`ed parallel array parameters, transpiling
/// to `INSERT INTO … SELECT * FROM UNNEST(…)`.
///
/// Only built by [`bulk_insert`] — the row type supplies the table and columns.
/// See `PostgresRow` for why parallel arrays are used instead of the table's composite
/// row type.
#[derive(Debug)]
struct BulkInsertStatement {
    table: TableName<'static>,
    columns: Vec<ColumnName<'static>>,
    casts: Vec<PostgresType>,
    distinct: bool,
    on_conflict: OnConflict,
}

/// Compiles a bulk `INSERT` statement for `rows` along with its parameters.
///
/// Column names, `unnest` casts, and parameters are all derived from the same
/// column-parameter pairs, so they cannot fall out of order.
#[bon::builder(finish_fn = compile)]
pub fn bulk_insert<'rows, R: PostgresRow>(
    /// Rows to transpose into the statement's parallel array parameters.
    rows: &'rows [R],
    /// Target of the outer `INSERT INTO`, replacing the rows' own table.
    table_name: Option<TableName<'static>>,
    /// Deduplicate the unnested rows in the inner subquery with `SELECT DISTINCT`.
    #[builder(default)]
    distinct: bool,
    /// How the outer `INSERT` handles rows conflicting with existing ones.
    #[builder(default)]
    on_conflict: OnConflict,
) -> (String, Vec<Box<dyn ToSql + Send + Sync + 'rows>>) {
    let ((columns, casts), parameters): ((Vec<_>, Vec<_>), Vec<_>) = R::columnar_parameters(rows)
        .into_iter()
        .map(|(column, parameters)| {
            let name = column.name();
            debug_assert_eq!(
                parameters.len(),
                rows.len(),
                "column `{}` must contain one element per row",
                name.as_str()
            );
            ((name, column.postgres_type()), parameters.into_values())
        })
        .collect();

    debug_assert!(
        columns.iter().collect::<HashSet<_>>().len() == columns.len(),
        "bulk-insert columns must be unique"
    );
    debug_assert!(
        !casts
            .iter()
            .any(|cast| matches!(cast, PostgresType::Array(_))),
        "array-typed columns cannot be bulk-inserted: `unnest` expands arrays across all \
         dimensions, losing the row boundaries"
    );

    let statement = BulkInsertStatement {
        table: table_name.unwrap_or_else(R::table),
        columns,
        casts,
        distinct,
        on_conflict,
    };

    (statement.transpile_to_string(), parameters)
}

impl Transpile for BulkInsertStatement {
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result {
        fmt.write_str("INSERT INTO ")?;
        self.table.transpile(fmt)?;
        fmt.write_str(" (")?;
        for (index, column) in self.columns.iter().enumerate() {
            if index > 0 {
                fmt.write_str(", ")?;
            }
            column.transpile(fmt)?;
        }
        fmt.write_str(")\nSELECT ")?;
        if self.distinct {
            fmt.write_str("DISTINCT ")?;
        }
        fmt.write_str("*\nFROM UNNEST(")?;
        for (index, cast) in self.casts.iter().enumerate() {
            if index > 0 {
                fmt.write_str(", ")?;
            }
            write!(fmt, "(${}::", index + 1)?;
            cast.transpile(fmt)?;
            fmt.write_str("[])")?;
        }
        fmt.write_str(")")?;
        match self.on_conflict {
            OnConflict::Error => {}
            OnConflict::DoNothing => fmt.write_str("\nON CONFLICT DO NOTHING")?,
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        rows::{EntityEdgeRow, EntityIdRow, EntityTemporalMetadataRow},
        test_helper::trim_whitespace,
    };

    #[test]
    fn transpile_entity_id_rows() {
        assert_eq!(
            trim_whitespace(&bulk_insert::<EntityIdRow>().rows(&[]).compile().0),
            r#"INSERT INTO "entity_ids" ("web_id", "entity_uuid", "provenance", "read_only", "created_by_id", "created_at_transaction_time", "created_at_decision_time") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::jsonb[]), ($4::bool[]), ($5::uuid[]), ($6::timestamptz[]), ($7::timestamptz[]))"#
        );
    }

    #[test]
    fn transpile_entity_edge_rows() {
        assert_eq!(
            trim_whitespace(&bulk_insert::<EntityEdgeRow>().rows(&[]).compile().0),
            r#"INSERT INTO "entity_edge" ("source_web_id", "source_entity_uuid", "target_web_id", "target_entity_uuid", "confidence", "provenance", "kind", "direction") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::uuid[]), ($4::uuid[]), ($5::float8[]), ($6::jsonb[]), ($7::entity_edge_kind[]), ($8::edge_direction[]))"#
        );
    }

    #[test]
    fn transpile_entity_temporal_metadata_rows() {
        assert_eq!(
            trim_whitespace(
                &bulk_insert::<EntityTemporalMetadataRow>()
                    .rows(&[])
                    .compile()
                    .0
            ),
            r#"INSERT INTO "entity_temporal_metadata" ("web_id", "entity_uuid", "draft_id", "entity_edition_id", "decision_time", "transaction_time") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::uuid[]), ($4::uuid[]), ($5::tstzrange[]), ($6::tstzrange[]))"#
        );
    }

    #[test]
    fn transpile_snapshot_options() {
        assert_eq!(
            trim_whitespace(
                &bulk_insert::<EntityIdRow>()
                    .rows(&[])
                    .table_name(TableName::from("entity_ids_tmp"))
                    .distinct(true)
                    .on_conflict(OnConflict::DoNothing)
                    .compile()
                    .0
            ),
            r#"INSERT INTO "entity_ids_tmp" ("web_id", "entity_uuid", "provenance", "read_only", "created_by_id", "created_at_transaction_time", "created_at_decision_time") SELECT DISTINCT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::jsonb[]), ($4::bool[]), ($5::uuid[]), ($6::timestamptz[]), ($7::timestamptz[])) ON CONFLICT DO NOTHING"#
        );
    }
}
