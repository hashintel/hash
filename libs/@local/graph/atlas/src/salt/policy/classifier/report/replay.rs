//! Reconstruction of a frozen classifier corpus from staged annotation artifacts.
//!
//! The diagnostic tools (the fold probe, the classifier report) re-run classifier machinery over
//! the exact bytes a production fit consumed. The staged `annotation-corpus.json` document replays
//! through the production assembly under the generation's echoed assembly configuration. The
//! embedder answers every card text from the staged embedding table by text hash and refuses new
//! embeddings. Reconstruction requires that serializing the reassembled table reproduce the staged
//! array files' SHA-256 digests, which establishes, under the digest's collision resistance, that
//! the replayed inputs are the bytes the production fit consumed.
//!
//! The artifacts come from a published generation ([`Frozen::load`]) or from a directory of
//! supplied artifact files ([`Frozen::from_supplied`]). The supplied form exists for a fit that
//! cannot publish. A failing fit stages no generation for probing, but its input artifacts exist on
//! disk, and the table certification holds either way. Only a published generation records a
//! document digest for the replay to check.
//!
//! Failures panic with the failing step's error. A replay has no recovery path, and the error is
//! the diagnosis.

use camino::Utf8Path;
use hashql_core::id::IdSlice;

use super::super::fit::{FitConfig, TrainingRow};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        array::ArrayFile,
        generation::{GenerationId, GenerationRoot},
        repository::Artifact as _,
        salt::artifact,
    },
    identity::CardRow,
    integrity::Sha256Digest,
    math::{AlignedVecN, BoxedVecN, VecN},
    progress::NoProgress,
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        fit::annotations::SuppliedAnnotations,
        policy::annotation::{
            CardIdentity,
            assembly::{AssembledCorpus, AssemblyConfig, assemble},
        },
    },
};

/// A card embedder answering from a staged embedding table by text hash.
///
/// The fingerprint is the staged table's, and reassembly reproduces the table identity. A text
/// absent from the table panics, because the frozen corpus admits no new embeddings.
struct TableEmbedder {
    /// The staged table's embedding contract.
    fingerprint: EmbedderFingerprint,
    /// Each staged row's embedding under its card text's digest.
    rows: std::collections::HashMap<Sha256Digest, BoxedVecN<CANONICAL_DIMENSIONS>>,
}

impl TableEmbedder {
    /// Loads the staged hash column and embedding array into an answer table.
    fn load(fingerprint: EmbedderFingerprint, hashes: &Utf8Path, embeddings: &Utf8Path) -> Self {
        let hashes_file = ArrayFile::open(hashes).expect("the staged hash column opens");
        let embeddings_file =
            ArrayFile::open(embeddings).expect("the staged embedding array opens");

        let digests = hashes_file
            .digests()
            .expect("the staged hash column holds digest rows");
        let components = embeddings_file
            .f32_elements()
            .expect("the staged embedding array holds f32 rows");
        let (rows, remainder) = components.as_chunks::<CANONICAL_DIMENSIONS>();
        assert!(
            remainder.is_empty() && rows.len() == digests.len(),
            "the staged table is row-aligned",
        );

        let rows = digests
            .iter()
            .zip(rows)
            .map(|(&digest, row)| (digest, BoxedVecN::new(VecN::from_ref(row))))
            .collect();

        Self { fingerprint, rows }
    }
}

impl CardEmbedder for TableEmbedder {
    type Error = core::convert::Infallible;

    fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    /// Looks up every text's embedding by its SHA-256 digest.
    ///
    /// # Panics
    ///
    /// Panics when a text's digest is absent from the staged table.
    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        core::future::ready(Ok(texts
            .into_iter()
            .map(|text| {
                let hash = Sha256Digest::of(text);
                self.rows
                    .get(&hash)
                    .unwrap_or_else(|| {
                        panic!("card text {hash} is absent from the staged embedding table")
                    })
                    .clone()
            })
            .collect()))
    }
}

