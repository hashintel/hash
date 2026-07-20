//! Backfilling the postings artifact into generations published
//! before the postings role existed.
//!
//! [`backfill_postings`] republishes one generation with the postings
//! role added: every original artifact carries over bit for bit (hard
//! links where the filesystem allows), the postings derive from the
//! dataset re-keyed onto the generation's identity tables, and the
//! metadata document gains exactly the entries a fresh fit records -
//! the file, its evidence, and the configuration echo. The result is
//! a NEW generation: a directory is named by the SHA-256 of its
//! metadata document, so the source generation stays untouched and
//! the backfilled one is distinguishable by identity alone. When the
//! source generation was the root's current one, the pointer moves to
//! the republished generation, completing the migration; otherwise
//! activation stays the operator's decision.
//!
//! The dataset observes the store as it is now, not as it was at fit
//! time. Entities added since the fit hold no row and are skipped;
//! entities removed since leave their rows without a type, so their
//! membership reads empty - the same reading serving gives an
//! unresolvable type; types outside the generation's ontology table
//! drop from memberships and parent lists. [`DriftCounts`] reports
//! every such divergence, so the operator decides whether the drift
//! is acceptable or the corpus wants a fresh fit. A dataset matching
//! the fitted corpus exactly reproduces the postings a fresh fit
//! publishes, entry for entry.

use core::{error::Error, fmt, pin::pin};
use std::{fs, io};

use camino::Utf8Path;
use futures::TryStreamExt as _;
use smallvec::SmallVec;

use super::{echo::PostingsConfigDef, role::Role};
use crate::{
    bitset::BitSet,
    dataset::{Dataset, Ontology, OntologyRowId},
    file::{
        array::{ArrayFile, OpenArrayError},
        generation::{
            ActivateError, CurrentError, GenerationId, GenerationRoot, METADATA_FILE, SealError,
            document_digest,
        },
        identity::read::{IdentityFile, OpenIdentityError},
        repository::{FileName, RepositoryFile},
        salt::{SaltRepository, metadata::PostingsEvidenceDef},
    },
    integrity::Sha256Digest,
    salt::{
        fit::prepare::identity::{InvalidIdentityFile, MappedIdentityTable},
        postings::build::{Postings, PostingsConfig, PostingsError, PostingsEvidence},
    },
};

/// Divergence between the dataset and the generation it backfills.
///
/// Every count is zero when the dataset names exactly the corpus the
/// generation was fitted over; any non-zero count means the store
/// moved since the fit and the postings describe the intersection.
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub(crate) struct DriftCounts {
    /// Dataset nodes the generation holds no row for: entities added
    /// since the fit, skipped.
    pub unmatched_nodes: u64,
    /// Generation rows the dataset no longer names: entities removed
    /// since the fit, published with empty membership.
    pub unfilled_rows: u64,
    /// Dataset types outside the generation's ontology table: types
    /// added since the fit, skipped.
    pub unmatched_types: u64,
    /// Generation types the dataset no longer names: types removed
    /// since the fit, published with no members and no parents.
    pub unfilled_types: u64,
    /// Node type references dropped because the named type lies
    /// outside the generation's ontology table.
    pub dropped_type_references: u64,
    /// Parent references dropped because the named parent lies
    /// outside the generation's ontology table.
    pub dropped_parent_references: u64,
}

impl DriftCounts {
    /// Returns whether the dataset matched the generation exactly.
    #[must_use]
    pub(crate) fn is_clean(&self) -> bool {
        *self == Self::default()
    }
}

/// One completed backfill.
#[derive(Debug, Copy, Clone)]
pub(crate) struct BackfillOutcome {
    /// The republished generation.
    pub published: GenerationId,
    /// Whether the root's pointer moved to the republished generation,
    /// which it does exactly when the source generation was current.
    pub activated: bool,
    /// The postings build's publish measurements, as recorded in the
    /// republished metadata.
    pub evidence: PostingsEvidence,
    /// The dataset-to-generation divergence observed while re-keying.
    pub drift: DriftCounts,
}

