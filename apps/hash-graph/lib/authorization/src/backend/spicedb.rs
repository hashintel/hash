use core::fmt;
use std::{borrow::Cow, error::Error};

use error_stack::{bail, Report, ResultExt};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::{
    backend::{
        spicedb::schema::{ResourceReference, RpcStatus, SubjectReference},
        AuthorizationBackend, CheckError, CheckResponse, Resource,
    },
    zanzibar::{
        Affiliation, Consistency, GenericAffiliation, GenericResource, GenericSubject, Subject,
        Tuple,
    },
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

    use crate::zanzibar::{self, Affiliation, Resource, Subject, Tuple, Zookie};

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

    pub struct SubjectReference<'a, S: Subject>(pub &'a S);
    impl<S: Subject> Serialize for SubjectReference<'_, S> {
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

    pub struct RelationshipTuple<R, A, S>(pub Tuple<R, A, S>);
    impl<R: Resource, A: Affiliation<R>, S: Subject> Serialize for RelationshipTuple<R, A, S> {
        fn serialize<Ser: Serializer>(&self, serializer: Ser) -> Result<Ser::Ok, Ser::Error> {
            let mut serialize = serializer.serialize_struct("Tuple", 3)?;
            serialize.serialize_field("resource", &ResourceReference(&self.0.resource))?;
            serialize.serialize_field("relation", &self.0.affiliation)?;
            serialize.serialize_field("subject", &SubjectReference(&self.0.subject))?;
            serialize.end()
        }
    }

    /// Specifies how a resource relates to a subject.
    ///
    /// Relationships form the data for the graph over which all permissions questions are answered.
    #[derive(Serialize)]
    #[serde(
        rename_all = "camelCase",
        bound = "R: Resource, A: Affiliation<R>, S: Subject"
    )]
    pub struct Relationship<'a, R, A, S> {
        #[serde(flatten)]
        pub tuple: RelationshipTuple<R, A, S>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "optionalCaveat")]
        pub caveat: Option<ContextualizedCaveat<'a>>,
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

impl Error for InvocationError {}

enum InvocationResult<T> {
    Success(T),
    Failure(RpcStatus),
}

impl SpiceDb {
    async fn request<R: DeserializeOwned>(
        &self,
        path: &'static str,
        body: &(impl Serialize + Sync),
    ) -> Result<InvocationResult<R>, reqwest::Error> {
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
            Ok(InvocationResult::Success(result.json().await?))
        } else {
            Ok(InvocationResult::Failure(result.json().await?))
        }
    }

    async fn call<R: DeserializeOwned>(
        &self,
        path: &'static str,
        body: &(impl Serialize + Sync),
    ) -> Result<R, Report<InvocationError>> {
        match self
            .request(path, body)
            .await
            .map_err(InvocationError::Request)?
        {
            InvocationResult::Success(result) => Ok(result),
            InvocationResult::Failure(status) => bail!(InvocationError::Rpc(status)),
        }
    }
}

impl AuthorizationBackend for SpiceDb {
    async fn check<S, A, R>(
        &self,
        subject: &S,
        affiliation: &A,
        resource: &R,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        S: Subject + Sync,
        A: Affiliation<R> + Sync,
        R: Resource + Sync,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase", bound = "")]
        struct RequestBody<'a, O: Resource, R: Affiliation<O>, S: Subject> {
            consistency: schema::Consistency<'a>,
            resource: ResourceReference<'a, O>,
            permission: &'a R,
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
            permission: affiliation,
            subject: SubjectReference(subject),
        };

        let response: RequestResponse = self
            .call("/v1/permissions/check", &request)
            .await
            .change_context_lazy(|| CheckError {
                tuple: Tuple {
                    resource: GenericResource {
                        namespace: resource.namespace().to_string(),
                        id: resource.id().to_string(),
                    },
                    affiliation: GenericAffiliation(affiliation.to_string()),
                    subject: GenericSubject {
                        resource: GenericResource {
                            namespace: subject.resource().namespace().to_string(),
                            id: subject.resource().id().to_string(),
                        },
                        affiliation: subject
                            .affiliation()
                            .map(ToString::to_string)
                            .map(GenericAffiliation),
                    },
                },
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
