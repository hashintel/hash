use core::fmt;
use std::{borrow::Cow, error::Error};

use error_stack::{Report, ResultExt};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::{
    backend::{
        spicedb::schema::{ResourceReference, RpcStatus, SubjectReference},
        AuthorizationBackend, CheckError, CheckResponse, CreateRelationError,
        CreateRelationResponse, Resource,
    },
    zanzibar::{Affiliation, Consistency, Relation, StringTuple, Subject, Zookie},
};

#[derive(Debug)]
pub struct SpiceDbConfig {
    pub base_path: Cow<'static, str>,
    pub client: reqwest::Client,
    pub key: Cow<'static, str>,
}

mod schema {
    //! Schema definitions for the `SpiceDB` API.
    // TODO: Replace this module with an gRPC interface
    //   see https://linear.app/hash/issue/H-609
    use std::collections::HashMap;

    use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};

    use crate::zanzibar::{self, Affiliation, Resource, Subject, Zookie};

    /// Error response returned from the API
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RpcStatus {
        pub code: i32,
        pub message: String,
        #[serde(default)]
        pub details: Vec<serde_json::Value>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    /// Provide causality metadata between Write and Check requests.
    pub struct ZedToken<'z> {
        /// The token string.
        pub token: Zookie<'z>,
    }

    /// Used for mutating a single relationship within the service.
    #[derive(Debug, Serialize)]
    pub enum RelationshipUpdateOperation {
        /// Create the relationship only if it doesn't exist, and error otherwise.
        #[serde(rename = "OPERATION_CREATE")]
        Create,
        /// Upsert the relationship, and will not error if it already exists.
        #[serde(rename = "OPERATION_TOUCH")]
        #[expect(dead_code, reason = "Not yet exposed")]
        Touch,
        /// Delete the relationship. If the relationship does not exist, this operation will no-op.
        #[serde(rename = "OPERATION_DELETE")]
        #[expect(dead_code, reason = "Not yet exposed")]
        Delete,
    }

    pub struct Consistency<'z>(pub zanzibar::Consistency<'z>);
    impl Serialize for Consistency<'_> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            #[derive(Serialize)]
            struct ZedToken<'z> {
                token: &'z Zookie<'z>,
            }

            let mut serialize = serializer.serialize_struct("Consistency", 1)?;
            match &self.0 {
                zanzibar::Consistency::MinimalLatency => {
                    serialize.serialize_field("minimalLatency", &true)?;
                }
                zanzibar::Consistency::AtLeastAsFresh(token) => {
                    serialize.serialize_field("atLeastAsFresh", &ZedToken { token })?;
                }
                zanzibar::Consistency::AtExactSnapshot(token) => {
                    serialize.serialize_field("atExactSnapshot", &ZedToken { token })?;
                }
                zanzibar::Consistency::FullyConsistent => {
                    serialize.serialize_field("fullyConsistent", &true)?;
                }
            }
            serialize.end()
        }
    }

    pub struct ResourceReference<'a, R: ?Sized>(pub &'a R);
    impl<R: Resource + ?Sized> Serialize for ResourceReference<'_, R> {
        fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
            let mut serialize = serializer.serialize_struct("ObjectReference", 2)?;
            serialize.serialize_field("objectType", &self.0.namespace())?;
            serialize.serialize_field("objectId", &self.0.id())?;
            serialize.end()
        }
    }

    pub struct SubjectReference<'a, S: ?Sized>(pub &'a S);
    impl<S: Subject + ?Sized> Serialize for SubjectReference<'_, S> {
        fn serialize<Ser: Serializer>(&self, serializer: Ser) -> Result<Ser::Ok, Ser::Error> {
            let object = self.0.resource();

            if let Some(relation) = self.0.affiliation() {
                let mut serialize = serializer.serialize_struct("SubjectReference", 2)?;
                serialize.serialize_field("object", &ResourceReference(object))?;
                serialize.serialize_field("optionalRelation", &relation)?;
                serialize.end()
            } else {
                let mut serialize = serializer.serialize_struct("SubjectReference", 1)?;
                serialize.serialize_field("object", &ResourceReference(object))?;
                serialize.end()
            }
        }
    }

    /// Represents a reference to a caveat to be used by caveated relationships.
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ContextualizedCaveat<'a> {
        /// The name of the caveat expression to use, as defined in the schema.
        pub caveat_name: &'a str,
        /// Consists of key-value pairs that will be injected at evaluation time.
        ///
        /// The keys must match the arguments defined on the caveat in the schema.
        pub context: HashMap<&'a str, serde_json::Value>,
    }

    /// Specifies how a resource relates to a subject.
    ///
    /// Relationships form the data for the graph over which all permissions questions are answered.
    #[derive(Serialize)]
    #[serde(
        rename_all = "camelCase",
        bound = "R: Resource, A: Affiliation<R>, S: Subject"
    )]
    pub struct Relationship<'a, R: ?Sized, A: ?Sized, S: ?Sized> {
        pub resource: ResourceReference<'a, R>,
        pub relation: &'a A,
        pub subject: SubjectReference<'a, S>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "optionalCaveat")]
        pub caveat: Option<ContextualizedCaveat<'a>>,
    }

    /// Specifies if the operation should proceed if the relationships filter matches any
    /// relationships.
    #[derive(Debug, Serialize)]
    pub enum PreconditionOperation {
        /// Will fail the parent request if there are no relationships that match the filter.
        #[serde(rename = "OPERATION_MUST_MATCH")]
        #[expect(dead_code, reason = "Not yet exposed")]
        MustMatch,
        /// Will fail the parent request if any relationships match the relationships filter.
        #[serde(rename = "OPERATION_MUST_NOT_MATCH")]
        #[expect(dead_code, reason = "Not yet exposed")]
        MustNotMatch,
    }

    /// Specifies how and the existence or absence of certain relationships as expressed through the
    /// accompanying filter should affect whether or not the operation proceeds.
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Precondition<'a> {
        pub operation: PreconditionOperation,
        pub filter: RelationshipFilter<'a>,
    }

    /// A collection of filters which when applied to a relationship will return relationships that
    /// have exactly matching fields.
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RelationshipFilter<'a> {
        pub resource_type: &'a str,
        #[serde(skip_serializing_if = "Option::is_none", rename = "optionalResourceId")]
        pub resource_id: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "optionalRelation")]
        pub relation: Option<&'a str>,
        #[serde(
            skip_serializing_if = "Option::is_none",
            rename = "optionalSubjectFilter"
        )]
        pub subject_filter: Option<SubjectFilter<'a>>,
    }

    /// A filter on the subject of a relationship.
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SubjectFilter<'a> {
        pub subject_type: &'a str,
        #[serde(skip_serializing_if = "Option::is_none", rename = "optionalSubjectId")]
        pub subject_id: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "optionalRelation")]
        pub relation: Option<&'a str>,
    }
}