/// Backfilling a generation failed.
///
/// Every failure leaves the source generation untouched; the staging
/// directory of a failed attempt is dot-prefixed transient state.
#[derive(Debug)]
pub(crate) enum BackfillError<E> {
    /// The dataset failed while streaming.
    Dataset(E),
    /// A file operation failed.
    Io(io::Error),
    /// The source generation is not published in this root.
    Unpublished(GenerationId),
    /// The source metadata document does not hash to the generation's
    /// identity.
    Identity {
        /// The claimed identity.
        id: GenerationId,
        /// The digest of the document as read.
        actual: Sha256Digest,
    },
    /// The source metadata document is not JSON, or the spliced
    /// document does not parse as a repository.
    Document(serde_json::Error),
    /// The source generation already carries the postings role.
    AlreadyBackfilled(GenerationId),
    /// The source document's file roster misses an entry or shapes it
    /// without a name.
    Roster {
        /// The roster field that failed to read.
        field: String,
    },
    /// An identity table failed to open.
    IdentityFile(OpenIdentityError),
    /// An identity table failed to validate.
    IdentityTable(InvalidIdentityFile),
    /// The gather column failed to open.
    Array(OpenArrayError),
    /// The gather column does not hold `u32` elements.
    Column,
    /// The identity table and the gather column disagree on the row
    /// count.
    Rows {
        /// Rows of the node identity table.
        nodes: u64,
        /// Entries of the gather column.
        positions: u64,
    },
    /// The postings build rejected the re-keyed columns.
    Postings(PostingsError),
    /// The spliced document lost or reshaped a field: the typed
    /// round-trip did not reproduce it.
    Splice,
    /// Sealing the republished generation failed.
    Seal(SealError),
    /// Reading the root's pointer failed.
    Current(CurrentError),
    /// Moving the root's pointer failed.
    Activate(ActivateError),
}

impl<E> fmt::Display for BackfillError<E>
where
    E: fmt::Display,
{
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Dataset(error) => write!(formatter, "the dataset failed: {error}"),
            Self::Io(error) => write!(formatter, "a file operation failed: {error}"),
            Self::Unpublished(id) => {
                write!(formatter, "generation {id} is not published in this root")
            }
            Self::Identity { id, actual } => write!(
                formatter,
                "the metadata document hashes to {actual}, not to the claimed identity {id}",
            ),
            Self::Document(error) => {
                write!(formatter, "the metadata document failed to parse: {error}")
            }
            Self::AlreadyBackfilled(id) => {
                write!(
                    formatter,
                    "generation {id} already carries the postings role"
                )
            }
            Self::Roster { field } => write!(
                formatter,
                "the document's file roster holds no readable `{field}` entry",
            ),
            Self::IdentityFile(error) => {
                write!(formatter, "an identity table failed to open: {error}")
            }
            Self::IdentityTable(error) => {
                write!(formatter, "an identity table failed to validate: {error}")
            }
            Self::Array(error) => write!(formatter, "the gather column failed to open: {error}"),
            Self::Column => write!(formatter, "the gather column does not hold u32 elements"),
            Self::Rows { nodes, positions } => write!(
                formatter,
                "the node identity table holds {nodes} rows where the gather column holds \
                 {positions}",
            ),
            Self::Postings(error) => {
                write!(formatter, "the postings build failed: {error}")
            }
            Self::Splice => write!(
                formatter,
                "the spliced document did not survive the typed round-trip",
            ),
            Self::Seal(error) => write!(formatter, "sealing the generation failed: {error}"),
            Self::Current(error) => write!(formatter, "reading the root pointer failed: {error}"),
            Self::Activate(error) => write!(formatter, "moving the root pointer failed: {error}"),
        }
    }
}

impl<E> Error for BackfillError<E>
where
    E: Error + 'static,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Dataset(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Document(error) => Some(error),
            Self::IdentityFile(error) => Some(error),
            Self::IdentityTable(error) => Some(error),
            Self::Array(error) => Some(error),
            Self::Postings(error) => Some(error),
            Self::Seal(error) => Some(error),
            Self::Current(error) => Some(error),
            Self::Activate(error) => Some(error),
            Self::Unpublished(_)
            | Self::Identity { .. }
            | Self::AlreadyBackfilled(_)
            | Self::Roster { .. }
            | Self::Column
            | Self::Rows { .. }
            | Self::Splice => None,
        }
    }
}

