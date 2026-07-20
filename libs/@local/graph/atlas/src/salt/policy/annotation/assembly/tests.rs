use core::{
    future::{Future, ready},
    sync::atomic::{AtomicU64, Ordering},
};
use std::path::PathBuf;

use serde_json::{Value, json};

use super::{AssemblyConfig, AssemblyError, HoldoutClass, assemble};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::array::ArrayFile,
    integrity::{Sha256, Update as _},
    math::BoxedVecN,
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        policy::{annotation::AnnotationCorpus, classifier::TrainingSet},
    },
};

const DIGEST: &str = "6cf1a86693da441a9c86ed4dcf2bcdad6cf1a86693da441a9c86ed4dcf2bcdad";

const PART_OF: &str = "http://www.wikidata.org/entity/P361";
const HAS_PART: &str = "http://www.wikidata.org/entity/P527";
const ALPHA: &str = "http://www.wikidata.org/entity/P600";
const BETA: &str = "http://www.wikidata.org/entity/P601";
const GAMMA: &str = "http://www.wikidata.org/entity/P602";
const ALL_UNCLEAR: &str = "http://www.wikidata.org/entity/P700";
const SHOT: &str = "http://www.wikidata.org/entity/P800";
const HOLDOUT: &str = "http://www.wikidata.org/entity/P900";
const EMPLOYED_BY: &str = "https://hash.ai/@h/types/entity-type/employed-by/v/1";

/// A uniquely named file in the system temporary directory, removed
/// on drop.
struct TempFile {
    path: PathBuf,
}

impl TempFile {
    fn create(bytes: &[u8]) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);

        let path = std::env::temp_dir().join(format!(
            "atlas-assembly-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
        ));
        std::fs::write(&path, bytes).expect("the temporary file should be writable");

        Self { path }
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        drop(std::fs::remove_file(&self.path));
    }
}

/// A provider returning a programmed unit vector per card title.
struct ProgrammedEmbedder;

impl ProgrammedEmbedder {
    /// The polar angle of each card's programmed embedding.
    ///
    /// Alpha and beta lie `0.05` radians apart, within the default
    /// near-duplicate threshold (`1 - cos(0.05) ~= 1.25e-3`); beta and
    /// gamma lie `0.10` radians apart, outside it
    /// (`1 - cos(0.10) ~= 5.0e-3`).
    fn angle(title: &str) -> f32 {
        match title {
            "part of" => 0.0,
            "has part" => 0.3,
            "alpha" => 1.0,
            "beta" => 1.05,
            "gamma" => 1.15,
            "Employed By" => 2.0,
            "holdout" => 2.5,
            _ => panic!("no programmed embedding for the card titled {title}"),
        }
    }
}

impl CardEmbedder for ProgrammedEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        let mut hasher = Sha256::new();
        hasher.update(b"programmed embedder");
        EmbedderFingerprint::new(hasher.finalize())
    }

    fn embed(
        &self,
        texts: impl IntoIterator<Item: AsRef<str> + Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .map(|text| {
                let title = text
                    .as_ref()
                    .lines()
                    .next()
                    .and_then(|line| line.strip_prefix("Relation: "))
                    .expect("a rendered card leads with its Relation line")
                    .to_owned();

                let angle = Self::angle(&title);
                let mut vector = BoxedVecN::zero();
                vector.as_array_mut()[0] = angle.cos();
                vector.as_array_mut()[1] = angle.sin();
                vector
            })
            .collect()))
    }
}

/// Composes one vote with conforming provenance.
fn vote(verdict: &str) -> Value {
    json!({
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
        "verdict": verdict,
    })
}

/// Composes a wikidata card with sparse content and blank axes.
fn wikidata_card(identity: &str, title: &str, family: &str, votes: &[Value]) -> Value {
    json!({
        "axes": {
            "base_url": identity,
            "family": family,
            "inverse_of": [],
            "publisher": "shared",
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
            "description": null,
            "endpoint_constraints": [],
            "examples": [],
            "inverse": null,
            "language": "en",
            "slug": title,
            "source_types": [],
            "target_types": [],
            "title": title,
        },
        "flags": {"holdout": null, "prescreen_stratum": null, "shot_excluded": false},
        "identity": identity,
        "retrieved_at": "Sat, 11 Jul 2026 21:49:25 GMT",
        "source": "wikidata",
        "source_record_hash": DIGEST,
        "votes": votes,
    })
}

