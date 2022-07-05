mod row_types;

use std::collections::{hash_map::Entry, HashMap};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use row_types::DataTypeRow;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    datastore::{
        postgres::row_types::PropertyTypeRow, DatabaseConnectionInfo, Datastore, DatastoreError,
    },
    types::{
        schema::{PropertyType, Uri},
        AccountId, BaseId, DataType, Identifier, Qualified, VersionId,
    },
};

/// A Postgres-backed Datastore
pub struct PostgresDatabase {
    pub pool: PgPool,
    _uuid_by_data_type: HashMap<Uri, Identifier>,
    base_id_by_property_type: HashMap<Uri, BaseId>,
    // TODO: We currently have no unique mapping betwee `Uri` and `VersionId` as versions are not
    //   yet included in the `Uri`.
    version_id_by_property_type: HashMap<Uri, VersionId>,
}

impl PostgresDatabase {
    /// Creates a new `PostgresDatabase` object.
    ///
    /// # Errors
    ///
    /// - [`DatastoreError`], if creating a [`PgPool`] connection returns an error.
    pub async fn new(db_info: &DatabaseConnectionInfo) -> Result<Self, DatastoreError> {
        Ok(Self {
            pool: PgPool::connect(&db_info.url())
                .await
                .report()
                .change_context(DatastoreError)
                .attach_printable_lazy(|| db_info.clone())?,
            _uuid_by_data_type: HashMap::new(),
            base_id_by_property_type: HashMap::new(),
            version_id_by_property_type: HashMap::new(),
        })
    }

    /// Inserts a `version_id` and `base_id` into the `ids` table in the database
    async fn insert_id(&mut self, id: &Identifier) -> Result<(), DatastoreError> {
        sqlx::query(r#"INSERT INTO ids (version_id, base_id) VALUES ($1, $2);"#)
            .bind(&id.version_id)
            .bind(&id.base_id)
            .execute(&self.pool)
            .await
            .report()
            .change_context(DatastoreError)
            .attach_printable("Could not insert id")
            .attach_printable_lazy(|| id.clone())?;

        Ok(())
    }

    /// Inserts a data type into the `data_types` table in the database
    async fn insert_data_type(
        &mut self,
        id: &Identifier,
        data_type: &DataType,
        created_by: AccountId,
    ) -> Result<(), DatastoreError> {
        sqlx::query_as::<_, (Uuid,)>(
            r#"
            INSERT INTO data_types (
                version_id,
                schema,
                created_by
            ) 
            VALUES ($1, $2, $3)
            RETURNING version_id;
            "#,
        )
        .bind(&id.version_id)
        .bind(&data_type)
        .bind(&created_by)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(DatastoreError)
        .attach_printable("Could not insert data type")?;

        Ok(())
    }

    /// Inserts a data type into the `property_types` table in the database.
    async fn insert_property_type(
        &mut self,
        id: &Identifier,
        property_type: &PropertyType,
        created_by: AccountId,
    ) -> Result<(), DatastoreError> {
        sqlx::query_as::<_, (Uuid,)>(
            r#"
            INSERT INTO property_types (
                version_id,
                schema,
                created_by
            ) 
            VALUES ($1, $2, $3)
            RETURNING version_id;
            "#,
        )
        .bind(&id.version_id)
        .bind(&serde_json::to_value(property_type).expect("Invalid property type"))
        .bind(&created_by)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(DatastoreError)
        .attach_printable("Could not insert property type")?;

        Ok(())
    }
}

#[async_trait]
impl Datastore for PostgresDatabase {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Qualified<DataType>, DatastoreError> {
        let id = Identifier::new(BaseId::new(Uuid::new_v4()), VersionId::new(Uuid::new_v4()));

        self.insert_id(&id).await?;

        self.insert_data_type(&id, &data_type, created_by).await?;

        Ok(Qualified::new(id, data_type, created_by))
    }

    async fn get_data_type(&self, id: &Identifier) -> Result<Qualified<DataType>, DatastoreError> {
        let DataTypeRow {
            schema: data_type,
            created_by,
            ..
        } = sqlx::query_as(
            r#"
            SELECT version_id, "schema", created_by
            FROM data_types
            INNER JOIN ids USING (version_id)
            WHERE version_id = $1 AND base_id = $2;
            "#,
        )
        .bind(&id.version_id)
        .bind(&id.base_id)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(DatastoreError)
        .attach_printable_lazy(|| id.clone())
        .attach_printable("Could not find data type by id")?;

        Ok(Qualified::new(id.clone(), data_type, created_by))
    }

