use async_trait::async_trait;
use error_stack::{bail, Report, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};

use crate::{
    knowledge::PersistedEntity,
    store::{
        crud,
        postgres::context::PostgresContext,
        query::{Expression, ExpressionError, Literal},
        AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<PersistedEntity> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        query: &Self::Query<'query>,
    ) -> Result<Vec<PersistedEntity>, QueryError> {
        // TODO: We need to work around collecting all records before filtering
        //   related: https://app.asana.com/0/1202805690238892/1202923536131158/f
        stream::iter(self.read_all_entities().await?.collect::<Vec<_>>().await)
            .try_filter_map(|record| async move {
                if let Literal::Bool(result) = query
                    .evaluate(&record, self)
                    .await
                    .change_context(QueryError)?
                {
                    Ok(result.then(|| {
                        PersistedEntity::new(
                            record.entity,
                            record.id,
                            record.version,
                            record.entity_type_id,
                            record.account_id,
                        )
                    }))
                } else {
                    bail!(
                        Report::new(ExpressionError)
                            .attach_printable("does not result in a boolean value")
                            .change_context(QueryError)
                    );
                }
            })
            .try_collect()
            .await
    }
}
