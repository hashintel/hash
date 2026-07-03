use core::{fmt, fmt::Formatter};

use postgres_types::ToSql;

use crate::store::postgres::query::{
    Expression, Function, SelectExpression, SelectStatement, Table, Transpile,
    expression::{FromItem, PostgresType},
    rows::PostgresRow,
    table::{DatabaseColumn as _, InsertableColumn as _},
};

/// A bulk `INSERT` statement reading its rows from `unnest`ed parallel array parameters.
///
/// See [`PostgresRow`] for why parallel arrays are used instead of the table's composite
/// row type.
#[derive(Debug, PartialEq)]
pub struct InsertStatement {
    pub table: Table,
    pub columns: Vec<&'static str>,
    pub select: SelectStatement,
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
        let (columns, parameters): (Vec<_>, Vec<_>) =
            R::columnar_parameters(rows).into_iter().unzip();

        let statement = Self {
            table: R::TABLE,
            columns: columns.iter().map(|column| column.as_str()).collect(),
            select: SelectStatement::builder()
                .selects(vec![SelectExpression::Asterisk(None)])
                .from(FromItem::function(Function::Unnest(
                    columns
                        .iter()
                        .enumerate()
                        .map(|(index, column)| {
                            Expression::Cast(
                                Box::new(Expression::Parameter(index + 1)),
                                PostgresType::Array(Box::new(column.postgres_type())),
                            )
                        })
                        .collect(),
                )))
                .build(),
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
        fmt.write_str(") ")?;
        self.select.transpile(fmt)
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
            r#"INSERT INTO "entity_ids" ("web_id", "entity_uuid", "provenance", "read_only") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::jsonb[]), ($4::boolean[]))"#
        );
    }

    #[test]
    fn transpile_entity_edge_rows() {
        assert_eq!(
            trim_whitespace(&InsertStatement::compile_rows::<EntityEdgeRow>(&[]).0),
            r#"INSERT INTO "entity_edge" ("source_web_id", "source_entity_uuid", "target_web_id", "target_entity_uuid", "confidence", "provenance", "kind", "direction") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::uuid[]), ($4::uuid[]), ($5::double precision[]), ($6::jsonb[]), ($7::entity_edge_kind[]), ($8::edge_direction[]))"#
        );
    }

    #[test]
    fn transpile_entity_temporal_metadata_rows() {
        assert_eq!(
            trim_whitespace(&InsertStatement::compile_rows::<EntityTemporalMetadataRow>(&[]).0),
            r#"INSERT INTO "entity_temporal_metadata" ("web_id", "entity_uuid", "draft_id", "entity_edition_id", "decision_time", "transaction_time") SELECT * FROM UNNEST(($1::uuid[]), ($2::uuid[]), ($3::uuid[]), ($4::uuid[]), ($5::tstzrange[]), ($6::tstzrange[]))"#
        );
    }
}