    async fn get_data_type_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_data_type(
        &mut self,
        base_id: BaseId,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Qualified<DataType>, DatastoreError> {
        let id = Identifier::new(base_id, VersionId::new(Uuid::new_v4()));

        self.insert_id(&id).await?;

        self.insert_data_type(&id, &data_type, updated_by).await?;

        Ok(Qualified::new(id, data_type, updated_by))
    }

    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Qualified<PropertyType>, DatastoreError> {
        let base_id = match self
            .base_id_by_property_type
            .entry(property_type.id().clone())
        {
            Entry::Occupied(_) => {
                return Err(Report::new(DatastoreError)
                    .attach_printable("Property type is already registered")
                    .attach_printable(property_type.id().clone()));
            }
            Entry::Vacant(entry) => entry.insert(BaseId::new(Uuid::new_v4())),
        };

        let version_id = match self
            .version_id_by_property_type
            .entry(property_type.id().clone())
        {
            Entry::Occupied(_) => {
                return Err(Report::new(DatastoreError)
                    .attach_printable("Property type version is already registered")
                    .attach_printable(property_type.id().clone()));
            }
            // TODO: The `VersionId` is currently not stored until it's encoded in the `Uri`.
            Entry::Vacant(entry) => entry.insert(VersionId::new(Uuid::new_v4())),
            // Entry::Vacant(_) => VersionId::new(Uuid::new_v4()),
        };

        let id = Identifier::new(*base_id, *version_id);

        self.insert_id(&id).await?;

        self.insert_property_type(&id, &property_type, created_by)
            .await?;

        Ok(Qualified::new(id, property_type, created_by))
    }

    async fn get_property_type(
        &self,
        id: &Identifier,
    ) -> Result<Qualified<PropertyType>, DatastoreError> {
        let PropertyTypeRow {
            schema: property_type,
            created_by,
            ..
        } = sqlx::query_as(
            r#"
            SELECT version_id, "schema", created_by
            FROM property_types
            INNER JOIN ids USING (version_id)
            WHERE version_id = $1 AND base_id = $2;
            "#,
        )
        .bind(&id.version_id)
        .bind(&id.base_id)
        .fetch_one(&self.pool)
        .await
        .report()
        .change_context(DatastoreError)
        .attach_printable_lazy(|| id.clone())
        .attach_printable("Could not find property type by id")?;

        Ok(Qualified::new(
            id.clone(),
            serde_json::from_value(property_type).expect("Invalid property type"),
            created_by,
        ))
    }

    async fn get_property_type_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Qualified<PropertyType>, DatastoreError> {
        let base_id = self
            .base_id_by_property_type
            .get(property_type.id())
            .ok_or_else(|| {
                Report::new(DatastoreError)
                    .attach_printable("Property type is not registered")
                    .attach_printable(property_type.id().clone())
            })?;

        let version_id = match self
            .version_id_by_property_type
            .entry(property_type.id().clone())
        {
            Entry::Occupied(_) => {
                return Err(Report::new(DatastoreError)
                    .attach_printable("Property type version is already registered")
                    .attach_printable(property_type.id().clone()));
            }
            Entry::Vacant(entry) => *entry.insert(VersionId::new(Uuid::new_v4())),
        };

        let id = Identifier::new(*base_id, version_id);

        self.insert_id(&id).await?;

        self.insert_property_type(&id, &property_type, updated_by)
            .await?;

        Ok(Qualified::new(id, property_type, updated_by))
    }

    async fn create_entity_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity_type_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_entity_type() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn create_entity() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn get_entity_many() -> Result<(), DatastoreError> {
        todo!()
    }

    async fn update_entity() -> Result<(), DatastoreError> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::LazyLock;

    use super::{row_types::EntityTypeRow, *};
    use crate::{
        datastore::DatabaseType,
        types::{AccountId, DataType},
    };

    const USER: &str = "postgres";
    const PASSWORD: &str = "postgres";
    const HOST: &str = "localhost";
    const PORT: u16 = 5432;
    const DATABASE: &str = "graph";

    static DB_INFO: LazyLock<DatabaseConnectionInfo> = LazyLock::new(|| {
        DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            USER.to_owned(),
            PASSWORD.to_owned(),
            HOST.to_owned(),
            PORT,
            DATABASE.to_owned(),
        )
    });

