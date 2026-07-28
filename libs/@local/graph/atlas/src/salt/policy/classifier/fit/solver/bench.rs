//! Terminal-diagnosis probe over one published generation's frozen classifier corpus.
//!
//! The probe target (`examples/classifier_probe.rs`) reconstructs the classifier training set
//! of one published generation from its staged annotation artifacts, re-runs the bounded solver
//! over one fold subset under the generation's echoed fit configuration - with the
//! fold-assignment seed supplied externally, so any assignment can be probed - and dumps every
//! receipt: the terminal is the observation. Nothing here is API for consumers of the crate.
//!
//! Failures panic with the failing step's error: a probe run has no recovery path, and the
//! error is the diagnosis.
//!
//! # Reconstruction
//!
//! The staged `annotation-corpus.json` document replays through the production assembly under
//! the generation's echoed assembly configuration, with an embedder that answers every card
//! text from the staged embedding table by text hash and refuses to embed anything new.
//! Serializing the reassembled table must reproduce the staged array files byte-for-byte
//! (SHA-256 equality), so the probed inputs are the bytes the production fit consumed.

use camino::{Utf8Path, Utf8PathBuf};

use super::{
    super::{FitConfig, TrainingRow, grouped_folds},
    prepare::prepare,
    problem::ScaledProblem,
    solve::solve,
    work::WorkCounters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        array::ArrayFile,
        generation::{GenerationId, GenerationRoot},
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AlignedVecN, BoxedVecN, MatrixN, VecN},
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        fit::annotations::SuppliedAnnotations,
        policy::annotation::assembly::{AssembledCorpus, AssemblyConfig, assemble},
    },
};

/// Options of one probe run.
#[derive(Debug, Clone)]
pub struct ProbeOptions {
    /// Directory of the generation root holding the published generation.
    pub root: Utf8PathBuf,
    /// Hex identity of the published generation whose staged corpus is probed.
    pub generation: String,
}

/// The frozen generation inputs: document, staged table, and the echoed configuration.
struct Frozen {
    supplied: SuppliedAnnotations,
    embedder: TableEmbedder,
    document_verified: bool,
    staged_embeddings_digest: Sha256Digest,
    staged_hashes_digest: Sha256Digest,
    /// The generation's echoed assembly configuration; the replay binds it, never the
    /// compiled defaults.
    assembly: AssemblyConfig,
    /// The generation's echoed classifier fit configuration.
    fit: FitConfig,
}

impl Frozen {
    /// Opens the generation and loads the staged annotation artifacts.
    fn load(options: &ProbeOptions) -> Self {
        let root = GenerationRoot::new(options.root.clone()).expect("the generation root opens");
        let id: GenerationId = options
            .generation
            .parse()
            .expect("the generation id is a hex SHA-256");
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

        let supplied = SuppliedAnnotations::open(generation.path_of(&corpus_file.name))
            .expect("the staged corpus document parses");
        let mut hasher = Sha256::new();
        hasher.update(supplied.bytes());
        let corpus_digest = hasher.finalize();

        let embedder = TableEmbedder::load(
            repository.metadata.reproducibility.embedder,
            &generation.path_of(&hashes_file.name),
            &generation.path_of(&embeddings_file.name),
        );

        // A replay takes its configuration from the typed echo, never from the defaults
        // compiled into the replaying binary.
        let config = &repository.metadata.reproducibility.config;

        Self {
            supplied,
            embedder,
            document_verified: corpus_digest == corpus_file.hash,
            staged_embeddings_digest: embeddings_file.hash,
            staged_hashes_digest: hashes_file.hash,
            assembly: config.policy.assembly,
            fit: config.policy.classifier_fit,
        }
    }

    /// Replays the production assembly over the frozen document under the echoed assembly
    /// configuration and certifies the bytes.
    async fn reconstruct(&self) -> Reconstructed {
        let corpus = assemble(self.supplied.document(), &self.embedder, self.assembly)
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

        Reconstructed {
            embeddings_verified: embeddings_digest == self.staged_embeddings_digest,
            hashes_verified: hashes_digest == self.staged_hashes_digest,
            corpus,
        }
    }
}

