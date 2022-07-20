mod data_type;
mod entity_type;
mod link_type;
mod property_type;

use std::thread;

use error_stack::Result;
use graph::{
    ontology::{
        types::{uri::BaseUri, DataType, EntityType, LinkType, PropertyType, Qualified},
        AccountId, VersionId,
    },
    store::{
        DatabaseConnectionInfo, DatabaseType, InsertionError, PostgresDatabase, QueryError, Store,
        UpdateError,
    },
};
use sqlx::{Connection, Executor, PgConnection};
use tokio::runtime::Runtime;
use uuid::Uuid;

pub struct DatabaseTestWrapper {
    postgres: PostgresDatabase,
    created_base_uris: Vec<BaseUri>,
    account_id: AccountId,
    // `PostgresDatabase` does not expose functionality to remove entries, so a direct connection
    // to the database is used.
    connection: Option<PgConnection>,
    // We need a runtime in the `Drop` implementation, so the test wrapper uses it's own runtime.
    // This implies, tests must not be `async`, so the functions on this struct needs to be
    // non-`async`.
    rt: Runtime,
}

impl DatabaseTestWrapper {
    pub fn new() -> Self {
        const USER: &str = "postgres";
        const PASSWORD: &str = "postgres";
        const HOST: &str = "localhost";
        const PORT: u16 = 5432;
        const DATABASE: &str = "graph";

        let connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            USER.to_owned(),
            PASSWORD.to_owned(),
            HOST.to_owned(),
            PORT,
            DATABASE.to_owned(),
        );

        let rt = Runtime::new().expect("Could not create a test runtime");
        let (postgres, connection, account_id) = rt.block_on(async {
            let postgres = PostgresDatabase::new(&connection_info)
                .await
                .expect("could not connect to database");

            let mut connection = PgConnection::connect(&connection_info.url())
                .await
                .expect("could not connect to database");

            let account_id = create_account_id(&mut connection).await;

            (postgres, connection, account_id)
        });

        Self {
            postgres,
            created_base_uris: Vec::new(),
            account_id,
            connection: Some(connection),
            rt,
        }
    }

    pub fn seed<D, P, L, E>(
        &mut self,
        data_types: D,
        property_types: P,
        link_types: L,
        entity_types: E,
    ) -> Result<(), InsertionError>
    where
        D: IntoIterator<Item = &'static str>,
        P: IntoIterator<Item = &'static str>,
        L: IntoIterator<Item = &'static str>,
        E: IntoIterator<Item = &'static str>,
    {
        for data_type in data_types {
            self.create_data_type(
                serde_json::from_str(data_type).expect("could not parse data type"),
            )?;
        }

        for property_type in property_types {
            self.create_property_type(
                serde_json::from_str(property_type).expect("could not parse data type"),
            )?;
        }

        // Insert link types before entity types so entity types can refer to them
        for link_type in link_types {
            self.create_link_type(
                serde_json::from_str(link_type).expect("could not parse link type"),
            )?;
        }

        for entity_type in entity_types {
            self.create_entity_type(
                serde_json::from_str(entity_type).expect("could not parse entity type"),
            )?;
        }
        Ok(())
    }

    pub fn create_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<Qualified<DataType>, InsertionError> {
        self.rt.block_on(async {
            let data_type = self
                .postgres
                .create_data_type(data_type, self.account_id)
                .await?;
            self.created_base_uris
                .push(data_type.inner().id().base_uri().clone());
            Ok(data_type)
        })
    }

    pub fn get_data_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Qualified<DataType>, QueryError> {
        self.rt
            .block_on(async { self.postgres.get_data_type(version_id).await })
    }

    pub fn update_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<Qualified<DataType>, UpdateError> {
        self.rt.block_on(async {
            self.postgres
                .update_data_type(data_type, self.account_id)
                .await
        })
    }

    pub fn create_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<Qualified<PropertyType>, InsertionError> {
        self.rt.block_on(async {
            let property_type = self
                .postgres
                .create_property_type(property_type, self.account_id)
                .await?;
            self.created_base_uris
                .push(property_type.inner().id().base_uri().clone());
            Ok(property_type)
        })
    }

    pub fn get_property_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Qualified<PropertyType>, QueryError> {
        self.rt
            .block_on(async { self.postgres.get_property_type(version_id).await })
    }

    pub fn update_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<Qualified<PropertyType>, UpdateError> {
        self.rt.block_on(async {
            self.postgres
                .update_property_type(property_type, self.account_id)
                .await
        })
    }

    pub fn create_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<Qualified<EntityType>, InsertionError> {
        self.rt.block_on(async {
            let entity_type = self
                .postgres
                .create_entity_type(entity_type, self.account_id)
                .await?;
            self.created_base_uris
                .push(entity_type.inner().id().base_uri().clone());
            Ok(entity_type)
        })
    }

    pub fn get_entity_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Qualified<EntityType>, QueryError> {
        self.rt
            .block_on(async { self.postgres.get_entity_type(version_id).await })
    }

    pub fn update_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<Qualified<EntityType>, UpdateError> {
        self.rt.block_on(async {
            self.postgres
                .update_entity_type(entity_type, self.account_id)
                .await
        })
    }

    pub fn create_link_type(
        &mut self,
        link_type: LinkType,
    ) -> Result<Qualified<LinkType>, InsertionError> {
        self.rt.block_on(async {
            let link_type = self
                .postgres
                .create_link_type(link_type, self.account_id)
                .await?;
            self.created_base_uris
                .push(link_type.inner().id().base_uri().clone());
            Ok(link_type)
        })
    }

    pub fn get_link_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Qualified<LinkType>, QueryError> {
        self.rt
            .block_on(async { self.postgres.get_link_type(version_id).await })
    }

    pub fn update_link_type(
        &mut self,
        link_type: LinkType,
    ) -> Result<Qualified<LinkType>, UpdateError> {
        self.rt.block_on(async {
            self.postgres
                .update_link_type(link_type, self.account_id)
                .await
        })
    }
}

