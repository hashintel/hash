use std::{error::Error, fmt, io, iter::repeat};

use error_stack::{Report, ResultExt};
use futures::{Stream, StreamExt, TryStreamExt};
use reqwest::Response;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio_util::{codec::FramedRead, io::StreamReader};

use crate::{
    backend::{
        spicedb::model::{self, RpcError},
        CheckError, CheckResponse, CreateRelationError, CreateRelationResponse,
        DeleteRelationError, DeleteRelationResponse, ExportSchemaError, ExportSchemaResponse,
        ImportSchemaError, ImportSchemaResponse, ReadError, SpiceDbOpenApi, ZanzibarBackend,
    },
    zanzibar::{
        types::{Object, Relationship, RelationshipFilter, Subject},
        Affiliation, Consistency, Zookie,
    },
};

#[derive(Debug, Serialize, Deserialize)]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "Used for serializing and deserializing an empty object `{}`"
)]
struct Empty {}

#[derive(Debug)]
enum InvocationError {
    Request,
    Response,
    Api(RpcError),
}

impl fmt::Display for InvocationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Request => fmt.write_str("an error happened while making the request"),
            Self::Response => {
                fmt.write_str("the response returned from the server could not be parsed")
            }
            Self::Api(error) => fmt::Display::fmt(&error, fmt),
        }
    }
}

impl Error for InvocationError {}

#[derive(Debug)]
enum StreamError {
    Parse,
    Api(RpcError),
}

impl fmt::Display for StreamError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parse => fmt.write_str("the item returned from the server could not be parsed"),
            Self::Api(error) => fmt::Display::fmt(&error, fmt),
        }
    }
}

impl Error for StreamError {}

impl SpiceDbOpenApi {
    async fn invoke_request(
        &self,
        path: &'static str,
        body: &(impl Serialize + Sync),
    ) -> Result<Response, Report<InvocationError>> {
        let url = format!("{}{}", self.base_path, path);
        let request = self
            .client
            .post(&url)
            .json(&body)
            .build()
            .change_context(InvocationError::Request)
            .attach_printable(url)?;

        let response = self
            .client
            .execute(request)
            .await
            .change_context(InvocationError::Request)?;

        if response.status().is_success() {
            Ok(response)
        } else {
            let rpc_error = response
                .json::<RpcError>()
                .await
                .change_context(InvocationError::Response)?;
            Err(Report::new(InvocationError::Api(rpc_error)))
        }
    }

    async fn call<R: DeserializeOwned>(
        &self,
        path: &'static str,
        body: &(impl Serialize + Sync),
    ) -> Result<R, Report<InvocationError>> {
        self.invoke_request(path, body)
            .await?
            .json()
            .await
            .change_context(InvocationError::Response)
    }

    async fn stream<R: DeserializeOwned>(
        &self,
        path: &'static str,
        body: &(impl Serialize + Sync),
    ) -> Result<impl Stream<Item = Result<R, Report<StreamError>>>, Report<InvocationError>> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        enum StreamResult<T> {
            Result(T),
            Error(RpcError),
        }

        impl<T> From<StreamResult<T>> for Result<T, Report<StreamError>> {
            fn from(result: StreamResult<T>) -> Self {
                match result {
                    StreamResult::Result(result) => Ok(result),
                    StreamResult::Error(rpc_error) => Err(Report::new(StreamError::Api(rpc_error))),
                }
            }
        }

        let stream_response = self.invoke_request(path, body).await?;
        let stream_reader = StreamReader::new(
            stream_response
                .bytes_stream()
                .map_err(|request_error| io::Error::new(io::ErrorKind::Other, request_error)),
        );
        let framed_stream = FramedRead::new(
            stream_reader,
            codec::bytes::JsonLinesDecoder::<StreamResult<R>>::new(),
        );

