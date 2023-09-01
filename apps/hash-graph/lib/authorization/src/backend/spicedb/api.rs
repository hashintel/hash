use std::{error::Error, fmt};

use error_stack::{ensure, Report, ResultExt};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::{
    backend::{
        spicedb::model, AuthorizationApi, CheckError, CheckResponse, CreateRelationError,
        CreateRelationResponse, DeleteRelationError, DeleteRelationResponse, DeleteRelationsError,
        DeleteRelationsResponse, ExportSchemaError, ExportSchemaResponse, ImportSchemaError,
        ImportSchemaResponse, Precondition, RelationFilter, SpiceDb,
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

impl SpiceDb {
    async fn call<R: DeserializeOwned>(
        &self,
        path: &'static str,
        body: &(impl Serialize + Sync),
    ) -> Result<R, InvocationError> {
        let result = self
            .configuration
            .client
            .execute(
                self.configuration
                    .client
                    .post(format!("{}{}", self.configuration.base_path, path))
                    .header(
                        "Authorization",
                        format!("Bearer {}", self.configuration.key),
                    )
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
    async fn modify_relationship<'p, 't, T>(
        &self,
        operation: model::RelationshipUpdateOperation,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p>, IntoIter: Send> + Send + 'p,
    ) -> Result<Zookie<'static>, InvocationError>
    where
        T: Tuple + Send + Sync + 't,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct RelationshipUpdate<'a> {
            operation: model::RelationshipUpdateOperation,
            relationship: model::Relationship<'a>,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestBody<'a> {
            updates: Vec<RelationshipUpdate<'a>>,
            #[serde(skip_serializing_if = "Vec::is_empty")]
            optional_preconditions: Vec<model::Precondition<'a>>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            written_at: model::ZedToken,
        }

        let response = self
            .call::<RequestResponse>("/v1/relationships/write", &RequestBody {
                updates: tuples
                    .into_iter()
                    .map(|tuple| RelationshipUpdate {
                        operation,
                        relationship: model::Relationship {
                            resource: model::ObjectReference {
                                object_type: tuple.resource_namespace(),
                                object_id: tuple.resource_id(),
                            },
                            relation: tuple.affiliation(),
                            subject: model::SubjectReference {
                                object: model::ObjectReference {
                                    object_type: tuple.subject_namespace(),
                                    object_id: tuple.subject_id(),
                                },
                                optional_relation: tuple.subject_set(),
                            },
                            optional_caveat: None,
                        },
                    })
                    .collect(),
                optional_preconditions: preconditions
                    .into_iter()
                    .map(model::Precondition::from)
                    .collect(),
            })
            .await?;

        Ok(response.written_at.into())
    }
}

impl AuthorizationApi for SpiceDb {
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
    async fn create_relation<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p>, IntoIter: Send> + Send + 'p,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Send + Sync + 't,
    {
        self.modify_relationship(
            model::RelationshipUpdateOperation::Create,
            tuples,
            preconditions,
        )
        .await
        .map(|written_at| CreateRelationResponse { written_at })
        .change_context(CreateRelationError)
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn delete_relation<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p>, IntoIter: Send> + Send + 'p,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Tuple + Send + Sync + 't,
    {
        self.modify_relationship(
            model::RelationshipUpdateOperation::Delete,
            tuples,
            preconditions,
        )
        .await
        .map(|deleted_at| DeleteRelationResponse { deleted_at })
        .change_context(DeleteRelationError)
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn delete_relations<'f>(
        &mut self,
        filter: RelationFilter<'_>,
        preconditions: impl IntoIterator<Item = Precondition<'f>> + Send,
    ) -> Result<DeleteRelationsResponse, Report<DeleteRelationsError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestBody<'a> {
            relationship_filter: model::RelationshipFilter<'a>,
            #[serde(skip_serializing_if = "Vec::is_empty")]
            optional_preconditions: Vec<model::Precondition<'a>>,
            #[serde(skip_serializing_if = "Option::is_none")]
            optional_limit: Option<u32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            optional_allow_partial_deletions: Option<bool>,
        }

        #[derive(Deserialize)]
        enum DeletionProgress {
            #[serde(rename = "DELETION_PROGRESS_COMPLETE")]
            Complete,
            #[serde(rename = "DELETION_PROGRESS_PARTIAL")]
            Partial,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            deleted_at: model::ZedToken,
            deletion_progress: DeletionProgress,
        }

        let request = RequestBody {
            relationship_filter: filter.into(),
            optional_preconditions: preconditions.into_iter().map(Precondition::into).collect(),
            optional_limit: None,
            optional_allow_partial_deletions: None,
        };

        let response: RequestResponse = self
            .call("/v1/relationships/delete", &request)
            .await
            .change_context(DeleteRelationsError)?;

        ensure!(
            matches!(response.deletion_progress, DeletionProgress::Complete),
            Report::new(DeleteRelationsError)
                .attach_printable("Only partial deletion was performed")
        );

        Ok(DeleteRelationsResponse {
            deleted_at: response.deleted_at.into(),
        })
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn check(
        &self,
        tuple: &(impl Tuple + Sync),
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestBody<'a> {
            consistency: model::Consistency<'a>,
            resource: model::ObjectReference<'a>,
            permission: &'a str,
            subject: model::SubjectReference<'a>,
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
            resource: model::ObjectReference {
                object_type: tuple.resource_namespace(),
                object_id: tuple.resource_id(),
            },
            permission: tuple.affiliation(),
            subject: model::SubjectReference {
                object: model::ObjectReference {
                    object_type: tuple.subject_namespace(),
                    object_id: tuple.subject_id(),
                },
                optional_relation: tuple.subject_set(),
            },
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