/// The document, staged table, and echoed configuration of one frozen generation.
pub(crate) struct Frozen {
    /// The validated corpus document with its exact wire bytes.
    supplied: SuppliedAnnotations,
    /// The embedder answering from the staged table.
    embedder: TableEmbedder,
    /// The manifest-recorded corpus document digest.
    ///
    /// A supplied-artifact corpus has no manifest and records none.
    staged_document_digest: Option<Sha256Digest>,
    /// The digest of the loaded document bytes.
    document_digest: Sha256Digest,
    /// The staged embedding array's digest, which the reassembled table must reproduce.
    staged_embeddings_digest: Sha256Digest,
    /// The staged hash column's digest, which the reassembled table must reproduce.
    staged_hashes_digest: Sha256Digest,
    /// The staged classifier artifact's recorded identity.
    ///
    /// A supplied-artifact corpus stages no classifier and carries none.
    staged_classifier_digest: Option<Sha256Digest>,
    /// The generation's echoed assembly configuration.
    ///
    /// The replay binds it, never the compiled defaults.
    assembly: AssemblyConfig,
    /// The generation's echoed classifier fit configuration.
    fit: FitConfig,
}

impl Frozen {
    /// Returns the staged classifier artifact's recorded identity.
    ///
    /// [`None`] for artifacts loaded through [`Self::from_supplied`], which come with no published
    /// generation and record no classifier.
    pub(crate) const fn staged_classifier_digest(&self) -> Option<Sha256Digest> {
        self.staged_classifier_digest
    }

    /// The generation's echoed classifier fit configuration.
    pub(crate) const fn fit(&self) -> FitConfig {
        self.fit
    }

    /// Opens the generation and loads the staged annotation artifacts.
    ///
    /// # Panics
    ///
    /// This panics when the loader cannot open the generation, or when the generation did not fit
    /// its classifier in-run (a supplied artifact stages no corpus).
    pub(crate) fn load(root: &GenerationRoot, id: GenerationId) -> Self {
        let generation = root.open(id).expect("the generation is published");
        let repository = generation.repository();

        let files = &repository.files;
        let corpus_file = files
            .annotation_corpus
            .as_ref()
            .expect("the generation fitted its classifier in-run");
        let embeddings_file = files
            .annotation_embeddings
            .as_ref()
            .expect("a fitted classifier stages its embedding table");
        let hashes_file = files
            .annotation_hashes
            .as_ref()
            .expect("a fitted classifier stages its hash column");

        let supplied = SuppliedAnnotations::open(generation.path_of(&corpus_file.name()))
            .expect("the staged corpus document parses");

        let embedder = TableEmbedder::load(
            repository.metadata.reproducibility.embedder,
            &generation.path_of(&hashes_file.name()),
            &generation.path_of(&embeddings_file.name()),
        );

        // A replay takes its configuration from the typed echo, never from the defaults
        // compiled into the replaying binary.
        let config = &repository.metadata.reproducibility.config;

        Self {
            document_digest: supplied.hash(),
            staged_document_digest: Some(corpus_file.hash()),
            supplied,
            embedder,
            staged_embeddings_digest: embeddings_file.hash(),
            staged_hashes_digest: hashes_file.hash(),
            staged_classifier_digest: Some(files.classifier.hash()),
            assembly: config.policy.assembly,
            fit: config.policy.classifier_fit,
        }
    }

    /// Opens supplied annotation artifacts directly, without a published generation.
    ///
    /// `directory` holds the three artifact files under their staged names:
    /// `annotation-corpus.json`, `annotation-embeddings.arr`, and `annotation-hashes.arr`. Supplied
    /// artifacts carry no configuration echo, and the assembly and fit configurations are
    /// therefore the compiled deployment defaults. [`reconstruct`](Self::reconstruct) still
    /// certifies the reassembled table against the supplied bytes, which pins the rendered card
    /// texts and their embeddings. The group budget, the one assembly setting, leaves those bytes
    /// unchanged: a default that differs from the producing fit's changes the validation groups
    /// without failing the certification.
    ///
    /// # Panics
    ///
    /// This panics when reading an artifact file fails or when the corpus document fails
    /// validation.
    pub(crate) fn from_supplied(directory: &Utf8Path) -> Self {
        let embeddings_path = directory.join(artifact::AnnotationEmbeddings::NAME.as_str());
        let hashes_path = directory.join(artifact::AnnotationHashes::NAME.as_str());

        let supplied =
            SuppliedAnnotations::open(directory.join(artifact::AnnotationCorpus::NAME.as_str()))
                .expect("the supplied corpus document parses");

        let embeddings_digest = Sha256Digest::of(
            std::fs::read(embeddings_path.as_std_path())
                .expect("the supplied embedding array reads"),
        );
        let hashes_digest = Sha256Digest::of(
            std::fs::read(hashes_path.as_std_path()).expect("the supplied hash column reads"),
        );

        // Supplied artifacts name no embedder. The fingerprint therefore derives from the supplied
        // table's own digest and labels the reassembled table's identity without entering the
        // certified bytes.
        let embedder = TableEmbedder::load(
            EmbedderFingerprint::new(embeddings_digest),
            &hashes_path,
            &embeddings_path,
        );

        Self {
            document_digest: supplied.hash(),
            staged_document_digest: None,
            supplied,
            embedder,
            staged_embeddings_digest: embeddings_digest,
            staged_hashes_digest: hashes_digest,
            staged_classifier_digest: None,
            assembly: AssemblyConfig { .. },
            fit: FitConfig { .. },
        }
    }

