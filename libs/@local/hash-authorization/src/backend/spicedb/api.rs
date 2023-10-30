use std::{error::Error, fmt, io};

use error_stack::{Report, ResultExt};
use futures::{Stream, StreamExt, TryStreamExt};
use reqwest::Response;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::time::sleep;
use tokio_util::{codec::FramedRead, io::StreamReader};

use crate::{
    backend::{
        spicedb::model::{self, RpcError},
        CheckError, CheckResponse, DeleteRelationshipError, DeleteRelationshipResponse,
        ExportSchemaError, ExportSchemaResponse, ImportSchemaError, ImportSchemaResponse,
        ModifyRelationshipError, ModifyRelationshipOperation, ModifyRelationshipResponse,
        ReadError, SpiceDbOpenApi, ZanzibarBackend,
    },
    zanzibar::{
        types::{Relationship, RelationshipFilter, Resource, Subject},
        Affiliation, Consistency,
    },
};

#[derive(Debug, Serialize, Deserialize)]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "Used for serializing and deserializing an empty resource `{}`"
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
    async fn modify_relationships<T>(
        &mut self,
        relationships: impl IntoIterator<Item = (ModifyRelationshipOperation, T), IntoIter: Send> + Send,
    ) -> Result<ModifyRelationshipResponse, Report<ModifyRelationshipError>>
    where
        T: Relationship<
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "R: Relationship<
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
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
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
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

        let request_body = RequestBody {
            updates: relationships
                .into_iter()
                .map(|(operation, relationship)| RelationshipUpdate::<T> {
                    operation: operation.into(),
                    relationship,
                })
                .collect(),
        };

        let max_attempts = 3_u32;
        let mut attempt = 0;
        loop {
            let invocation = self
                .call::<RequestResponse>("/v1/relationships/write", &request_body)
                .await;

            match invocation {
                Ok(response) => {
                    return Ok(ModifyRelationshipResponse {
                        written_at: response.written_at.into(),
                    });
                }
                Err(report) => match report.current_context() {
                    InvocationError::Api(RpcError { code: 2, .. }) => {
                        if attempt == max_attempts {
                            break Err(report);
                        }

                        attempt += 1;
                        // TODO: Use a more customizable backoff
                        //       current: 10ms, 40ms, 90ms
                        sleep(std::time::Duration::from_millis(10) * attempt * attempt).await;
                    }
                    _ => break Err(report),
                },
            }
        }
        .change_context(ModifyRelationshipError)
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
        O: Resource<Kind: Serialize, Id: Serialize> + Sync,
        R: Serialize + Affiliation<O> + Sync,
        S: Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, Relation: Serialize> + Sync,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                O: Resource<Kind: Serialize, Id: Serialize>,
                R: Serialize,
                S: Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, Relation: \
                     Serialize>"
        )]
        struct RequestBody<'t, O, R, S> {
            consistency: model::Consistency<'t>,
            #[serde(with = "super::serde::resource_ref")]
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
                Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
                Subject: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
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
                Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
                Subject: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
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

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn delete_relations(
        &mut self,
        filter: RelationshipFilter<
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
        >,
    ) -> Result<DeleteRelationshipResponse, Report<DeleteRelationshipError>> {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                ON: Serialize, OI: Serialize, R: Serialize,
                SN: Serialize, SI: Serialize, SR: Serialize"
        )]
        struct DeleteRelationshipsRequest<ON, OI, R, SN, SI, SR> {
            #[serde(with = "super::serde::relationship_filter")]
            relationship_filter: RelationshipFilter<ON, OI, R, SN, SI, SR>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Response {
            deleted_at: model::ZedToken,
        }

        self.call::<Response>(
            "/v1/relationships/delete",
            &DeleteRelationshipsRequest {
                relationship_filter: filter,
            },
        )
        .await
        .map(|response| DeleteRelationshipResponse {
            deleted_at: response.deleted_at.into(),
        })
        .change_context(DeleteRelationshipError)
    }
}
