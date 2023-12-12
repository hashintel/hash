mod data_type;
mod entity_type;
mod ontology_id;
mod property_type;
mod read;

use error_stack::{Result, ResultExt};
use graph_types::ontology::OntologyType;
use tokio_postgres::Transaction;
use type_system::{DataType, EntityType, PropertyType};

pub use self::ontology_id::OntologyId;
use crate::store::{error::DeletionError, AsClient, PostgresStore};

/// Provides an abstraction over elements of the Type System stored in the Database.
///
/// [`PostgresDatabase`]: crate::store::PostgresDatabase
pub trait OntologyDatabaseType: OntologyType {
    /// Returns the name of the table where this type is stored.
    fn table() -> &'static str;
}

impl OntologyDatabaseType for DataType {
    fn table() -> &'static str {
        "data_types"
    }
}

impl OntologyDatabaseType for PropertyType {
    fn table() -> &'static str {
        "property_types"
    }
}

impl OntologyDatabaseType for EntityType {
    fn table() -> &'static str {
        "entity_types"
    }
}

impl PostgresStore<Transaction<'_>> {
    #[tracing::instrument(level = "trace", skip(self))]
    pub async fn delete_ontology_ids(
        &self,
        ontology_ids: &[OntologyId],
    ) -> Result<(), DeletionError> {
        self.as_client()
            .query(
                "
                    DELETE FROM ontology_owned_metadata
                    WHERE ontology_id = ANY($1)
                ",
                &[&ontology_ids],
            )
            .await
            .change_context(DeletionError)?;

        self.as_client()
            .query(
                "
                    DELETE FROM ontology_external_metadata
                    WHERE ontology_id = ANY($1)
                ",
                &[&ontology_ids],
            )
            .await
            .change_context(DeletionError)?;

        self.as_client()
            .query(
                "
                    DELETE FROM ontology_temporal_metadata
                    WHERE ontology_id = ANY($1)
                ",
                &[&ontology_ids],
            )
            .await
            .change_context(DeletionError)?;

        let base_urls = self
            .as_client()
            .query(
                "
                    DELETE FROM ontology_ids
                    WHERE ontology_id = ANY($1)
                    RETURNING base_url
                ",
                &[&ontology_ids],
            )
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<String>>();

        self.as_client()
            .query(
                "
                    DELETE FROM base_urls
                    WHERE base_url = ANY($1)
                ",
                &[&base_urls],
            )
            .await
            .change_context(DeletionError)?;

        Ok(())
    }
}
