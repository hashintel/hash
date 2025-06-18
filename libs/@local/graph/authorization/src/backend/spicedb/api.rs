use core::{error::Error, fmt};
use std::io;

use error_stack::{Report, ResultExt as _};
use futures::{Stream, StreamExt as _, TryStreamExt as _};
use hash_codec::bytes::JsonLinesDecoder;
use reqwest::Response;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use tokio::time::sleep;
use tokio_util::{codec::FramedRead, io::StreamReader};

use crate::{
    backend::{
        BulkCheckItem, BulkCheckResponse, CheckError, CheckResponse, DeleteRelationshipError,
        DeleteRelationshipResponse, ExportSchemaError, ExportSchemaResponse, ImportSchemaError,
        ImportSchemaResponse, ModifyRelationshipError, ModifyRelationshipOperation,
        ModifyRelationshipResponse, ReadError, SpiceDbOpenApi, ZanzibarBackend,
        spicedb::model::{self, LookupPermissionship, Permissionship, RpcError},
    },
    zanzibar::{
        Consistency, Permission,
        types::{Relationship, RelationshipFilter, Resource, Subject},
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

    async fn stream<R: DeserializeOwned, B: Serialize + Sync>(
        &self,
        path: &'static str,
        body: &B,
    ) -> Result<
        impl Stream<Item = Result<R, Report<StreamError>>> + use<R, B>,
        Report<InvocationError>,
    > {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        enum StreamResult<T> {
            Result(T),
            Error(RpcError),
        }

        let stream_response = self.invoke_request(path, body).await?;
        let stream_reader =
            StreamReader::new(stream_response.bytes_stream().map_err(io::Error::other));
        let framed_stream =
            FramedRead::new(stream_reader, JsonLinesDecoder::<StreamResult<R>>::new());

        Ok(framed_stream.map(
            |io_result| match io_result.change_context(StreamError::Parse)? {
                StreamResult::Result(result) => Ok(result),
                StreamResult::Error(rpc_error) => Err(Report::new(StreamError::Api(rpc_error))),
            },
        ))
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

    async fn modify_relationships<T>(
        &self,
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
        struct RequestBody<'r, R> {
            updates: &'r [RelationshipUpdate<R>],
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            written_at: model::ZedToken,
        }

        let mut last_written = None;
        let max_attempts = 3_u32;

        for updates in relationships
            .into_iter()
            .map(|(operation, relationship)| RelationshipUpdate::<T> {
                operation: operation.into(),
                relationship,
            })
            .collect::<Vec<_>>()
            .chunks(1000)
        {
            let request_body = RequestBody { updates };

            let mut attempt = 0;
            loop {
                let invocation = self
                    .call::<RequestResponse>("/v1/relationships/write", &request_body)
                    .await;

                match invocation {
                    Ok(response) => {
                        last_written = Some(response.written_at);
                        break Ok(());
                    }
                    Err(report) => match report.current_context() {
                        InvocationError::Api(RpcError { code: 2, .. }) => {
                            if attempt == max_attempts {
                                break Err(report);
                            }

                            attempt += 1;
                            // TODO: Use a more customizable backoff
                            //       current: 10ms, 40ms, 90ms
                            sleep(core::time::Duration::from_millis(10) * attempt * attempt).await;
                        }
                        _ => break Err(report),
                    },
                }
            }
            .change_context(ModifyRelationshipError)?;
        }

        last_written.map_or_else(
            || Err(Report::new(ModifyRelationshipError)),
            |last_written| {
                Ok(ModifyRelationshipResponse {
                    written_at: last_written.into(),
                })
            },
        )
    }

    async fn check_permission<O, R, S>(
        &self,
        resource: &O,
        permission: &R,
        subject: &S,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        O: Resource<Kind: Serialize, Id: Serialize> + Sync,
        R: Serialize + Permission<O> + Sync,
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

        Ok(CheckResponse {
            checked_at: response.checked_at.token,
            has_permission: response.permissionship.into(),
        })
    }

    #[expect(clippy::too_many_lines)]
    async fn check_permissions<O, R, S>(
        &self,
        relationships: impl IntoIterator<Item = (O, R, S), IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> Result<
        BulkCheckResponse<impl IntoIterator<Item = BulkCheckItem<O, R, S>>>,
        Report<CheckError>,
    >
    where
        O: Resource<Kind: Serialize + DeserializeOwned, Id: Serialize + DeserializeOwned>
            + Send
            + Sync,
        R: Serialize + DeserializeOwned + Permission<O> + Send + Sync,
        S: Subject<
                Resource: Resource<
                    Kind: Serialize + DeserializeOwned,
                    Id: Serialize + DeserializeOwned,
                >,
                Relation: Serialize + DeserializeOwned,
            > + Send
            + Sync,
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
        struct BulkCheckPermissionRequest<'t, O, R, S> {
            consistency: model::Consistency<'t>,
            items: Vec<BulkCheckPermissionRequestItem<O, R, S>>,
        }

        #[derive(Serialize, Deserialize)]
        #[serde(
            rename_all = "camelCase",
            bound(
                serialize = "
                O: Resource<Kind: Serialize, Id: Serialize>,
                R: Serialize,
                S: Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, \
                                 Relation: Serialize>",
                deserialize = "
                O: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                R: Deserialize<'de>,
                S: Subject<Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>, \
                               Relation: Deserialize<'de>>"
            )
        )]
        struct BulkCheckPermissionRequestItem<O, R, S> {
            #[serde(with = "super::serde::resource")]
            resource: O,
            permission: R,
            #[serde(with = "super::serde::subject")]
            subject: S,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct BulkCheckPermissionResponseItem {
            permissionship: Permissionship,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        enum Response {
            Item(BulkCheckPermissionResponseItem),
            Error(RpcError),
        }

        #[derive(Deserialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                O: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                R: Deserialize<'de>,
                S: Subject<Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>, \
                     Relation: Deserialize<'de>>"
        )]
        struct BulkCheckPermissionResponse<O, R, S> {
            checked_at: model::ZedToken,
            pairs: Vec<BulkCheckPermissionPair<O, R, S>>,
        }

        #[derive(Deserialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                O: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                R: Deserialize<'de>,
                S: Subject<Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>, \
                     Relation: Deserialize<'de>>"
        )]
        struct BulkCheckPermissionPair<O, R, S> {
            request: BulkCheckPermissionRequestItem<O, R, S>,
            #[serde(flatten)]
            response: Response,
        }

        let mut current_token = None;
        let mut relationships = relationships.into_iter().peekable();
        let mut permissions = Vec::with_capacity(relationships.size_hint().0);
        let checked_at = loop {
            let request = BulkCheckPermissionRequest::<O, R, S> {
                consistency: current_token
                    .as_ref()
                    .map_or(consistency, Consistency::AtLeastAsFresh)
                    .into(),
                items: relationships
                    .by_ref()
                    .take(10000)
                    .map(
                        |(resource, permission, subject)| BulkCheckPermissionRequestItem {
                            resource,
                            permission,
                            subject,
                        },
                    )
                    .collect(),
            };

            let response: BulkCheckPermissionResponse<O, R, S> = self
                .call("/v1/experimental/permissions/bulkcheckpermission", &request)
                .await
                .change_context(CheckError)?;

            permissions.extend(response.pairs.into_iter().map(|pair| BulkCheckItem {
                subject: pair.request.subject,
                permission: pair.request.permission,
                resource: pair.request.resource,
                has_permission: match pair.response {
                    Response::Item(item) => Ok(item.permissionship.into()),
                    Response::Error(error) => Err(error),
                },
            }));

            if relationships.peek().is_none() {
                break response.checked_at.token;
            }
            current_token = Some(response.checked_at.token);
        };

        Ok(BulkCheckResponse {
            permissions,
            checked_at,
        })
    }

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
    ) -> Result<impl Stream<Item = Result<R, Report<ReadError>>>, Report<ReadError>>
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

        Ok(self
            .stream::<ReadRelationshipsResponse<R>, _>(
                "/v1/relationships/read",
                &ReadRelationshipsRequest {
                    consistency: model::Consistency::from(consistency),
                    relationship_filter: filter,
                },
            )
            .await
            .change_context(ReadError)?
            .map_ok(|response| response.relationship)
            .map_err(|error| error.change_context(ReadError)))
    }

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

    async fn lookup_resources<O>(
        &self,
        subject: &(
             impl Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, Relation: Serialize> + Sync
         ),
        permission: &(impl Serialize + Permission<O> + Sync),
        resource_kind: &O::Kind,
        consistency: Consistency<'_>,
    ) -> Result<Vec<O::Id>, Report<ReadError>>
    where
        for<'de> O: Resource<Kind: Serialize + Sync, Id: Deserialize<'de> + Send> + Send,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                O: Serialize,
                R: Serialize,
                S: Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, Relation: Serialize>"
        )]
        struct LookupResourcesRequest<'a, O, R, S> {
            consistency: model::Consistency<'a>,
            resource_object_type: &'a O,
            permission: &'a R,
            #[serde(with = "super::serde::subject_ref")]
            subject: &'a S,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct LookupResourcesResponse<O> {
            resource_object_id: O,
            #[serde(rename = "permissionship")]
            _permissionship: LookupPermissionship,
        }

        self.stream::<LookupResourcesResponse<O::Id>, _>(
            "/v1/permissions/resources",
            &LookupResourcesRequest {
                consistency: model::Consistency::from(consistency),
                resource_object_type: resource_kind,
                permission,
                subject,
            },
        )
        .await
        .change_context(ReadError)?
        .map_ok(|response| response.resource_object_id)
        .map_err(|error| error.change_context(ReadError))
        .try_collect()
        .await
    }

    async fn lookup_subjects<S, O>(
        &self,
        subject_type: &<S::Resource as Resource>::Kind,
        subject_relation: Option<&S::Relation>,
        permission: &(impl Serialize + Permission<O> + Sync),
        resource: &O,
        consistency: Consistency<'_>,
    ) -> Result<Vec<<S::Resource as Resource>::Id>, Report<ReadError>>
    where
        for<'de> S: Subject<
                Resource: Resource<Kind: Serialize + Sync, Id: Deserialize<'de> + Send>,
                Relation: Serialize + Sync,
            > + Send,
        O: Resource<Kind: Serialize, Id: Serialize> + Sync,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "
                    O: Resource<Kind: Serialize, Id: Serialize>,
                    R: Serialize,
                    S: Serialize,
                    SR: Serialize"
        )]
        struct LookupSubjectsRequest<'a, O, R, S, SR> {
            consistency: model::Consistency<'a>,
            #[serde(with = "super::serde::resource_ref")]
            resource: &'a O,
            permission: &'a R,
            subject_object_type: &'a S,
            #[serde(skip_serializing_if = "Option::is_none")]
            optional_subject_relation: Option<&'a SR>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ResolvedObject<O> {
            subject_object_id: O,
            #[serde(rename = "permissionship")]
            _permissionship: LookupPermissionship,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct LookupSubjectsResponse<O> {
            subject: ResolvedObject<O>,
        }

        self.stream::<LookupSubjectsResponse<<S::Resource as Resource>::Id>, _>(
            "/v1/permissions/subjects",
            &LookupSubjectsRequest {
                consistency: model::Consistency::from(consistency),
                resource,
                permission,
                subject_object_type: subject_type,
                optional_subject_relation: subject_relation,
            },
        )
        .await
        .change_context(ReadError)?
        .map_ok(|response| response.subject.subject_object_id)
        .map_err(|error| error.change_context(ReadError))
        .try_collect()
        .await
    }
}
