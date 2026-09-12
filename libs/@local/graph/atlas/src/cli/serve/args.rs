use core::{num::NonZero, time::Duration};

use crate::{
    file::{generation::download::DownloadOptions, storage::path::FilePath},
    integrity::SecretHexBytesValueParser,
    serve::{
        delta::{DeltaFeedTaskOptions, DeltaPlacementTaskOptions, DeltaTaskOptions},
        document::{DocumentLimits, EdgesLimits, LocateLimits, TileLimits, TranslateLimits},
        runtime::manager::ManagerOptions,
        secret::ServeSecret,
    },
};

const DEFAULT_LIMITS: DocumentLimits = DocumentLimits { .. };
const DEFAULT_DELTA: DeltaTaskOptions = DeltaTaskOptions {
    feed: DeltaFeedTaskOptions {
        safety_lag: Duration::from_secs(60),
        tick_rate: Duration::from_secs(5),
    },
    placement: DeltaPlacementTaskOptions {
        tick_rate: Duration::from_secs(5),
        tries_workflow: 12,
        tries_database: 12,
        minimum_projection_interval: 1,
        max_pending: NonZero::new(1024).expect("the default backlog is positive"),
    },
};
const DEFAULT_MANAGER: ManagerOptions = ManagerOptions { .. };
const DEFAULT_DOWNLOAD: DownloadOptions = DownloadOptions { .. };

/// Per-request limits also published by the manifest.
#[derive(Debug, clap::Args)]
pub(super) struct LimitsArgs {
    /// Most `coloredTypeIds` one tile or locate request may carry.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_COLORED_TYPE_IDS",
        default_value_t = DEFAULT_LIMITS.tile.colored_type_ids,
    )]
    colored_type_ids: u32,

    /// Most tiles one edges request may list.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_EDGES_TILES",
        default_value_t = DEFAULT_LIMITS.edges.tiles,
    )]
    edges_tiles: u32,

    /// Most edges one response delivers before rank truncation.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_EDGES",
        default_value_t = DEFAULT_LIMITS.edges.edges,
    )]
    edges: u32,

    /// Most entity ids one translate request may carry.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_TRANSLATE_ENTITY_IDS",
        default_value_t = DEFAULT_LIMITS.translate.entity_ids,
    )]
    translate_entity_ids: u32,

    /// Most incident edges one locate response delivers before distance truncation.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_EDGES",
        default_value_t = DEFAULT_LIMITS.locate.edges,
    )]
    locate_edges: u32,

    /// Most properties one located source delivers in its trailer map.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_PROPERTIES",
        default_value_t = DEFAULT_LIMITS.locate.properties,
    )]
    locate_properties: u32,

    /// Most direct types one locate edge delivers.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_TYPE_IDS",
        default_value_t = DEFAULT_LIMITS.locate.link_type_ids,
    )]
    locate_link_type_ids: u32,

    /// Most properties one locate edge delivers.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_LIMIT_LOCATE_LINK_PROPERTIES",
        default_value_t = DEFAULT_LIMITS.locate.link_properties,
    )]
    locate_link_properties: u32,
}

impl From<LimitsArgs> for DocumentLimits {
    fn from(args: LimitsArgs) -> Self {
        Self {
            tile: TileLimits {
                colored_type_ids: args.colored_type_ids,
            },
            edges: EdgesLimits {
                tiles: args.edges_tiles,
                edges: args.edges,
            },
            locate: LocateLimits {
                colored_type_ids: args.colored_type_ids,
                edges: args.locate_edges,
                properties: args.locate_properties,
                link_type_ids: args.locate_link_type_ids,
                link_properties: args.locate_link_properties,
            },
            translate: TranslateLimits {
                entity_ids: args.translate_entity_ids,
            },
        }
    }
}

/// Feed and placement polling settings.
#[derive(Debug, clap::Args)]
pub(super) struct DeltaArgs {
    /// Seconds between feed and embedding-read polls.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_POLL_INTERVAL",
        default_value_t = NonZero::new(DEFAULT_DELTA.feed.tick_rate.as_secs())
            .expect("the default feed interval is positive"),
    )]
    delta_poll_interval: NonZero<u64>,

    /// Seconds a poll reads behind its watermark to cover commit visibility.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_SAFETY_LAG",
        default_value_t = DEFAULT_DELTA.feed.safety_lag.as_secs(),
    )]
    delta_safety_lag: u64,

    /// Embedding reads allowed before and after workflow submission.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_RETRY_POLLS",
        default_value_t = DEFAULT_DELTA.placement.tries_database,
    )]
    delta_retry_polls: u16,

    /// Maximum pending placement events, including results awaiting delivery.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_PLACEMENT_BACKLOG",
        default_value_t = DEFAULT_DELTA.placement.max_pending,
    )]
    delta_placement_backlog: NonZero<usize>,

    /// Minimum placement ticks between non-empty projection batches.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DELTA_MINIMUM_PROJECTION_INTERVAL",
        default_value_t = DEFAULT_DELTA.placement.minimum_projection_interval,
    )]
    delta_minimum_projection_interval: usize,

    /// Serve fit-time data without starting generation feeds.
    #[arg(long, env = "HASH_GRAPH_ATLAS_NO_DELTA")]
    pub no_delta: bool,
}