/// Composes the full-featured wikidata card behind the template
/// certificate.
fn rich_card() -> Value {
    let mut card = wikidata_card(
        PART_OF,
        "part of",
        "f-361",
        &[
            vote("overlay"),
            vote("overlay"),
            vote("overlay"),
            vote("proximal"),
            vote("unclear"),
            vote("unclear"),
            vote("abstain"),
        ],
    );
    card["axes"]["inverse_of"] = json!([HAS_PART]);
    card["content"]["description"] = json!("the item is a component of the whole.");
    card["content"]["aliases"] = json!(["component of", "within"]);
    card["content"]["inverse"] = json!({
        "description": "the whole has this part. Deprecated alias.",
        "label": "has part",
    });
    card["content"]["ancestors"] = json!([{"description": null, "label": "relation"}]);
    card["content"]["source_types"] =
        json!([{"description": "a creative work", "label": "artwork"}]);
    card["content"]["target_types"] = json!([{"description": null, "label": "collection"}]);
    card["content"]["constraints"]["symmetric"] = json!(false);
    card["content"]["constraints"]["transitive"] = json!(true);
    card["content"]["examples"] = json!([
        {"object_label": "car", "stratum_label": "mechanical", "subject_label": "engine"},
        {"object_label": "car", "stratum_label": null, "subject_label": "wheel"},
    ]);
    card["content"]["slug"] = json!("part-of");
    card
}

/// Composes the hash card whose lone simple pair the template hoists.
fn simple_pair_card() -> Value {
    json!({
        "axes": {
            "base_url": "https://hash.ai/@h/types/entity-type/employed-by/",
            "family": "f-hash",
            "inverse_of": [],
            "publisher": "shared",
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
            "description": null,
            "endpoint_constraints": [{
                "maximum_targets": 1,
                "minimum_targets": null,
                "source_type": {"description": null, "label": "Person"},
                "target_types": [{"description": null, "label": "Organization"}],
            }],
            "examples": [],
            "inverse": null,
            "language": "en",
            "slug": "employed-by",
            "source_types": [],
            "target_types": [],
            "title": "Employed By",
        },
        "flags": {"holdout": null, "prescreen_stratum": null, "shot_excluded": false},
        "identity": EMPLOYED_BY,
        "retrieved_at": null,
        "source": "hash",
        "source_record_hash": null,
        "votes": [vote("proximal"), vote("proximal")],
    })
}

/// Composes the corpus document behind the assembly certificates.
fn document(cards: &[Value]) -> String {
    serde_json::to_string_pretty(&json!({
        "cards": cards,
        "schema": "atlas-annotation-corpus/1",
        "sources": {"cards.jsonl": DIGEST},
    }))
    .expect("the fixture document serializes")
}

/// Parses the nine-card fixture corpus exercising every policy path.
fn fixture_corpus() -> AnnotationCorpus {
    let mut shot = wikidata_card(SHOT, "shot", "f-800", &[]);
    shot["flags"]["shot_excluded"] = json!(true);

    let mut holdout = wikidata_card(
        HOLDOUT,
        "holdout",
        "f-900",
        &[vote("overlay"), vote("overlay")],
    );
    holdout["flags"]["holdout"] = json!("proximal");

    let bytes = document(&[
        rich_card(),
        wikidata_card(
            HAS_PART,
            "has part",
            "f-527",
            &[vote("coincident"), vote("coincident")],
        ),
        wikidata_card(ALPHA, "alpha", "f-600", &[vote("overlay")]),
        wikidata_card(BETA, "beta", "f-601", &[vote("overlay")]),
        wikidata_card(GAMMA, "gamma", "f-602", &[vote("overlay")]),
        wikidata_card(
            ALL_UNCLEAR,
            "all unclear",
            "f-700",
            &[vote("unclear"), vote("unclear")],
        ),
        shot,
        holdout,
        simple_pair_card(),
    ]);

    AnnotationCorpus::from_slice(bytes.as_bytes()).expect("the fixture corpus admits")
}