/// The reassembled corpus beside its byte certificates.
struct Reconstructed {
    corpus: AssembledCorpus,
    embeddings_verified: bool,
    hashes_verified: bool,
}

impl Reconstructed {
    /// The trained prefix of the embedding table.
    fn trained_embeddings(&self) -> &[AlignedVecN<CANONICAL_DIMENSIONS>] {
        &self.corpus.table().rows()[..self.corpus.rows().len()]
    }

    /// The labelled training rows.
    const fn rows(&self) -> &[TrainingRow] {
        self.corpus.rows()
    }
}

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

/// Solves one fold subset solo and dumps every receipt: the terminal-diagnosis probe.
///
/// The solver runs under the generation's echoed fit configuration; the fold-assignment seed
/// is the caller's, so any assignment - the echoed one or another - can be probed.
///
/// # Panics
///
/// Panics when the generation cannot be opened or its staged corpus fails reconstruction; the
/// probed solve itself may fail - its terminal is the observation.
#[expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the probe's receipt dump is its whole output; terminals and outcomes format through \
              their debug forms"
)]
pub async fn probe_fold(options: &ProbeOptions, seed: u64, fold: usize) {
    let frozen = Frozen::load(options);
    assert!(
        frozen.document_verified,
        "the staged corpus document reproduces its recorded digest",
    );
    let reconstructed = frozen.reconstruct().await;
    assert!(
        reconstructed.embeddings_verified,
        "the reassembled embedding table reproduces the staged bytes",
    );
    assert!(
        reconstructed.hashes_verified,
        "the reassembled hash column reproduces the staged bytes",
    );
    let embeddings = reconstructed.trained_embeddings();
    let rows = reconstructed.rows();
    let config = frozen.fit;

    let folds = grouped_folds(rows, config.folds, seed).expect("the corpus has groups");
    let members: Vec<usize> = folds
        .iter()
        .enumerate()
        .filter(|(_, assigned)| **assigned != fold)
        .map(|(row, _)| row)
        .collect();

    let mut fold_embeddings = MatrixN::zeroed(members.len());
    let fold_rows_mut = fold_embeddings.rows_mut();
    let mut fold_training = Vec::with_capacity(members.len());
    for (position, &member) in members.iter().enumerate() {
        *fold_rows_mut[position].as_array_mut() = *embeddings[member].as_array();
        fold_training.push(rows[member]);
    }

    let mut counters = WorkCounters::default();
    let prepared = prepare(
        fold_embeddings.rows(),
        &fold_training,
        config.solver.preparation,
        &mut counters,
    )
    .expect("the fold corpus prepares");

    println!("fold {fold} at seed {seed}: {} member rows", members.len());
    println!(
        "total weight {} scaling range {:?} sum range {:?} adjustment {:e}",
        prepared.total_weight,
        prepared.evidence.scaling_range,
        prepared.evidence.sum_range,
        prepared.evidence.maximum_adjustment,
    );

    let problem = ScaledProblem {
        prepared,
        config: config.solver,
    };
    let run = solve(&problem, counters);

    println!("outcome: {:?}", run.outcome.as_ref().err());
    println!(
        "accepted objective {:.15e} zeta norm {:e} scaled gradient norm {:e}",
        run.accepted.objective,
        run.accepted.zeta.norm_squared().sqrt(),
        run.accepted.scaled_gradient.norm_squared().sqrt(),
    );
    println!(
        "control: radius {:e} rejections {} outers {}",
        run.control.radius,
        run.control.consecutive_rejections,
        run.control.outer_iterations_started,
    );
    for receipt in &run.receipts {
        println!(
            "outer {} radius {:e} objective {:.15e} gradient {:e}\n  outcome {:?}",
            receipt.outer_iteration,
            receipt.radius,
            receipt.objective,
            receipt.gradient_norm,
            receipt.outcome,
        );
    }
    println!("counters: {:?}", run.control.counters);
}