    /// Replays the production assembly over the frozen document and certifies every byte.
    ///
    /// # Panics
    ///
    /// This panics when a recorded document digest exists and the staged document does not
    /// reproduce it, when the document fails assembly, or when the reassembled table does not
    /// reproduce the staged bytes.
    pub(crate) async fn reconstruct(&self) -> Reconstructed {
        if let Some(staged) = self.staged_document_digest {
            assert!(
                self.document_digest == staged,
                "the staged corpus document reproduces its recorded digest (recorded {}, loaded \
                 {})",
                staged,
                self.document_digest,
            );
        }

        let corpus = assemble(
            self.supplied.document(),
            &self.embedder,
            self.assembly,
            &NoProgress,
        )
        .await
        .expect("the staged corpus document assembles");

        let embeddings_digest = corpus
            .table()
            .write_embeddings_into(std::io::sink())
            .expect("writing to a sink performs no fallible IO");
        let hashes_digest = corpus
            .table()
            .write_hashes_into(std::io::sink())
            .expect("writing to a sink performs no fallible IO");

        assert!(
            embeddings_digest == self.staged_embeddings_digest,
            "the reassembled embedding table reproduces the staged bytes (staged {}, reassembled \
             {})",
            self.staged_embeddings_digest,
            embeddings_digest,
        );
        assert!(
            hashes_digest == self.staged_hashes_digest,
            "the reassembled hash column reproduces the staged bytes (staged {}, reassembled {})",
            self.staged_hashes_digest,
            hashes_digest,
        );

        Reconstructed { corpus }
    }
}

/// The reassembled corpus, byte-certified against the staged artifacts.
pub(crate) struct Reconstructed {
    corpus: AssembledCorpus,
}

impl Reconstructed {
    /// The trained prefix of the embedding table.
    ///
    /// The trained rows lead the table, and the prefix keeps the corpus's card-row identities. The
    /// pin claims that domain over the table's domain-neutral rows.
    pub(crate) fn trained_embeddings(
        &self,
    ) -> &IdSlice<CardRow, AlignedVecN<CANONICAL_DIMENSIONS>> {
        IdSlice::from_raw(self.corpus.table().rows()).prefix(self.corpus.rows().bound())
    }

    /// The labelled training rows.
    pub(crate) const fn rows(&self) -> &IdSlice<CardRow, TrainingRow> {
        self.corpus.rows()
    }

    /// The card identities, row-aligned with [`rows`](Self::rows).
    pub(crate) const fn identities(&self) -> &IdSlice<CardRow, CardIdentity> {
        self.corpus.identities()
    }
}

#[cfg(test)]
mod tests {

    use std::fs;

    use camino::Utf8PathBuf;
    use serde_json::json;
    use zerocopy::IntoBytes as _;

    use super::Frozen;
    use crate::{
        dataset::CANONICAL_DIMENSIONS,
        file::array::{ArrayVariant, Dim, SizedArrayWriter},
        integrity::Sha256Digest,
        salt::embedding::EmbedderFingerprint,
    };

    /// The record hash the fixture card and vote carry.
    const DIGEST: &str = "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b";
    /// The versioned HASH type URL of the fixture card.
    const EMPLOYED_BY: &str = "https://hash.ai/@h/types/entity-type/employed-by/v/1";

