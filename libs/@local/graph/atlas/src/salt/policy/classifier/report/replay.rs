//! Reconstruction of a frozen classifier corpus from staged annotation artifacts.
//!
//! The lab instruments (the fold probe, the classifier report) re-run classifier machinery over the
//! exact bytes a production fit consumed. The staged `annotation-corpus.json` document replays
//! through the production assembly under the generation's echoed assembly configuration. The
//! embedder answers every card text from the staged embedding table by text hash and refuses new
//! embeddings. Reconstruction requires that serializing the reassembled table reproduce the staged
//! array files byte-for-byte under SHA-256 equality, which proves the replayed inputs are the bytes
//! the production fit consumed.
//!
//! The artifacts come from a published generation ([`Frozen::load`]) or from a directory of
//! supplied artifact files ([`Frozen::from_supplied`]). The supplied form exists for a fit that
//! cannot publish. A failing fit stages no generation for probing, but its input artifacts exist on
//! disk, and the byte certification holds either way.
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
    },
    identity::CardRow,
    integrity::{Sha256, Sha256Digest, Update as _},
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
/// The fingerprint is the staged table's, so reassembly reproduces the table identity; a text
/// absent from the table panics, because the frozen corpus admits no new embeddings.
struct TableEmbedder {
    fingerprint: EmbedderFingerprint,
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
    supplied: SuppliedAnnotations,
    embedder: TableEmbedder,
    staged_document_digest: Sha256Digest,
    document_digest: Sha256Digest,
    staged_embeddings_digest: Sha256Digest,
    staged_hashes_digest: Sha256Digest,
    /// The staged classifier artifact's recorded identity; a supplied-artifact corpus stages no
    /// classifier and carries none.
    staged_classifier_digest: Option<Sha256Digest>,
    /// The generation's echoed assembly configuration; the replay binds it, never the compiled
    /// defaults.
    assembly: AssemblyConfig,
    fit: FitConfig,
}

impl Frozen {
    /// The staged classifier artifact's recorded identity; [`None`] for supplied artifacts, which
    /// stage no classifier.
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
        let mut hasher = Sha256::new();
        hasher.update(supplied.bytes());
        let corpus_digest = hasher.finalize();

        let embedder = TableEmbedder::load(
            repository.metadata.reproducibility.embedder,
            &generation.path_of(&hashes_file.name()),
            &generation.path_of(&embeddings_file.name()),
        );

        // A replay takes its configuration from the typed echo, never from the defaults
        // compiled into the replaying binary.
        let config = &repository.metadata.reproducibility.config;

        Self {
            supplied,
            embedder,
            staged_document_digest: corpus_file.hash(),
            document_digest: corpus_digest,
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
    /// artifacts carry no configuration echo, so the assembly and fit configurations are the
    /// compiled deployment defaults; [`reconstruct`](Self::reconstruct) still certifies the
    /// reassembled table against the supplied bytes, so a default assembly that diverges from the
    /// one that produced the artifacts fails the byte certification instead of probing a different
    /// corpus.
    ///
    /// # Panics
    ///
    /// This panics when reading an artifact file fails or when the corpus document fails
    /// validation.
    pub(crate) fn from_supplied(directory: &Utf8Path) -> Self {
        let embeddings_path = directory.join("annotation-embeddings.arr");
        let hashes_path = directory.join("annotation-hashes.arr");

        let supplied = SuppliedAnnotations::open(directory.join("annotation-corpus.json"))
            .expect("the supplied corpus document parses");

        let embeddings_digest = Sha256Digest::of(
            std::fs::read(embeddings_path.as_std_path())
                .expect("the supplied embedding array reads"),
        );
        let hashes_digest = Sha256Digest::of(
            std::fs::read(hashes_path.as_std_path()).expect("the supplied hash column reads"),
        );

        // Supplied artifacts name no embedder, so the fingerprint derives from the supplied table's
        // own digest and labels the reassembled table's identity without entering the certified
        // bytes.
        let embedder = TableEmbedder::load(
            EmbedderFingerprint::new(embeddings_digest),
            &hashes_path,
            &embeddings_path,
        );

        Self {
            document_digest: supplied.hash(),
            staged_document_digest: supplied.hash(),
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
    /// This panics when the staged document does not reproduce its recorded digest, when it fails
    /// assembly, or when the reassembled table does not reproduce the staged bytes.
    pub(crate) async fn reconstruct(&self) -> Reconstructed {
        assert!(
            self.document_digest == self.staged_document_digest,
            "the staged corpus document reproduces its recorded digest (recorded {}, loaded {})",
            self.staged_document_digest,
            self.document_digest,
        );

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
    /// The trained rows lead the table, so the prefix keeps the corpus's card-row identities; the
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