impl Drop for DatabaseTestWrapper {
    fn drop(&mut self) {
        let mut connection = self.connection.take().unwrap();
        let account_id = self.account_id;
        let created_base_uris = self.created_base_uris.clone();

        self.rt.block_on(async move {
            for base_uri in created_base_uris {
                remove_by_base_uri(&mut connection, &base_uri).await;
            }
            remove_account_id(&mut connection, account_id).await;
        });
    }
}

async fn create_account_id(connection: &mut PgConnection) -> AccountId {
    let account_id = AccountId::new(Uuid::new_v4());
    sqlx::query(r#"INSERT INTO accounts (account_id) VALUES ($1);"#)
        .bind(account_id)
        .fetch_all(connection)
        .await
        .expect("could not insert account id");
    account_id
}

async fn remove_account_id(connection: &mut PgConnection, account_id: AccountId) {
    sqlx::query(r#"DELETE FROM accounts WHERE account_id = $1;"#)
        .bind(account_id)
        .execute(connection)
        .await
        .expect("could not remove account id");
}

async fn remove_by_base_uri(connection: &mut PgConnection, base_uri: &BaseUri) {
    let result = connection
        .execute(
            sqlx::query(
                r#"
        DELETE FROM version_ids 
        USING ids 
        WHERE ids.version_id = version_ids.version_id AND base_uri = $1;"#,
            )
            .bind(base_uri),
        )
        .await;

    if let Err(result) = result {
        if thread::panicking() {
            eprintln!("could not remove version_id for base uri: {result:?}")
        } else {
            panic!("could not remove version_id for base uri: {result:?}")
        }
    }

    let result = connection
        .execute(
            sqlx::query(
                r#"
        DELETE FROM base_uris 
        WHERE base_uri = $1;"#,
            )
            .bind(base_uri),
        )
        .await;

    if let Err(result) = result {
        if thread::panicking() {
            eprintln!("could not remove base_uri: {result:?}")
        } else {
            panic!("could not remove base_uri: {result:?}")
        }
    }
}

#[test]
fn can_connect() {
    DatabaseTestWrapper::new();
}
