mod read;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    knowledge::{Link, LinkStatus},
    ontology::AccountId,
    store::{error::LinkActivationError, AsClient, InsertionError, LinkStore, PostgresStore},
};

#[async_trait]
impl<C: AsClient> LinkStore for PostgresStore<C> {
    async fn create_link(
        &mut self,
        link: &Link,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        let link_type_version_id = self
            .version_id_by_uri(link.link_type_uri())
            .await
            .change_context(InsertionError)
            .attach_printable(link.source_entity())?;

        self.as_client()
            .query_one(
                r#"
                    INSERT INTO links (source_entity_id, target_entity_id, link_type_version_id, link_order, created_by)
                    VALUES ($1, $2, $3, null, $4)
                    RETURNING source_entity_id, target_entity_id, link_type_version_id;
                "#,
                &[&link.source_entity(), &link.target_entity(), &link_type_version_id, &created_by],
            )
            .await
            .into_report()
            .change_context(InsertionError)
            .attach_printable(created_by)
            .attach_lazy(|| link.clone())?;

        Ok(())
    }

    async fn inactivate_link(&mut self, link: &Link) -> Result<(), LinkActivationError> {
        let link_type_version_id = self
            .version_id_by_uri(link.link_type_uri())
            .await
            .change_context(InsertionError)
            .attach_printable(link.source_entity())
            .change_context(LinkActivationError)?;

        self.update_link_status(
            LinkStatus::Inactive,
            link.source_entity(),
            link.target_entity(),
            link_type_version_id,
        )
        .await
        .attach_printable_lazy(|| link.clone())?;

        Ok(())
    }
}
