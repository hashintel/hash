use std::{error::Error, fmt, iter::repeat};

use error_stack::{Report, ResultExt};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::{
    backend::{
        spicedb::model, CheckError, CheckResponse, CreateRelationError, CreateRelationResponse,
        DeleteRelationError, DeleteRelationResponse, ExportSchemaError, ExportSchemaResponse,
        ImportSchemaError, ImportSchemaResponse, SpiceDbOpenApi, ZanzibarBackend,
    },
    zanzibar::{Consistency, Tuple, UntypedTuple, Zookie},
};

#[derive(Debug, Serialize, Deserialize)]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "Used for serializing and deserializing an empty object `{}`"
)]
pub struct Empty {}

#[derive(Debug)]
enum InvocationError {
    Request(reqwest::Error),
    Rpc(model::RpcStatus),
}

impl fmt::Display for InvocationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Request(error) => fmt::Display::fmt(error, fmt),
            Self::Rpc(status) => write!(fmt, "Error {}: {}", status.code, status.message),
        }
    }
}

impl From<reqwest::Error> for InvocationError {
    fn from(error: reqwest::Error) -> Self {
        Self::Request(error)
    }
}

impl Error for InvocationError {}

impl SpiceDbOpenApi {
    async fn call<R: DeserializeOwned>(
        &self,
        path: &'static str,
        body: &(impl Serialize + Sync),
    ) -> Result<R, InvocationError> {
        let result = self
            .client
            .execute(
                self.client
                    .post(format!("{}{}", self.base_path, path))
                    .json(&body)
                    .build()?,
            )
            .await?;

        if result.status().is_success() {
            Ok(result.json().await?)
        } else {
            Err(InvocationError::Rpc(result.json().await?))
        }
    }

    // TODO: Expose batch-version
    //   see https://linear.app/hash/issue/H-642
    async fn modify_relations<T>(
        &self,
        operations: impl IntoIterator<Item = (model::RelationshipUpdateOperation, T), IntoIter: Send>
        + Send,
    ) -> Result<Zookie<'static>, InvocationError>
    where
        T: Tuple + Send + Sync,
    {
        #[derive(Serialize)]
        #[serde(bound = "T: Tuple")]
        struct RelationshipUpdate<T> {
            operation: model::RelationshipUpdateOperation,
            relationship: model::Relationship<T>,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase", bound = "T: Tuple")]
        struct RequestBody<T> {
            updates: Vec<RelationshipUpdate<T>>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            written_at: model::ZedToken,
        }

        let response = self
            .call::<RequestResponse>(
                "/v1/relationships/write",
                &RequestBody {
                    updates: operations
                        .into_iter()
                        .map(|(operation, tuple)| RelationshipUpdate::<T> {
                            operation,
                            relationship: model::Relationship(tuple),
                        })
                        .collect(),
                },
            )
            .await?;

        Ok(response.written_at.into())
    }
}

impl ZanzibarBackend for SpiceDbOpenApi {
    async fn import_schema(
        &mut self,
        schema: &str,
    ) -> Result<ImportSchemaResponse, Report<ImportSchemaError>> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            written_at: model::ZedToken,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestBody<'a> {
            schema: &'a str,
        }

        let response = self
            .call::<RequestResponse>("/v1/schema/write", &RequestBody { schema })
            .await
            .change_context(ImportSchemaError)?;

        Ok(ImportSchemaResponse {
            written_at: response.written_at.into(),
        })
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn export_schema(&self) -> Result<ExportSchemaResponse, Report<ExportSchemaError>> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            schema_text: String,
            read_at: model::ZedToken,
        }

        let response = self
            .call::<RequestResponse>("/v1/schema/read", &Empty {})
            .await
            .change_context(ExportSchemaError)?;

        Ok(ExportSchemaResponse {
            schema: response.schema_text,
            read_at: response.read_at.into(),
        })
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn create_relations<T>(
        &mut self,
        tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Send + Sync,
    {
        self.modify_relations(repeat(model::RelationshipUpdateOperation::Create).zip(tuples))
            .await
            .map(|written_at| CreateRelationResponse { written_at })
            .change_context(CreateRelationError)
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn delete_relations<T>(
        &mut self,
        tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Tuple + Send + Sync,
    {
        self.modify_relations(repeat(model::RelationshipUpdateOperation::Delete).zip(tuples))
            .await
            .map(|deleted_at| DeleteRelationResponse { deleted_at })
            .change_context(DeleteRelationError)
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn check<T>(
        &self,
        tuple: &T,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        T: Tuple + Sync,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase", bound = "")]
        struct RequestBody<'t, T: Tuple> {
            consistency: model::Consistency<'t>,
            resource: model::ObjectReference<'t, T>,
            permission: model::RelationReference<'t, T>,
            subject: model::SubjectReference<'t, T>,
        }

        #[derive(Deserialize)]
        enum Permissionship {
            #[serde(rename = "PERMISSIONSHIP_NO_PERMISSION")]
            NoPermission,
            #[serde(rename = "PERMISSIONSHIP_HAS_PERMISSION")]
            HasPermission,
            #[serde(rename = "PERMISSIONSHIP_CONDITIONAL_PERMISSION")]
            Conditional,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            checked_at: model::ZedToken,
            permissionship: Permissionship,
        }

        let request = RequestBody {
            consistency: consistency.into(),
            resource: model::ObjectReference(tuple),
            permission: model::RelationReference(tuple),
            subject: model::SubjectReference(tuple),
        };

        let response: RequestResponse = self
            .call("/v1/permissions/check", &request)
            .await
            .change_context_lazy(|| CheckError {
                tuple: UntypedTuple::from_tuple(tuple).into_owned(),
            })?;

        let has_permission = match response.permissionship {
            Permissionship::HasPermission => true,
            Permissionship::NoPermission => false,
            Permissionship::Conditional => {
                unimplemented!("https://linear.app/hash/issue/H-614")
            }
        };

        Ok(CheckResponse {
            checked_at: response.checked_at.token,
            has_permission,
        })
    }
}