#[derive(Debug)]
pub struct SpiceDb {
    pub configuration: SpiceDbConfig,
}

#[derive(Debug)]
enum InvocationError {
    Request(reqwest::Error),
    Rpc(RpcStatus),
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
    async fn modify_relationship<'t, R, A, S>(
        &'t self,
        operation: schema::RelationshipUpdateOperation,
        resource: &R,
        relation: &A,
        subject: &S,
    ) -> Result<Zookie<'static>, InvocationError>
    where
        R: Resource + ?Sized + Sync,
        A: Affiliation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "R: Resource, A: Affiliation<R>, S: Subject"
        )]
        struct RelationshipUpdate<'a, R: ?Sized, A: ?Sized, S: ?Sized> {
            operation: schema::RelationshipUpdateOperation,
            relationship: schema::Relationship<'a, R, A, S>,
            #[serde(
                skip_serializing_if = "Vec::is_empty",
                rename = "optionalPreconditions"
            )]
            preconditions: Vec<schema::Precondition<'a>>,
        }

        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "R: Resource, A: Affiliation<R>, S: Subject"
        )]
        struct RequestBody<'a, R: ?Sized, A: ?Sized, S: ?Sized> {
            updates: [RelationshipUpdate<'a, R, A, S>; 1],
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RequestResponse {
            written_at: schema::ZedToken<'static>,
        }

        let response = self
            .call::<RequestResponse>("/v1/relationships/write", &RequestBody {
                updates: [RelationshipUpdate {
                    operation,
                    relationship: schema::Relationship {
                        resource: schema::ResourceReference(resource),
                        relation,
                        subject: schema::SubjectReference(subject),
                        caveat: None,
                    },
                    preconditions: vec![],
                }],
            })
            .await?;

        Ok(response.written_at.token)
    }
}

impl AuthorizationBackend for SpiceDb {
    async fn create_relation<R, A, S>(
        &self,
        resource: &R,
        relation: &A,
        subject: &S,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        R: Resource + ?Sized + Sync,
        A: Relation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync,
    {
        self.modify_relationship(
            schema::RelationshipUpdateOperation::Create,
            resource,
            relation,
            subject,
        )
        .await
        .map(|written_at| CreateRelationResponse { written_at })
        .change_context_lazy(|| CreateRelationError {
            tuple: StringTuple::from_tuple(resource, relation, subject),
        })
    }

    async fn check<R, P, S>(
        &self,
        resource: &R,
        permission: &P,
        subject: &S,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        R: Resource + ?Sized + Sync,
        P: Affiliation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync,
    {
        #[derive(Serialize)]
        #[serde(
            rename_all = "camelCase",
            bound = "R: Resource, A: Affiliation<R>, S: Subject"
        )]
        struct RequestBody<'a, R: ?Sized, A: ?Sized, S: ?Sized> {
            consistency: schema::Consistency<'a>,
            resource: ResourceReference<'a, R>,
            permission: &'a A,
            subject: SubjectReference<'a, S>,
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
            checked_at: schema::ZedToken<'static>,
            permissionship: Permissionship,
        }

        let request = RequestBody {
            consistency: schema::Consistency(consistency),
            resource: ResourceReference(resource),
            permission,
            subject: SubjectReference(subject),
        };

        let response: RequestResponse = self
            .call("/v1/permissions/check", &request)
            .await
            .change_context_lazy(|| CheckError {
                tuple: StringTuple::from_tuple(resource, permission, subject),
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