/// Hashes one group's member identities the way assembly labels
/// groups.
fn group_digest(members: &[&str]) -> crate::integrity::Sha256Digest {
    let mut hasher = Sha256::new();
    for member in members {
        hasher.update(member.as_bytes());
        hasher.update(b"\n");
    }
    hasher.finalize()
}

#[test]
fn the_template_renders_the_python_card_text() {
    let corpus = fixture_corpus();
    let rendered = super::render_card::<!>(0, &corpus.cards()[0]).expect("the rich card renders");

    assert_eq!(
        rendered.card_text(),
        concat!(
            "Relation: part of\n",
            "Description: the item is a component of the whole.\n",
            "Aliases:\n",
            "  - component of\n",
            "  - within\n",
            "Inverse Name: has part (the whole has this part. Deprecated alias.)\n",
            "\n",
            "Ancestors:\n",
            "  - relation\n",
            "\n",
            "Source types:\n",
            "  - artwork (a creative work)\n",
            "\n",
            "Target types:\n",
            "  - collection\n",
            "\n",
            "Constraints:\n",
            "  - symmetric? no\n",
            "  - transitive? yes\n",
            "  - single value? not recorded\n",
            "  - distinct values? not recorded\n",
            "  - direction: source -> target\n",
            "\n",
            "Examples:\n",
            "  - mechanical: engine -> car\n",
            "  - wheel -> car\n",
            "\n",
            "Slug: part-of\n",
        ),
    );
}

#[test]
fn a_lone_simple_pair_hoists_into_the_independent_sections() {
    let corpus = fixture_corpus();
    let card = corpus
        .cards()
        .iter()
        .find(|card| card.content.title == "Employed By")
        .expect("the fixture holds the hash card");
    let rendered = super::render_card::<!>(8, card).expect("the hash card renders");

    assert_eq!(
        rendered.card_text(),
        concat!(
            "Relation: Employed By\n",
            "Inverse Name: none recorded\n",
            "\n",
            "Source types:\n",
            "  - Person\n",
            "\n",
            "Target types:\n",
            "  - Organization\n",
            "\n",
            "Constraints:\n",
            "  - symmetric? not recorded\n",
            "  - transitive? not recorded\n",
            "  - single value? not recorded\n",
            "  - distinct values? not recorded\n",
            "  - direction: source -> target\n",
            "\n",
            "Slug: employed-by\n",
        ),
    );
}