        Ok(framed_stream
            .map(|io_result| Result::from(io_result.change_context(StreamError::Parse)?)))
    }

    // TODO: Expose batch-version
    //   see https://linear.app/hash/issue/H-642
    async fn modify_relations<R>(
        &self,
        operations: impl IntoIterator<Item = (model::RelationshipUpdateOperation, R), IntoIter: Send>
        + Send,
    ) -> Result<Zookie<'static>, Report<InvocationError>>
    where
        R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize
            >"
        )]
        struct RelationshipUpdate<R> {
            operation: model::RelationshipUpdateOperation,
            #[serde(with = "super::serde::relationship")]
            relationship: R,
        }

        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize
            >"
        )]
        struct RequestBody<R> {
            updates: Vec<RelationshipUpdate<R>>,
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
                        .map(|(operation, relationship)| RelationshipUpdate::<R> {
                            operation,
                            relationship,
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
    async fn create_relations<R>(
        &mut self,
        relationships: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        self.modify_relations(repeat(model::RelationshipUpdateOperation::Create).zip(relationships))
            .await
            .map(|written_at| CreateRelationResponse { written_at })
            .change_context(CreateRelationError)
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn touch_relations<R>(
        &mut self,
        relationships: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        self.modify_relations(repeat(model::RelationshipUpdateOperation::Touch).zip(relationships))
            .await
            .map(|written_at| CreateRelationResponse { written_at })
            .change_context(CreateRelationError)
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn delete_relations<R>(
        &mut self,
        relationships: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        self.modify_relations(repeat(model::RelationshipUpdateOperation::Delete).zip(relationships))
            .await
            .map(|deleted_at| DeleteRelationResponse { deleted_at })
            .change_context(DeleteRelationError)
    }

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn check<O, R, S>(
        &self,
        resource: &O,
        permission: &R,
        subject: &S,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        O: Object<Namespace: Serialize, Id: Serialize> + Sync,
        R: Serialize + Affiliation<O> + Sync,
        S: Subject<Object: Object<Namespace: Serialize, Id: Serialize>, Relation: Serialize> + Sync,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                O: Object<Namespace: Serialize, Id: Serialize>,
                R: Serialize + Affiliation<O>,
                S: Subject<Object: Object<Namespace: Serialize, Id: Serialize>, Relation: \
                     Serialize>"
        )]
        struct RequestBody<'t, O, R, S> {
            consistency: model::Consistency<'t>,
            #[serde(with = "super::serde::object_ref")]
            resource: &'t O,
            permission: &'t R,
            #[serde(with = "super::serde::subject_ref")]
            subject: &'t S,
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

        let request = RequestBody::<O, R, S> {
            consistency: consistency.into(),
            resource,
            permission,
            subject,
        };

        let response: RequestResponse = self
            .call("/v1/permissions/check", &request)
            .await
            .change_context(CheckError)?;

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

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn read_relations<R>(
        &self,
        filter: RelationshipFilter<
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
        >,
        consistency: Consistency<'_>,
    ) -> Result<Vec<R>, Report<ReadError>>
    where
        for<'de> R: Relationship<
                Object: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
                Subject: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                SubjectSet: Deserialize<'de>,
            > + Send,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                ON: Serialize, OI: Serialize, R: Serialize,
                SN: Serialize, SI: Serialize, SR: Serialize"
        )]
        struct ReadRelationshipsRequest<'a, ON, OI, R, SN, SI, SR> {
            consistency: model::Consistency<'a>,
            #[serde(with = "super::serde::relationship_filter")]
            relationship_filter: RelationshipFilter<ON, OI, R, SN, SI, SR>,
        }

        #[derive(Deserialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "R: Relationship<
                Object: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
                Subject: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                SubjectSet: Deserialize<'de>,
            >"
        )]
        struct ReadRelationshipsResponse<R> {
            #[serde(with = "super::serde::relationship")]
            relationship: R,
        }

        self.stream::<ReadRelationshipsResponse<R>>(
            "/v1/relationships/read",
            &ReadRelationshipsRequest {
                consistency: model::Consistency::from(consistency),
                relationship_filter: filter,
            },
        )
        .await
        .change_context(ReadError)?
        .map_ok(|response| response.relationship)
        .map_err(|error| error.change_context(ReadError))
        .try_collect::<Vec<_>>()
        .await
    }
}