/// Serialization bridge for the evidence splice: the shadow serializes
/// the spliced value exactly as the metadata document records it.
#[derive(serde::Serialize)]
struct EvidenceSplice {
    #[serde(with = "PostingsEvidenceDef")]
    postings: PostingsEvidence,
}

/// Serialization bridge for the configuration splice.
#[derive(serde::Serialize)]
struct ConfigSplice {
    #[serde(with = "PostingsConfigDef")]
    postings: PostingsConfig,
}

/// Republishes generation `id` with the postings role backfilled.
///
/// Derives the postings from the dataset re-keyed onto the
/// generation's identity tables, carries every original artifact over
/// bit for bit, and seals the patched metadata document as a new
/// generation in the same root. Moves the root's pointer exactly when
/// the source generation was current. The source generation is never
/// modified.
///
/// # Errors
///
/// Returns an error when the source generation is missing, corrupt,
/// or already carries the postings role; when the dataset fails;
/// when the re-keyed columns violate the postings build contract; and
/// when staging, sealing, or activating fails. No failure modifies
/// the source generation.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
#[tracing::instrument(skip_all, fields(generation = %id))]
pub(crate) async fn backfill_postings<D>(
    root: &GenerationRoot,
    id: GenerationId,
    dataset: &D,
    config: PostingsConfig,
) -> Result<BackfillOutcome, BackfillError<D::Error>>
where
    D: Dataset,
{
    let path = root.generation_path(id);
    let (document, roster) = read_source(&path, id)?;

    let node_table = MappedIdentityTable::<D::NodeId>::new(
        IdentityFile::open(path.join(artifact_name(&document, "node_identities")?))
            .map_err(BackfillError::IdentityFile)?,
    )
    .map_err(BackfillError::IdentityTable)?;
    let ontology_table = MappedIdentityTable::<D::OntologyId>::new(
        IdentityFile::open(path.join(artifact_name(&document, "ontology_identities")?))
            .map_err(BackfillError::IdentityFile)?,
    )
    .map_err(BackfillError::IdentityTable)?;
    let gather = ArrayFile::open(path.join(artifact_name(&document, "row_of_position")?))
        .map_err(BackfillError::Array)?;
    let row_of_position = gather.u32_elements().ok_or(BackfillError::Column)?;

    let points = node_table.len();
    if row_of_position.len() as u64 != points {
        return Err(BackfillError::Rows {
            nodes: points,
            positions: row_of_position.len() as u64,
        });
    }

    let mut drift = DriftCounts::default();
    let (parents, of_dataset) = rekey_ontology(dataset, &ontology_table, &mut drift).await?;
    let types = rekey_node_types(dataset, &node_table, &of_dataset, &mut drift).await?;
    tracing::info!(
        unmatched_nodes = drift.unmatched_nodes,
        unfilled_rows = drift.unfilled_rows,
        unmatched_types = drift.unmatched_types,
        unfilled_types = drift.unfilled_types,
        dropped_type_references = drift.dropped_type_references,
        dropped_parent_references = drift.dropped_parent_references,
        "re-keyed the dataset onto the generation",
    );

    let postings = Postings::build(&types, row_of_position, &parents, config)
        .map_err(BackfillError::Postings)?;
    let evidence = postings.evidence();

    let published = republish(root, &path, &roster, &postings, document, config, evidence)?;

    let activated = root.current().map_err(BackfillError::Current)? == Some(id);
    if activated {
        root.activate(published).map_err(BackfillError::Activate)?;
    }

    Ok(BackfillOutcome {
        published,
        activated,
        evidence,
        drift,
    })
}

/// Reads and verifies the source generation's raw document and the
/// roster of artifacts that carry over.
///
/// The typed parser demands the postings entries this tool exists to
/// add, so the source document reads as JSON, verified against the
/// identity the same way a typed open is.
fn read_source<E>(
    path: &Utf8Path,
    id: GenerationId,
) -> Result<(serde_json::Value, Vec<FileName>), BackfillError<E>> {
    let bytes = match fs::read(path.join(METADATA_FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(BackfillError::Unpublished(id));
        }
        Err(error) => return Err(BackfillError::Io(error)),
    };
    let actual = document_digest(&bytes);
    if actual != id.digest() {
        return Err(BackfillError::Identity { id, actual });
    }
    let document: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(BackfillError::Document)?;

    let files = document
        .get("files")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| BackfillError::Roster {
            field: "files".to_owned(),
        })?;
    if files.get("postings").is_some_and(|value| !value.is_null()) {
        return Err(BackfillError::AlreadyBackfilled(id));
    }

    let mut roster = Vec::new();
    for (field, value) in files {
        if value.is_null() {
            continue;
        }
        let name = value
            .get("name")
            .and_then(serde_json::Value::as_str)
            .and_then(|name| FileName::new(name.to_owned()))
            .ok_or_else(|| BackfillError::Roster {
                field: field.clone(),
            })?;
        roster.push(name);
    }

    Ok((document, roster))
}