    /// Composes a minimal contract-conforming corpus document.
    ///
    /// One hash card carrying one geometry vote.
    fn document() -> String {
        json!({
            "cards": [{
                "axes": {
                    "base_url": "https://hash.ai/@h/types/entity-type/employed-by/",
                    "family": "f-0007",
                    "inverse_of": [],
                    "publisher": "hash.ai/@h",
                },
                "content": {
                    "aliases": [],
                    "ancestors": [],
                    "constraints": {
                        "direction": "source -> target",
                        "distinct_values": null,
                        "single_value": null,
                        "symmetric": null,
                        "transitive": null,
                    },
                    "description": "The subject is employed by the object.",
                    "endpoint_constraints": [],
                    "examples": [],
                    "inverse": null,
                    "language": "en",
                    "slug": "employed-by",
                    "source_types": [{"description": null, "label": "Person"}],
                    "target_types": [{"description": null, "label": "Organization"}],
                    "title": "Employed By",
                },
                "flags": {"holdout": null, "prescreen_stratum": null, "shot_excluded": false},
                "identity": EMPLOYED_BY,
                "retrieved_at": null,
                "source": "hash",
                "source_record_hash": null,
                "votes": [{
                    "card_hash": DIGEST,
                    "effort": "high",
                    "framing": "S1xF1",
                    "model_pinned": "gpt-5.2",
                    "model_returned": "gpt-5.2-2026-05-01",
                    "prompt_pack_hash": DIGEST,
                    "provider": "amazon-bedrock",
                    "quantization": null,
                    "repeat_index": 0,
                    "rubric_version": "v2",
                    "seed": 7,
                    "temperature": 0.2,
                    "verdict": "proximal",
                }],
            }],
            "schema": "atlas-annotation-corpus/1",
            "sources": {"cards.jsonl": DIGEST},
        })
        .to_string()
    }

    /// A fresh scratch directory for one test's supplied artifacts.
    fn scratch(name: &str) -> Utf8PathBuf {
        let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is UTF-8")
            .join(format!(
                "hash-graph-atlas-classifier-replay-{}-{name}",
                std::process::id(),
            ));
        let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("the scratch directory should create");
        dir
    }

    /// Reads the three artifact files under their staged names and binds the supplied digests.
    ///
    /// The constructor reads the three artifact files under exactly the staged names its
    /// documentation promises, and binds the supplied bytes' digests as the staged identities.
    #[test]
    fn from_supplied_reads_the_staged_artifact_names() {
        let dir = scratch("staged-names");

        // The literals spell the constructor's documented human contract, and the constructor
        // joins the pinned artifact names. Either side drifting therefore fails this witness.
        let document = document();
        fs::write(dir.join("annotation-corpus.json"), &document)
            .expect("the corpus document should write");

        let row_hash = Sha256Digest::of("Employed By");
        let hashes_file = fs::File::create(dir.join("annotation-hashes.arr"))
            .expect("the hash column should create");
        let mut writer =
            SizedArrayWriter::new(hashes_file, ArrayVariant::U8, &[Dim::new(1), Dim::new(32)])
                .expect("the hash header should write");
        writer
            .write_rows(1, [row_hash].as_bytes())
            .expect("the digest row should write");
        writer.finish().expect("the hash column should seal");

        let embeddings_file = fs::File::create(dir.join("annotation-embeddings.arr"))
            .expect("the embedding array should create");
        let mut writer = SizedArrayWriter::new(
            embeddings_file,
            ArrayVariant::F32,
            &[Dim::new(1), Dim::new(CANONICAL_DIMENSIONS as u64)],
        )
        .expect("the embedding header should write");
        writer
            .write_rows(1, vec![0.5_f32; CANONICAL_DIMENSIONS].as_bytes())
            .expect("the embedding row should write");
        writer.finish().expect("the embedding array should seal");

        let frozen = Frozen::from_supplied(&dir);

        // A supplied corpus records no manifest digest, and the recorded-digest check therefore
        // has no second opinion to forge.
        assert_eq!(frozen.document_digest, Sha256Digest::of(&document));
        assert!(frozen.staged_document_digest.is_none());

        // The staged array identities are the raw file bytes' digests.
        assert_eq!(
            frozen.staged_hashes_digest,
            Sha256Digest::of(
                fs::read(dir.join("annotation-hashes.arr")).expect("the hash column should read"),
            ),
        );
        assert_eq!(
            frozen.staged_embeddings_digest,
            Sha256Digest::of(
                fs::read(dir.join("annotation-embeddings.arr"))
                    .expect("the embedding array should read"),
            ),
        );

        // Supplied artifacts stage no classifier and name no embedder: the fingerprint derives
        // from the supplied table's own digest.
        assert!(frozen.staged_classifier_digest().is_none());
        assert_eq!(
            frozen.embedder.fingerprint,
            EmbedderFingerprint::new(frozen.staged_embeddings_digest),
        );

        // The answer table holds exactly the staged row under its digest.
        assert_eq!(frozen.embedder.rows.len(), 1);
        assert!(frozen.embedder.rows.contains_key(&row_hash));
    }
}
