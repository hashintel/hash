// From `engine/src/workspace/connection/staging.rs:1-7`
use duckdb::params_from_iter;
use error_stack::{Report, ResultExt as _};

use super::Connection;
use crate::{
    AssertionFailure, PreparationError, TableAssertions, pipeline::StagingRequest, sql::Identifier,
};

// From `engine/src/workspace/connection/staging.rs:67-114`
    /// Adds snapshot metadata to source rows and checks their declared constraints.
    #[tracing::instrument(level = "debug", skip_all)]
    pub(super) fn stage_table(
        &self,
        request: &StagingRequest,
    ) -> Result<u64, Report<PreparationError>> {
        let sql = self.pipeline_sql(&request.sql)?;
        let schema = self.describe(&sql)?;
        for (column, _) in &schema {
            if ["_op", "_key", "_content_hash"]
                .iter()
                .any(|reserved| column.eq_ignore_ascii_case(reserved))
            {
                return Err(Report::new(PreparationError::ReservedColumn {
                    column: column.clone().into_boxed_str(),
                }));
            }
        }
        for column in request.primary_key.columns() {
            if !schema
                .iter()
                .any(|(name, _)| name.eq_ignore_ascii_case(column.as_ref()))
            {
                return Err(Report::new(PreparationError::MissingColumn {
                    column: column.to_string().into_boxed_str(),
                }));
            }
        }
        let keys = request
            .primary_key
            .columns()
            .iter()
            .map(|column| {
                let column = Identifier::new(column.as_ref());
                format!("{column} := {column}")
            })
            .collect::<Vec<_>>()
            .join(", ");
        self.create_table(
            &request.table,
            &format!(
                "SELECT 'snapshot' AS _op, to_json(struct_pack({keys}))::VARCHAR AS _key, \
                 source.* FROM ({sql}) AS source"
            ),
        )
        .change_context(PreparationError::Statement)?;
        self.check_assertions(&request.table, &request.assertions)
    }

// From `engine/src/pipeline/mod.rs:52-53`
    #[display("source column `{column}` is reserved for staging metadata")]
    ReservedColumn { column: Box<str> },