/// Reads one artifact's file name off the document's roster.
fn artifact_name<'document, E>(
    document: &'document serde_json::Value,
    field: &str,
) -> Result<&'document str, BackfillError<E>> {
    document
        .get("files")
        .and_then(|files| files.get(field))
        .and_then(|value| value.get("name"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| BackfillError::Roster {
            field: field.to_owned(),
        })
}

/// Stages and seals the republished generation: the original
/// artifacts carry over bit for bit, the postings write fresh, and
/// the spliced document seals the set under its new identity.
#[expect(
    clippy::significant_drop_tightening,
    reason = "the staging directory must live until seal consumes it; its drop is the \
              failure-path cleanup"
)]
fn republish<E>(
    root: &GenerationRoot,
    path: &Utf8Path,
    roster: &[FileName],
    postings: &Postings,
    mut document: serde_json::Value,
    config: PostingsConfig,
    evidence: PostingsEvidence,
) -> Result<GenerationId, BackfillError<E>> {
    let staged = root.stage().map_err(BackfillError::Io)?;
    for name in roster {
        carry(&path.join(name.as_str()), &staged.path_of(name)).map_err(BackfillError::Io)?;
    }
    let name = Role::Postings.file_name();
    let hash = postings
        .write_into(staged.create(&name).map_err(BackfillError::Io)?)
        .map_err(BackfillError::Io)?;

    splice(
        &mut document,
        &["files"],
        "postings",
        serde_json::to_value(RepositoryFile { name, hash }).map_err(BackfillError::Document)?,
    )?;
    splice(
        &mut document,
        &["metadata", "evidence"],
        "postings",
        field(
            serde_json::to_value(EvidenceSplice { postings: evidence })
                .map_err(BackfillError::Document)?,
        )?,
    )?;
    splice(
        &mut document,
        &["metadata", "reproducibility", "config"],
        "postings",
        field(
            serde_json::to_value(ConfigSplice { postings: config })
                .map_err(BackfillError::Document)?,
        )?,
    )?;

    // The typed round-trip is the splice's proof: the current parser
    // accepts the document and reproduces it field for field, so the
    // republished generation is one a current reader speaks. The
    // comparison goes through text on both sides - a float re-parses
    // to its canonical shortest representation either way, where a
    // value-level comparison would widen `f32` fields through `f64`
    // and never compare equal.
    let repository: SaltRepository =
        serde_json::from_value(document.clone()).map_err(BackfillError::Document)?;
    let round_trip: serde_json::Value =
        serde_json::from_slice(&serde_json::to_vec(&repository).map_err(BackfillError::Document)?)
            .map_err(BackfillError::Document)?;
    if round_trip != document {
        return Err(BackfillError::Splice);
    }

    let published = staged.seal(&repository).map_err(BackfillError::Seal)?;
    Ok(published.id())
}