    async fn create_account_id(pool: &PgPool) -> Result<AccountId, DatastoreError> {
        let account_id = AccountId::new(Uuid::new_v4());

        sqlx::query(r#"INSERT INTO accounts (account_id) VALUES ($1);"#)
            .bind(&account_id)
            .fetch_all(pool)
            .await
            .report()
            .change_context(DatastoreError)
            .attach_printable("Could not insert account")?;

        Ok(account_id)
    }

    // TODO - long term we likely want to gate these behind config or something, probably do not
    //  want to add a dependency on the external service for *unit* tests
    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn can_connect() -> Result<(), DatastoreError> {
        PostgresDatabase::new(&DB_INFO).await?;

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn get_entity_types() -> Result<(), DatastoreError> {
        let pool = PostgresDatabase::new(&DB_INFO).await?.pool;

        let _rows: Vec<EntityTypeRow> = sqlx::query_as("SELECT * from entity_types")
            .fetch_all(&pool)
            .await
            .report()
            .change_context(DatastoreError)
            .attach_printable("Could not select entity types")?;

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn create_data_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;

        let account_id = create_account_id(&db.pool).await?;

        db.create_data_type(
            DataType::new(serde_json::json!({"hello": "world"})),
            account_id,
        )
        .await?;

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn get_data_type_by_identifier() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;

        let account_id = create_account_id(&db.pool).await?;

        let updated_data_type = db
            .create_data_type(
                DataType::new(serde_json::json!({"hello": "world"})),
                account_id,
            )
            .await?;

        let data_type = db.get_data_type(updated_data_type.id()).await?;

        assert_eq!(data_type.inner(), updated_data_type.inner());

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn update_existing_data_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;

        let account_id = create_account_id(&db.pool).await?;

        let data_type = db
            .create_data_type(
                DataType::new(serde_json::json!({"hello": "world"})),
                account_id,
            )
            .await?;

        let updated_data_type = db
            .update_data_type(
                data_type.id().base_id,
                DataType::new(serde_json::json!({"hello": "wolrd"})),
                account_id,
            )
            .await?;

        assert_ne!(data_type.inner(), updated_data_type.inner());
        assert_ne!(data_type.id().version_id, updated_data_type.id().version_id);

        assert_eq!(data_type.id().base_id, updated_data_type.id().base_id);

        Ok(())
    }

    fn quote_property_type_v1() -> PropertyType {
        serde_json::from_value(serde_json::json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote/v/0.1.0",
          "title": "Favorite Quote",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text" }
          ]
        }))
        .expect("Invalid property type")
    }

    fn quote_property_type_v2() -> PropertyType {
        serde_json::from_value(serde_json::json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote/v/0.2.0",
          "title": "Favorite Quote",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text" }
          ]
        }))
        .expect("Invalid property type")
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn create_property_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;

        let account_id = create_account_id(&db.pool).await?;

        db.create_property_type(quote_property_type_v1(), account_id)
            .await?;

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    async fn get_property_type_by_identifier() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;

        let account_id = create_account_id(&db.pool).await?;

        let updated_property_type = db
            .create_property_type(quote_property_type_v1(), account_id)
            .await?;

        let property_type = db.get_property_type(updated_property_type.id()).await?;

        assert_eq!(property_type.inner(), updated_property_type.inner());

        Ok(())
    }

    #[tokio::test]
    #[cfg_attr(miri, ignore = "miri can't run in async context")]
    #[cfg_attr(
        not(miri),
        ignore = "unimplemented: we are currently not able to get the `VersionId` from the `Uri`, \
                  so it's not possible to update a property type"
    )]
    async fn update_existing_property_type() -> Result<(), DatastoreError> {
        let mut db = PostgresDatabase::new(&DB_INFO).await?;

        let account_id = create_account_id(&db.pool).await?;

        let property_type = db
            .create_property_type(quote_property_type_v1(), account_id)
            .await?;

        let new_property_type = quote_property_type_v2();
        let updated_property_type = db
            .update_property_type(new_property_type.clone(), account_id)
            .await?;

        assert_eq!(updated_property_type.inner(), &new_property_type);
        assert_ne!(property_type.inner(), updated_property_type.inner());
        assert_ne!(
            property_type.id().version_id,
            updated_property_type.id().version_id
        );

        assert_eq!(
            property_type.id().base_id,
            updated_property_type.id().base_id
        );

        Ok(())
    }
}
