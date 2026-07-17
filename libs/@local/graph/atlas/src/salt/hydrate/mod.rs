//! Live-store hydration of spatial lookup hits.
//!
//! A spatial lookup resolves canvas coordinates to durable [`EntityId`]
//! values; hydration turns those identities into full entities plus the
//! caller-requested graph neighbourhood in one round trip. [`EntityHydrator`]
//! owns a [`PostgresStorePool`] against the HASH Graph store and forwards
//! validated traversal parameters to
//! [`EntityStore::query_entity_subgraph`], returning the same keyed subgraph
//! wire shape the main Graph REST API serves.
//!
//! # Authorization
//!
//! The current surface is an explicitly unauthenticated proof of concept:
//! requests may name an acting actor, otherwise queries run as the
//! configured default (the public actor when unset). Store-side policy
//! filtering still applies to whichever actor is used — this module adds no
//! bypass — but nothing verifies that the caller *is* that actor. The
//! surrounding deployment must treat this endpoint exactly like the rest of
//! the Atlas API: loopback or trusted network only, real authentication
//! arrives with the serving redesign.

mod subgraph;

use core::{error::Error, fmt, num::NonZeroUsize};

use camino::Utf8PathBuf;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hash_graph_store::{
    entity::{
        EntityQuerySorting, EntityStore as _, QueryEntitiesParams, QueryEntitySubgraphParams,
    },
    filter::Filter,
    pool::StorePool as _,
    subgraph::{
        edges::{
            EdgeDirection, EntityTraversalEdge, EntityTraversalPath, GraphResolveDepths,
            SubgraphTraversalParams,
        },
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use serde::{Deserialize, Serialize};
use tokio_postgres::NoTls;
use type_system::{knowledge::entity::EntityId, principal::actor::ActorEntityUuid};
use uuid::Uuid;

pub(crate) use self::subgraph::EntitySubgraph;

/// Maximum traversal paths accepted for one hydration request.
///
/// Mirrors the Graph REST API's request validation.
const MAXIMUM_TRAVERSAL_PATHS: usize = 10;

/// Connection and default-actor configuration for lookup hydration.
///
/// The password is read from `password_file` when present, otherwise taken
/// from the inline `password` field. `actor_id` names the actor used for
/// requests that do not carry one; the nil UUID selects the public actor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GraphStoreConfiguration {
    /// PostgreSQL host of the HASH Graph store.
    pub host: String,
    /// PostgreSQL TCP port.
    pub port: u16,
    /// PostgreSQL role used for hydration reads.
    pub user: String,
    /// HASH Graph database name.
    pub database: String,
    /// UTF-8 file containing only the PostgreSQL password.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password_file: Option<Utf8PathBuf>,
    /// Inline PostgreSQL password used when no file is configured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// Connection-pool size for hydration queries.
    #[serde(default = "default_max_connections")]
    pub max_connections: NonZeroUsize,
    /// Default acting actor; the nil UUID selects the public actor.
    #[serde(default)]
    pub actor_id: Uuid,
}

impl GraphStoreConfiguration {
    /// Default hydration connection-pool size.
    pub const DEFAULT_MAX_CONNECTIONS: NonZeroUsize = match NonZeroUsize::new(4) {
        Some(connections) => connections,
        None => unreachable!(),
    };
}

const fn default_max_connections() -> NonZeroUsize {
    GraphStoreConfiguration::DEFAULT_MAX_CONNECTIONS
}

/// One graph-neighbourhood request hydrated for a set of lookup hits.
#[derive(Debug)]
pub(crate) struct HydrationRequest {
    /// Root entities resolved by the spatial lookup.
    pub roots: Vec<EntityId>,
    /// Caller-selected traversal shape.
    pub traversal: SubgraphTraversalParams,
    /// Acting actor for this request; `None` uses the configured default.
    pub actor_id: Option<Uuid>,
    /// Whether draft entities participate in the query.
    pub include_drafts: bool,
}

/// Pooled live-store reader answering lookup hydration queries.
pub(crate) struct EntityHydrator {
    pool: PostgresStorePool,
    default_actor: ActorEntityUuid,
}

impl EntityHydrator {
    /// Connects the hydration pool described by `configuration`.
    ///
    /// # Errors
    ///
    /// Returns an error when no password source is configured, the password
    /// file is unreadable, or the pool cannot be created.
    pub(crate) async fn connect(
        configuration: &GraphStoreConfiguration,
    ) -> Result<Self, HydrationError> {
        let password = match (&configuration.password_file, &configuration.password) {
            (Some(path), _) => std::fs::read_to_string(path)
                .map_err(|error| HydrationError::Password {
                    detail: format!("could not read {path}: {error}"),
                })?
                .trim()
                .to_owned(),
            (None, Some(password)) => password.clone(),
            (None, None) => {
                return Err(HydrationError::Password {
                    detail: "store configuration needs `passwordFile` or `password`".to_owned(),
                });
            }
        };
        let connection = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            configuration.user.clone(),
            password,
            configuration.host.clone(),
            configuration.port,
            configuration.database.clone(),
        );
        let pool = PostgresStorePool::new(
            &connection,
            &DatabasePoolConfig {
                max_connections: configuration.max_connections,
            },
            NoTls,
            PostgresStoreSettings {
                validate_links: false,
                skip_embedding_creation: true,
                ..PostgresStoreSettings::default()
            },
        )
        .await
        .map_err(|report| HydrationError::Pool {
            detail: report.to_string(),
        })?;
        Ok(Self {
            pool,
            default_actor: ActorEntityUuid::new(configuration.actor_id),
        })
    }

    /// Hydrates `request.roots` and their requested neighbourhood.
    ///
    /// The traversal runs at the store's live decision time. Draft roots are
    /// reachable only when `request.include_drafts` is set.
    ///
    /// # Errors
    ///
    /// Returns an error when the traversal exceeds request limits, a pooled
    /// connection cannot be acquired, or the store query fails.
    pub(crate) async fn entity_subgraph(
        &self,
        request: HydrationRequest,
    ) -> Result<EntitySubgraph, HydrationError> {
        validate_traversal(&request.traversal)?;
        let actor = request
            .actor_id
            .map_or(self.default_actor, ActorEntityUuid::new);
        let include_drafts =
            request.include_drafts || request.roots.iter().any(|root| root.draft_id.is_some());
        let filter = Filter::Any(
            request
                .roots
                .iter()
                .copied()
                .map(Filter::for_entity_by_entity_id)
                .collect(),
        );
        let params = QueryEntitySubgraphParams::from_parts(
            QueryEntitiesParams {
                filter,
                temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                conversions: Vec::new(),
                limit: request.roots.len().max(1),
                include_drafts,
                include_entity_types: None,
                include_permissions: false,
            },
            request.traversal,
        );
        let mut store = self
            .pool
            .acquire(None)
            .await
            .map_err(|report| HydrationError::Pool {
                detail: report.to_string(),
            })?;
        let response = store
            .query_entity_subgraph(actor, params)
            .await
            .map_err(|report| HydrationError::Query {
                detail: report.to_string(),
            })?;
        Ok(response.subgraph.into())
    }
}