impl From<DeltaArgs> for DeltaTaskOptions {
    fn from(args: DeltaArgs) -> Self {
        let tick_rate = Duration::from_secs(args.delta_poll_interval.get());
        Self {
            feed: DeltaFeedTaskOptions {
                tick_rate,
                safety_lag: Duration::from_secs(args.delta_safety_lag),
            },
            placement: DeltaPlacementTaskOptions {
                tick_rate,
                tries_workflow: args.delta_retry_polls,
                tries_database: args.delta_retry_polls,
                minimum_projection_interval: args.delta_minimum_projection_interval,
                max_pending: args.delta_placement_backlog,
            },
        }
    }
}

/// Current-pointer polling and optional expired-directory removal.
#[derive(Debug, clap::Args)]
pub(super) struct ManagerArgs {
    /// Seconds between current-pointer reads and generation maintenance passes.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_GENERATION_POLL_INTERVAL",
        default_value_t = NonZero::new(DEFAULT_MANAGER.poll_interval.as_secs())
            .expect("the default maintenance interval is positive"),
    )]
    generation_poll_interval: NonZero<u64>,

    /// Remove expired generation directories after joining their feeds.
    #[arg(long, env = "HASH_GRAPH_ATLAS_UNLINK_EXPIRED_GENERATIONS")]
    unlink_expired_generations: bool,
}

impl From<ManagerArgs> for ManagerOptions {
    fn from(args: ManagerArgs) -> Self {
        Self {
            poll_interval: Duration::from_secs(args.generation_poll_interval.get()),
            unlink: args.unlink_expired_generations,
        }
    }
}

/// Source selection and polling cadence for acquiring generations.
#[derive(Debug, clap::Args)]
pub(super) struct DownloadArgs {
    /// Source prefix containing `generations/current` and `generations/active/`.
    ///
    /// Source polling is off by default. An S3 prefix requires a configured S3 client. Removing
    /// expired local generations remains opt-in through `--unlink-expired-generations`.
    #[arg(long, env = "HASH_GRAPH_ATLAS_DOWNLOAD")]
    download: Option<FilePath>,

    /// Seconds between source-current checks, one second by default.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_DOWNLOAD_POLL_INTERVAL",
        default_value_t = NonZero::new(DEFAULT_DOWNLOAD.poll_interval.as_secs())
            .expect("the default download poll interval is positive"),
    )]
    download_poll_interval: NonZero<u64>,
}

impl From<DownloadArgs> for (Option<FilePath>, DownloadOptions) {
    fn from(value: DownloadArgs) -> Self {
        (
            value.download,
            DownloadOptions {
                poll_interval: Duration::from_secs(value.download_poll_interval.get()),
            },
        )
    }
}

/// Generation selection and request-serving settings.
#[derive(Debug, clap::Args)]
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "see: BE-804, the whole CLI is currently a hot mess"
)]
pub struct ServeArgs {
    #[command(flatten)]
    pub(super) limits: LimitsArgs,

    #[command(flatten)]
    pub(super) delta: DeltaArgs,

    #[command(flatten)]
    pub(super) manager: ManagerArgs,

    #[command(flatten)]
    pub(super) download: DownloadArgs,

    /// The server secret behind the wire row-id codec.
    ///
    /// Required: exactly 64 lowercase hexadecimal characters. Generate one with
    /// `openssl rand -hex 32`. Keep it unchanged for every generation that has served.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_SECRET",
        hide_env_values = true,
        value_parser = SecretHexBytesValueParser::<ServeSecret, { size_of::<ServeSecret>() }>::new(),
    )]
    pub(super) secret: ServeSecret,
}

/// Supplies fixed serving parameters without reading CLI or environment configuration.
#[cfg(feature = "test-utils")]
pub(super) const fn integration_args(secret: ServeSecret) -> ServeArgs {
    use crate::math::nz;

    ServeArgs {
        limits: LimitsArgs {
            colored_type_ids: 4,
            edges_tiles: 16,
            edges: 256,
            translate_entity_ids: 64,
            locate_edges: 64,
            locate_properties: 16,
            locate_link_type_ids: 4,
            locate_link_properties: 16,
        },
        delta: DeltaArgs {
            delta_poll_interval: nz!(1),
            delta_safety_lag: 0,
            delta_retry_polls: 1,
            delta_placement_backlog: nz!(16),
            delta_minimum_projection_interval: 1,
            no_delta: true,
        },
        manager: ManagerArgs {
            generation_poll_interval: nz!(1),
            unlink_expired_generations: false,
        },
        download: DownloadArgs {
            download: None,
            download_poll_interval: nz!(1),
        },
        secret,
    }
}
