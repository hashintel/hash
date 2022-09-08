use async_trait::async_trait;
use error_stack::{bail, Report, Result, ResultExt};
use futures::TryStreamExt;

use crate::{
    knowledge::Link,
    store::{
        crud,
        postgres::context::PostgresContext,
        query::{Expression, ExpressionError, Literal},
        AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<Link> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<Link>, QueryError> {
        self.read_all_links()
            .await?
            .try_filter_map(|record| async move {
                if let Literal::Bool(result) = query
                    .evaluate(&record, self)
                    .await
                    .change_context(QueryError)?
                {
                    Ok(result.then(|| {
                        Link::new(
                            record.source_entity_id,
                            record.target_entity_id,
                            record.type_uri,
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