#[expect(
    clippy::float_cmp,
    reason = "the expected targets and weights are the exact expressions the assembly computes, \
              not measured values"
)]
#[tokio::test]
async fn assembly_smooths_groups_and_counts_the_fixture_corpus() {
    let corpus = fixture_corpus();
    let assembled = assemble(&corpus, &ProgrammedEmbedder, AssemblyConfig::default())
        .await
        .expect("the fixture corpus assembles");

    let evidence = assembled.evidence();
    assert_eq!(evidence.supplied, 9);
    assert_eq!(evidence.shot_excluded, 1);
    assert_eq!(evidence.holdouts_excluded, 1);
    assert_eq!(evidence.zero_weight_dropped, 1);
    assert_eq!(evidence.trained, 6);
    assert_eq!(evidence.unique_texts, 7);
    assert_eq!(evidence.severely_truncated, 0);
    assert_eq!(evidence.fold_groups, 4);
    assert_eq!(evidence.near_duplicate_pairs, 1);

    let rows = assembled.rows();
    assert_eq!(rows.len(), 6);

    // The rich card: three overlay and one proximal geometry vote;
    // unclear and abstain shift neither the counts nor the weight.
    assert_eq!(rows[0].target, [0.5 / 5.5, 1.5 / 5.5, 3.5 / 5.5]);
    assert_eq!(rows[0].weight, 4.0);
    assert_eq!(rows[1].target, [2.5 / 3.5, 0.5 / 3.5, 0.5 / 3.5]);
    assert_eq!(rows[1].weight, 2.0);
    assert_eq!(rows[5].weight, 2.0);
    for row in rows {
        let total: f64 = row.target.iter().sum();
        assert!((total - 1.0).abs() < 1.0e-12, "targets stay distributions");
    }

    // The inverse pair meets at the named identity; the near-tie pair
    // meets through its embeddings; everyone else stands alone, the
    // shared publisher notwithstanding.
    assert_eq!(rows[0].group, group_digest(&[PART_OF, HAS_PART]));
    assert_eq!(rows[1].group, rows[0].group);
    assert_eq!(rows[2].group, group_digest(&[ALPHA, BETA]));
    assert_eq!(rows[3].group, rows[2].group);
    assert_eq!(rows[4].group, group_digest(&[GAMMA]));
    assert_eq!(rows[5].group, group_digest(&[EMPLOYED_BY]));

    // The holdout card embeds after every trained row and carries its
    // human verdict; the training rows stay untouched by it.
    let holdouts = assembled.holdouts();
    assert_eq!(holdouts.len(), 1);
    assert_eq!(holdouts[0].identity.canonical_url(), HOLDOUT);
    assert_eq!(holdouts[0].verdict, HoldoutClass::Proximal);
    assert_eq!(holdouts[0].row, 6);
    let table = assembled.table();
    assert_eq!(table.rows().len(), 7);
    assert_eq!(
        table.rows()[6].as_array()[0],
        ProgrammedEmbedder::angle("holdout").cos(),
    );

    let identities: Vec<String> = assembled
        .identities()
        .iter()
        .map(super::super::CardIdentity::canonical_url)
        .collect();
    assert_eq!(
        identities,
        [PART_OF, HAS_PART, ALPHA, BETA, GAMMA, EMPLOYED_BY],
    );
}

#[tokio::test]
async fn the_staged_table_and_rows_satisfy_the_training_contract() {
    let corpus = fixture_corpus();
    let assembled = assemble(&corpus, &ProgrammedEmbedder, AssemblyConfig::default())
        .await
        .expect("the fixture corpus assembles");

    let mut bytes = Vec::new();
    assembled
        .table()
        .write_embeddings_into(&mut bytes)
        .expect("the embedding matrix writes");
    let file = TempFile::create(&bytes);

    let matrix = ArrayFile::open(&file.path).expect("the staged matrix maps");
    let embeddings: &[_] = matrix
        .vectors()
        .expect("the staged matrix holds canonical-width rows");

    // The trained rows lead the table; the holdout rows after them are
    // evaluation material, not training supply.
    TrainingSet::new(&embeddings[..assembled.rows().len()], assembled.rows())
        .expect("the assembled corpus satisfies the training-set contract");
}

#[tokio::test]
async fn a_corpus_with_no_admissible_card_is_an_empty_assembly() {
    let mut shot = wikidata_card(SHOT, "shot", "f-800", &[]);
    shot["flags"]["shot_excluded"] = json!(true);
    let corpus = AnnotationCorpus::from_slice(document(&[shot]).as_bytes())
        .expect("the shot-only corpus admits");

    let error = assemble(&corpus, &ProgrammedEmbedder, AssemblyConfig::default())
        .await
        .expect_err("policy leaves nothing to train on");
    assert!(matches!(error, AssemblyError::Empty));
}

#[tokio::test]
async fn a_language_the_template_does_not_render_is_rejected() {
    let mut card = wikidata_card(ALPHA, "alpha", "f-600", &[vote("overlay")]);
    card["content"]["language"] = json!("de");
    let corpus = AnnotationCorpus::from_slice(document(&[card]).as_bytes())
        .expect("the reader accepts any recorded language");

    let error = assemble(&corpus, &ProgrammedEmbedder, AssemblyConfig::default())
        .await
        .expect_err("the template renders English corpora");
    assert!(
        matches!(error, AssemblyError::Language { card: 0, ref language } if &**language == "de"),
    );
}
