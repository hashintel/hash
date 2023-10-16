use std::{error::Error, fmt, io, iter::repeat};

use error_stack::{Report, ResultExt};
use futures::{Stream, StreamExt, TryStreamExt};
use reqwest::Response;
use serde::{de::DeserializeOwned, ser::SerializeStruct, Deserialize, Serialize, Serializer};
use tokio_util::{codec::FramedRead, io::StreamReader};

use crate::{
    backend::{
        spicedb::model::{self, RpcError},
        CheckError, CheckResponse, CreateRelationError, CreateRelationResponse,
        DeleteRelationError, DeleteRelationResponse, ExportSchemaError, ExportSchemaResponse,
        ImportSchemaError, ImportSchemaResponse, ReadError, SpiceDbOpenApi, ZanzibarBackend,
    },
    zanzibar::{Consistency, Relation, Resource, Tuple, UntypedTuple, Zookie},
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
    async fn modify_relations<T>(
        &self,
        operations: impl IntoIterator<Item = (model::RelationshipUpdateOperation, T), IntoIter: Send>
        + Send,
    ) -> Result<Zookie<'static>, Report<InvocationError>>
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
    async fn touch_relations<T>(
        &mut self,
        tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Send + Sync,
    {
        self.modify_relations(repeat(model::RelationshipUpdateOperation::Touch).zip(tuples))
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
            resource: model::ObjectReference<T>,
            permission: model::RelationReference<T>,
            subject: model::SubjectReference<T>,
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

    #[expect(
        clippy::missing_errors_doc,
        reason = "False positive, documented on trait"
    )]
    async fn read_relations<O, R, U, S>(
        &self,
        object: Option<O>,
        relation: Option<R>,
        user: Option<U>,
        user_set: Option<S>,
        consistency: Consistency<'static>,
    ) -> Result<Vec<(O, R, U, Option<S>)>, Report<ReadError>>
    where
        O: Resource + From<O::Id> + Send + Sync,
        O::Id: DeserializeOwned,
        R: Relation<O> + Send + Sync + DeserializeOwned,
        U: Resource + From<U::Id> + Send + Sync,
        U::Id: DeserializeOwned,
        S: Serialize + Send + Sync + DeserializeOwned,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "O: Resource, R: Serialize, U: Resource, S: Serialize"
        )]
        struct ReadRelationshipsRequest<O, R, U, S> {
            consistency: model::Consistency<'static>,
            relationship_filter: RelationshipFilter<O, R, U, S>,
        }

        struct SubjectFilter<U, S> {
            user: Option<U>,
            user_set: Option<S>,
        }

        impl<U: Resource, R: Serialize> Serialize for SubjectFilter<U, R> {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let mut ser = serializer.serialize_struct("SubjectFilter", 3)?;
                ser.serialize_field("subjectType", U::namespace())?;
                if let Some(user) = &self.user {
                    ser.serialize_field("optionalSubjectId", &user.id())?;
                }
                if let Some(relation) = &self.user_set {
                    ser.serialize_field("optionalRelation", relation)?;
                }

                ser.end()
            }
        }

        struct RelationshipFilter<O, R, U, S> {
            object: Option<O>,
            relation: Option<R>,
            subject: SubjectFilter<U, S>,
        }

        impl<O: Resource, R: Serialize, U: Resource, S: Serialize> Serialize
            for RelationshipFilter<O, R, U, S>
        {
            fn serialize<Ser>(&self, serializer: Ser) -> Result<Ser::Ok, Ser::Error>
            where
                Ser: Serializer,
            {
                let mut ser = serializer.serialize_struct("RelationshipFilter", 4)?;
                ser.serialize_field("resourceType", O::namespace())?;
                if let Some(object) = &self.object {
                    ser.serialize_field("optionalResourceId", &object.id())?;
                }
                if let Some(relation) = &self.relation {
                    ser.serialize_field("optionalRelation", relation)?;
                }
                ser.serialize_field("optionalSubjectFilter", &self.subject)?;

                ser.end()
            }
        }

        #[derive(Deserialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "O: Resource + From<O::Id>, O::Id: Deserialize<'de>, R: Deserialize<'de>, U: \
                     Resource + From<U::Id>, U::Id: Deserialize<'de>, S: Deserialize<'de>"
        )]
        struct ReadRelationshipsResponse<O, R, U, S> {
            relationship: Relationship<O, R, U, S>,
        }

        #[derive(Deserialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "O: Resource + From<O::Id>, O::Id: Deserialize<'de>, R: Deserialize<'de>, U: \
                     Resource + From<U::Id>, U::Id: Deserialize<'de>, S: Deserialize<'de>"
        )]
        struct Relationship<O, R, U, S> {
            resource: model::ObjectReference<O>,
            relation: R,
            subject: model::SubjectReference<(U, Option<S>)>,
        }

        self.stream::<ReadRelationshipsResponse<O, R, U, S>>(
            "/v1/relationships/read",
            &ReadRelationshipsRequest {
                consistency: model::Consistency::from(consistency),
                relationship_filter: RelationshipFilter {
                    object,
                    relation,
                    subject: SubjectFilter { user, user_set },
                },
            },
        )
        .await
        .change_context(ReadError)?
        .map_ok(|response| {
            let object = response.relationship.resource.0;
            let relation = response.relationship.relation;
            let user = response.relationship.subject.0.0;
            let user_set = response.relationship.subject.0.1;

            (object, relation, user, user_set)
        })
        .map_err(|error| error.change_context(ReadError))
        .try_collect::<Vec<_>>()
        .await
    }
}
