use core::{error::Error, fmt};

/// Failure while extracting one bounded current PostgreSQL snapshot.
#[derive(Debug)]
pub(in crate::salt_fit) enum PostgresExtractionError {
    Postgres(tokio_postgres::Error),
    Store(String),
    Resource(crate::salt_fit::resource::FitResourceError),
    EmptyCorpus,
    EmptyLinkCorpus,
    CorpusTooSmall {
        actual: usize,
        minimum: usize,
    },
    Capacity {
        resource: &'static str,
        actual: usize,
        maximum: usize,
    },
    InvalidEmbedding {
        row: usize,
        reason: &'static str,
    },
    InvalidEntityType {
        value: String,
    },
    InvalidConfidence,
    MissingEndpoint,
    MissingLinkType,
    AmbiguousLinkTypes {
        count: usize,
    },
    AmbiguousLinkEndpoints,
    Allocation {
        resource: &'static str,
        elements: usize,
    },
}

impl fmt::Display for PostgresExtractionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Postgres(_) => formatter.write_str("PostgreSQL extraction query failed"),
            Self::Store(detail) => write!(formatter, "HASH Graph store setup failed: {detail}"),
            Self::Resource(error) => error.fmt(formatter),
            Self::EmptyCorpus => formatter.write_str("the current snapshot has no usable entities"),
            Self::EmptyLinkCorpus => {
                formatter.write_str("the complete point corpus induces no current links")
            }
            Self::CorpusTooSmall { actual, minimum } => write!(
                formatter,
                "the current snapshot has {actual} usable entities; M0 requires at least {minimum}"
            ),
            Self::Capacity {
                resource,
                actual,
                maximum,
            } => write!(
                formatter,
                "current snapshot has {actual} {resource}, exceeding the configured maximum \
                 {maximum}"
            ),
            Self::InvalidEmbedding { row, reason } => {
                write!(formatter, "embedding row {row} is invalid: {reason}")
            }
            Self::InvalidEntityType { value } => {
                write!(
                    formatter,
                    "database returned invalid entity type URL {value}"
                )
            }
            Self::InvalidConfidence => {
                formatter.write_str("database returned confidence outside the closed unit interval")
            }
            Self::MissingEndpoint => {
                formatter.write_str("relation query returned an endpoint outside the corpus")
            }
            Self::MissingLinkType => {
                formatter.write_str("relation query returned no link-resolving direct type")
            }
            Self::AmbiguousLinkTypes { count } => write!(
                formatter,
                "relation query returned {count} Link-derived direct types for one link entity"
            ),
            Self::AmbiguousLinkEndpoints => formatter.write_str(
                "a link entity resolved to multiple endpoint pairs in the current snapshot",
            ),
            Self::Allocation { resource, elements } => write!(
                formatter,
                "could not reserve {elements} elements for extracted {resource}"
            ),
        }
    }
}

impl Error for PostgresExtractionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Postgres(source) => Some(source),
            Self::Resource(source) => Some(source),
            Self::Store(_)
            | Self::EmptyCorpus
            | Self::EmptyLinkCorpus
            | Self::CorpusTooSmall { .. }
            | Self::Capacity { .. }
            | Self::InvalidEmbedding { .. }
            | Self::InvalidEntityType { .. }
            | Self::InvalidConfidence
            | Self::MissingEndpoint
            | Self::MissingLinkType
            | Self::AmbiguousLinkTypes { .. }
            | Self::AmbiguousLinkEndpoints
            | Self::Allocation { .. } => None,
        }
    }
}

impl From<tokio_postgres::Error> for PostgresExtractionError {
    fn from(error: tokio_postgres::Error) -> Self {
        Self::Postgres(error)
    }
}

impl From<crate::salt_fit::resource::FitResourceError> for PostgresExtractionError {
    fn from(error: crate::salt_fit::resource::FitResourceError) -> Self {
        Self::Resource(error)
    }
}
