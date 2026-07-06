use core::{fmt, fmt::Formatter};

use postgres_types::ToSql;

use crate::store::postgres::query::{
    PostgresType, TableName, Transpile, rows::PostgresRow, table::DatabaseColumn,
};

/// Conflict handling for a bulk [`InsertStatement`].
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub enum OnConflict {
    /// Fail the statement when a row conflicts with an existing one.
    #[default]
    Error,
    /// Skip conflicting rows.
    DoNothing,
}

/// Options for compiling a bulk [`InsertStatement`].
#[derive(Debug, Clone, Default)]
pub struct InsertStatementOptions {
    /// Insert into this table instead of the rows' own table.
    pub table_name: Option<TableName<'static>>,
    /// Deduplicate the unnested rows with `SELECT DISTINCT`.
    pub distinct: bool,
    /// How to handle rows conflicting with existing ones.
    pub on_conflict: OnConflict,
}

/// A bulk `INSERT` statement reading its rows from `unnest`ed parallel array parameters.
///
/// See `PostgresRow` for why parallel arrays are used instead of the table's composite
/// row type.
#[derive(Debug)]
pub struct InsertStatement {
    pub table: TableName<'static>,
    pub columns: Vec<String>,
    pub casts: Vec<PostgresType>,
    pub distinct: bool,
    pub on_conflict: OnConflict,
}

impl InsertStatement {
    /// Compiles the insert statement for `rows` along with its parameters.
    ///
    /// Column names, `unnest` casts, and parameters are all derived from the same
    /// column-parameter pairs, so they cannot fall out of order.
    #[must_use]
    pub fn compile_rows<'r, R: PostgresRow>(
        rows: &'r [R],
    ) -> (String, Vec<Box<dyn ToSql + Send + Sync + 'r>>) {
        Self::compile_rows_with(rows, InsertStatementOptions::default())
    }

    /// Compiles the insert statement for `rows` with explicit [`InsertStatementOptions`].
    #[must_use]
    pub fn compile_rows_with<'r, R: PostgresRow>(
        rows: &'r [R],
        options: InsertStatementOptions,
    ) -> (String, Vec<Box<dyn ToSql + Send + Sync + 'r>>) {
        let (columns, parameters): (Vec<_>, Vec<_>) =
            R::columnar_parameters(rows).into_iter().unzip();

        let statement = Self {
            table: options.table_name.unwrap_or_else(R::table),
            columns: columns
                .iter()
                .map(|column| column.as_str().to_owned())
                .collect(),
            casts: columns.iter().map(DatabaseColumn::postgres_type).collect(),
            distinct: options.distinct,
            on_conflict: options.on_conflict,
        };

        (statement.transpile_to_string(), parameters)
    }
}

impl Transpile for InsertStatement {
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result {
        fmt.write_str("INSERT INTO ")?;
        self.table.transpile(fmt)?;
        fmt.write_str(" (")?;
        for (index, column) in self.columns.iter().enumerate() {
            if index > 0 {
                fmt.write_str(", ")?;
            }
            write!(fmt, r#""{column}""#)?;
        }
        fmt.write_str(") SELECT ")?;
        if self.distinct {
            fmt.write_str("DISTINCT ")?;
        }
        fmt.write_str("* FROM UNNEST(")?;
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
            OnConflict::DoNothing => fmt.write_str(" ON CONFLICT DO NOTHING")?,
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
            trim_whitespace(&InsertStatement::compile_rows::<EntityIdRow>(&[]).0),
            r#"INSERT INTO "entity_ids" ("web_id", "entity_uuid", "provenance", "read_only") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::jsonb[]), ($4::bool[]))"#
        );
    }

    #[test]
    fn transpile_entity_edge_rows() {
        assert_eq!(
            trim_whitespace(&InsertStatement::compile_rows::<EntityEdgeRow>(&[]).0),
            r#"INSERT INTO "entity_edge" ("source_web_id", "source_entity_uuid", "target_web_id", "target_entity_uuid", "confidence", "provenance", "kind", "direction") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::uuid[]), ($4::uuid[]), ($5::float8[]), ($6::jsonb[]), ($7::entity_edge_kind[]), ($8::edge_direction[]))"#
        );
    }

    #[test]
    fn transpile_entity_temporal_metadata_rows() {
        assert_eq!(
            trim_whitespace(&InsertStatement::compile_rows::<EntityTemporalMetadataRow>(&[]).0),
            r#"INSERT INTO "entity_temporal_metadata" ("web_id", "entity_uuid", "draft_id", "entity_edition_id", "decision_time", "transaction_time") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::uuid[]), ($4::uuid[]), ($5::tstzrange[]), ($6::tstzrange[]))"#
        );
    }

    #[test]
    fn transpile_snapshot_options() {
        assert_eq!(
            trim_whitespace(
                &InsertStatement::compile_rows_with::<EntityIdRow>(
                    &[],
                    InsertStatementOptions {
                        table_name: Some(TableName::from("entity_ids_tmp")),
                        distinct: true,
                        on_conflict: OnConflict::DoNothing,
                    }
                )
                .0
            ),
            r#"INSERT INTO "entity_ids_tmp" ("web_id", "entity_uuid", "provenance", "read_only") SELECT DISTINCT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::jsonb[]), ($4::bool[])) ON CONFLICT DO NOTHING"#
        );
    }
}