/// Drains the ontology stream and re-keys it onto the generation's
/// type table.
///
/// Returns the generation-rowed parent column and the dataset-row to
/// generation-row map the node re-keying reads.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn rekey_ontology<D>(
    dataset: &D,
    table: &MappedIdentityTable<D::OntologyId>,
    drift: &mut DriftCounts,
) -> Result<(Vec<SmallVec<OntologyRowId, 2>>, Vec<Option<u64>>), BackfillError<D::Error>>
where
    D: Dataset,
{
    let mut drained: Vec<Ontology<D::OntologyId>> = Vec::new();
    let mut stream = pin!(dataset.ontology());
    while let Some(entry) = stream.try_next().await.map_err(BackfillError::Dataset)? {
        drained.push(entry);
    }

    // The stream is self-referential, so the map completes before any
    // parent list re-keys through it.
    let of_dataset: Vec<Option<u64>> = drained
        .iter()
        .map(|ontology| table.row_of(ontology.id))
        .collect();
    drift.unmatched_types = of_dataset.iter().filter(|slot| slot.is_none()).count() as u64;

    let domain = usize::try_from(table.len()).expect("a type table fits the address space");
    let mut parents: Vec<SmallVec<OntologyRowId, 2>> = vec![SmallVec::new(); domain];
    let mut filled = BitSet::new(domain);
    for (ontology, slot) in drained.iter().zip(&of_dataset) {
        let Some(row) = *slot else {
            continue;
        };
        let mut list: SmallVec<OntologyRowId, 2> = ontology
            .parents
            .iter()
            .filter_map(|parent| {
                let index = usize::try_from(parent.get())
                    .expect("a dataset ontology row fits the address space");
                let mapped = of_dataset[index];
                if mapped.is_none() {
                    drift.dropped_parent_references += 1;
                }
                mapped.map(OntologyRowId::new)
            })
            .collect();
        list.sort_unstable();
        list.dedup();
        let index = usize::try_from(row).expect("a type row fits the address space");
        parents[index] = list;
        filled.insert(index);
    }
    drift.unfilled_types = (domain - filled.count()) as u64;

    Ok((parents, of_dataset))
}

/// Drains the node stream and re-keys each node's direct types onto
/// the generation's rows.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn rekey_node_types<D>(
    dataset: &D,
    table: &MappedIdentityTable<D::NodeId>,
    of_dataset: &[Option<u64>],
    drift: &mut DriftCounts,
) -> Result<Vec<SmallVec<OntologyRowId, 2>>, BackfillError<D::Error>>
where
    D: Dataset,
{
    let rows = usize::try_from(table.len()).expect("a node table fits the address space");
    let mut types: Vec<SmallVec<OntologyRowId, 2>> = vec![SmallVec::new(); rows];
    let mut filled = BitSet::new(rows);

    let mut stream = pin!(dataset.nodes());
    while let Some(node) = stream.try_next().await.map_err(BackfillError::Dataset)? {
        let Some(row) = table.row_of(node.id) else {
            drift.unmatched_nodes += 1;
            continue;
        };
        let mut list: SmallVec<OntologyRowId, 2> = node
            .ontology
            .iter()
            .filter_map(|direct| {
                let index = usize::try_from(direct.get())
                    .expect("a dataset ontology row fits the address space");
                let mapped = of_dataset[index];
                if mapped.is_none() {
                    drift.dropped_type_references += 1;
                }
                mapped.map(OntologyRowId::new)
            })
            .collect();
        list.sort_unstable();
        list.dedup();
        let index = usize::try_from(row).expect("a node row fits the address space");
        types[index] = list;
        filled.insert(index);
    }
    drift.unfilled_rows = (rows - filled.count()) as u64;

    Ok(types)
}

/// Carries one artifact into the staging directory.
///
/// A hard link preserves the bytes without copying them; a root
/// spanning filesystems cannot link, so the fallback copy pays the
/// bytes for the same bit-for-bit result.
fn carry(source: &Utf8Path, target: &Utf8Path) -> io::Result<()> {
    match fs::hard_link(source, target) {
        Ok(()) => Ok(()),
        Err(_) => fs::copy(source, target).map(drop),
    }
}

/// Inserts `value` at `parents`/`key`, requiring every parent to
/// already exist as an object.
fn splice<E>(
    document: &mut serde_json::Value,
    parents: &[&str],
    key: &str,
    value: serde_json::Value,
) -> Result<(), BackfillError<E>> {
    let mut cursor = &mut *document;
    for step in parents {
        cursor = cursor.get_mut(step).ok_or(BackfillError::Splice)?;
    }
    cursor
        .as_object_mut()
        .ok_or(BackfillError::Splice)?
        .insert(key.to_owned(), value);
    Ok(())
}

/// Unwraps a single-field bridge serialization to the field's value.
fn field<E>(value: serde_json::Value) -> Result<serde_json::Value, BackfillError<E>> {
    if let serde_json::Value::Object(mut map) = value
        && map.len() == 1
    {
        Ok(map
            .values_mut()
            .next()
            .expect("the map holds exactly one value")
            .take())
    } else {
        Err(BackfillError::Splice)
    }
}