/// Returns the default one-hop neighbourhood traversal.
///
/// A link is itself an entity, so one neighbour hop is two entity edges:
/// root to link, then link to the far endpoint. Both link directions are
/// requested, and every reached entity resolves its type.
#[must_use]
pub(crate) fn default_traversal() -> SubgraphTraversalParams {
    SubgraphTraversalParams::ResolveDepths {
        graph_resolve_depths: GraphResolveDepths {
            is_of_type: true,
            ..GraphResolveDepths::default()
        },
        traversal_paths: vec![
            EntityTraversalPath {
                edges: vec![
                    EntityTraversalEdge::HasLeftEntity {
                        direction: EdgeDirection::Incoming,
                    },
                    EntityTraversalEdge::HasRightEntity {
                        direction: EdgeDirection::Outgoing,
                    },
                ],
            },
            EntityTraversalPath {
                edges: vec![
                    EntityTraversalEdge::HasRightEntity {
                        direction: EdgeDirection::Incoming,
                    },
                    EntityTraversalEdge::HasLeftEntity {
                        direction: EdgeDirection::Outgoing,
                    },
                ],
            },
        ],
    }
}

/// Applies the Graph REST API's traversal limits to one request.
fn validate_traversal(traversal: &SubgraphTraversalParams) -> Result<(), HydrationError> {
    let invalid = |detail: String| HydrationError::Traversal { detail };
    match traversal {
        SubgraphTraversalParams::ResolveDepths {
            traversal_paths,
            graph_resolve_depths,
        } => {
            if traversal_paths.len() > MAXIMUM_TRAVERSAL_PATHS {
                return Err(invalid(format!(
                    "request has {} traversal paths, which exceeds the maximum of \
                     {MAXIMUM_TRAVERSAL_PATHS}",
                    traversal_paths.len()
                )));
            }
            for path in traversal_paths {
                path.validate()
                    .map_err(|error| invalid(error.to_string()))?;
            }
            graph_resolve_depths
                .validate()
                .map_err(|error| invalid(error.to_string()))
        }
        SubgraphTraversalParams::Paths { traversal_paths } => {
            if traversal_paths.len() > MAXIMUM_TRAVERSAL_PATHS {
                return Err(invalid(format!(
                    "request has {} traversal paths, which exceeds the maximum of \
                     {MAXIMUM_TRAVERSAL_PATHS}",
                    traversal_paths.len()
                )));
            }
            for path in traversal_paths {
                path.validate()
                    .map_err(|error| invalid(error.to_string()))?;
            }
            Ok(())
        }
    }
}

/// Failed store connection, invalid traversal request, or failed query.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum HydrationError {
    Password { detail: String },
    Pool { detail: String },
    Traversal { detail: String },
    Query { detail: String },
}

impl fmt::Display for HydrationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Password { detail } => {
                write!(formatter, "store password unavailable: {detail}")
            }
            Self::Pool { detail } => write!(formatter, "store connection failed: {detail}"),
            Self::Traversal { detail } => write!(formatter, "invalid traversal: {detail}"),
            Self::Query { detail } => write!(formatter, "subgraph query failed: {detail}"),
        }
    }
}

impl Error for HydrationError {}
