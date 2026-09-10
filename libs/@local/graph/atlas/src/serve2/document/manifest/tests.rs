use alloc::{
    alloc::{Allocator, Global},
    sync::Arc,
};
use core::time::Duration;

use arc_swap::Guard;
use camino::Utf8PathBuf;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use rand::{SeedableRng as _, rngs::StdRng};
use serde_json::{Value, json};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{
    super::{
        Document as _, DocumentLimits, EdgesLimits, LocateLimits, TileLimits, TranslateLimits,
    },
    ManifestDocument,
};
use crate::{
    bitset::CompressedBitSet,
    dataset::TemporalAxes,
    file::{
        generation::{Generation, GenerationId, GenerationRoot},
        salt::metadata::SaltMetadata,
    },
    identity::NodeRowId,
    math::Log2,
    morton::Zoom,
    salt::lod::stage::LodConfig,
    serve2::{
        delta::{Delta, epoch::Epoch},
        scene::Scene,
        schedule::ViewSchedule,
        tests::fixture::{TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityMask, cache::VisibilityLimits},
        world::World,
    },
};

const AUTHORITY_REFRESH: Duration = Duration::from_millis(90_500);

const AUTHORITY_HARD: Duration = Duration::from_millis(300_250);

const TRANSACTION_TIME: &str = "2026-07-19T08:30:00Z";

const DECISION_TIME: &str = "2026-05-04T11:45:06Z";

fn limits() -> DocumentLimits {
    DocumentLimits {
        tile: TileLimits {
            colored_type_ids: 7,
        },
        edges: EdgesLimits {
            tiles: 11,
            edges: 13,
        },
        locate: LocateLimits {
            colored_type_ids: 17,
            edges: 19,
            properties: 23,
            link_type_ids: 29,
            link_properties: 31,
        },
        translate: TranslateLimits { entity_ids: 37 },
    }
}

fn expected_limits() -> Value {
    json!({
        "tile": {"coloredTypeIds": 7},
        "edges": {"tiles": 11, "edges": 13},
        "locate": {
            "coloredTypeIds": 17,
            "edges": 19,
            "properties": 23,
            "linkTypeIds": 29,
            "linkProperties": 31,
        },
        "translate": {"entityIds": 37},
        "authorityRefreshSeconds": 90,
        "authorityHardSeconds": 300,
    })
}

fn visibility(bytes: u64) -> VisibilityLimits {
    VisibilityLimits {
        bytes,
        soft: AUTHORITY_REFRESH,
        hard: AUTHORITY_HARD,
    }
}

fn expected_bucket_schedule() -> Value {
    json!({"span": 64, "cut": "z+6", "maxZoom": 18})
}

fn expected_unshifted_scope() -> Value {
    json!({"k": 0, "cut": "z+6", "maxZoom": 0})
}

#[track_caller]
fn manifest<A: Allocator>(
    scene: Scene<'_>,
    limits: &DocumentLimits,
    visibility: VisibilityLimits,
    buffer: &mut Vec<u8, A>,
) -> Value {
    let envelope = ManifestDocument::new(scene, limits, visibility)
        .encode(buffer)
        .expect("should complete the manifest document");
    assert_eq!(
        envelope.content_type(),
        "application/json",
        "should report the media type of the completed JSON document"
    );

    serde_json::from_slice(buffer.as_slice()).expect("should parse one complete document")
}

struct Republished {
    root: GenerationRoot,
}

impl Republished {
    fn publish(
        name: &str,
        source: &Generation,
        edit: impl FnOnce(&mut SaltMetadata),
    ) -> (Self, Generation) {
        let path = Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("should use a UTF-8 temp directory")
            .join(format!(
                "hash-graph-atlas-manifest-{}-{name}",
                std::process::id()
            ));
        let _removed: Result<(), std::io::Error> = std::fs::remove_dir_all(&path);

        let owned = Self {
            root: GenerationRoot::new(path).expect("should open the republication root"),
        };
        let published = {
            let staging = owned
                .root
                .stage()
                .expect("should create the republication staging");
            for file in source.repository().files.files() {
                std::fs::copy(source.path_of(&file.name), staging.path_of(&file.name))
                    .expect("should copy a published artifact into the staging");
            }

            let mut repository = source.repository().clone();
            edit(&mut repository.metadata);
            staging
                .seal(&repository)
                .expect("should seal the republished generation")
        };
        let generation = owned
            .root
            .open(published.id())
            .expect("should open the republished generation");

        (owned, generation)
    }
}

impl Drop for Republished {
    fn drop(&mut self) {
        drop(std::fs::remove_dir_all(self.root.path()));
    }
}

struct Fixture {
    world: Arc<World>,
    epoch: Epoch,
    actor: VisibilityActor,
    mask: VisibilityMask,
    schedule: ViewSchedule,
    files: TamperFixture,
    _republished: Option<Republished>,
}

impl Fixture {
    fn open(
        files: TamperFixture,
        generation: Generation,
        republished: Option<Republished>,
    ) -> Self {
        let world = Arc::new(
            World::open(generation, &secret()).expect("should open the synthetic generation"),
        );
        let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(17))
            .expect("should allocate a delta identity");
        let epoch = Epoch::from(Guard::from_inner(Arc::new(delta)));
        let actor = VisibilityActor {
            id: ActorId::new(Uuid::from_u128(1), ActorType::User),
            instance_admin: false,
        };
        let mask = VisibilityMask::full(&epoch, actor);
        let schedule = ViewSchedule::of(Arc::clone(&world), &epoch, &mask);
        Self {
            world,
            epoch,
            actor,
            mask,
            schedule,
            files,
            _republished: republished,
        }
    }

    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let generation = files.generation().clone();
        Self::open(files, generation, None)
    }

    fn edited(name: &str, edit: impl FnOnce(&mut SaltMetadata)) -> Self {
        let files = TamperFixture::publish(name);
        let (republished, generation) = Republished::publish(name, files.generation(), edit);
        Self::open(files, generation, Some(republished))
    }

    fn generation(&self) -> GenerationId {
        self.world.generation().id()
    }

    fn source_generation(&self) -> GenerationId {
        self.files.generation().id()
    }

    fn restrict(&mut self, nodes: impl IntoIterator<Item = u64>) {
        self.mask = VisibilityMask::partial(
            &self.epoch,
            self.actor,
            CompressedBitSet::from_rows(nodes.into_iter().map(NodeRowId::new)),
            CompressedBitSet::from_rows(core::iter::empty()),
        );
        self.schedule = ViewSchedule::of(Arc::clone(&self.world), &self.epoch, &self.mask);
    }

    fn scene(&self, offset: Zoom) -> Scene<'_> {
        Scene {
            world: &self.world,
            epoch: &self.epoch,
            mask: &self.mask,
            schedule: &self.schedule,
            delivery: self
                .schedule
                .cut(offset)
                .expect("should bind the requested density offset"),
        }
    }
}

/// Authority windows truncate fractional seconds in the published integer keys.
#[test]
fn limits_grouped_distinct() {
    let fixture = Fixture::new("manifest-limits-grouped-distinct");
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);
    buffer.extend_from_slice(b"previous document");

    let document = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(4096),
        &mut buffer,
    );

    assert_eq!(
        document,
        json!({
            "generation": fixture.generation().to_string(),
            "wireVersion": 1,
            "variants": ["plain"],
            "bucketSchedule": expected_bucket_schedule(),
            "scopeSchedule": expected_unshifted_scope(),
            "limits": expected_limits(),
        }),
        "should publish the whole bootstrap document"
    );
}

#[test]
fn limits_cache_bytes_unpublished() {
    let fixture = Fixture::new("manifest-limits-cache-bytes-unpublished");
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);

    let small = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(4096),
        &mut buffer,
    );
    let large = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(0x4000_0000),
        &mut buffer,
    );

    assert_eq!(
        small, large,
        "should publish one document for either cache budget"
    );
    assert_eq!(
        large["limits"],
        expected_limits(),
        "should still publish every route cap and both authority windows"
    );
}

#[test]
fn schedule_corpus_offset() {
    let fixture = Fixture::new("manifest-schedule-corpus-offset");
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);
    let offset = Zoom::new(5).expect("should fit the key width");

    let document = manifest(
        fixture.scene(offset),
        &limits,
        visibility(4096),
        &mut buffer,
    );

    assert_eq!(
        document["scopeSchedule"],
        expected_unshifted_scope(),
        "should publish offset zero and the unshifted cut for a corpus request"
    );
    assert_eq!(
        document["bucketSchedule"],
        expected_bucket_schedule(),
        "should leave the recorded bucket schedule alone"
    );
}

/// Distinct root quadrants require only one subdivision to separate these rows.
///
/// Rows 0, 1 and 2 have coordinates (-2, -1), (-1, 2) and (0, 0) in a [-3, 3]² frame. Normalization
/// preserves their quadrants. The [first-occupant cascade](crate::salt::lod::cascade) assigns the
/// best-ranked row to depth zero and the others to depth one. A span exponent of zero gives maximum
/// zoom 1. Offset 2 changes it to max(1 - 2, 0) = 0.
#[test]
fn schedule_scoped_offset() {
    let mut fixture = Fixture::edited("manifest-schedule-scoped-offset", |metadata| {
        metadata.reproducibility.config.lod.span = Log2::ZERO;
    });
    fixture.restrict([0, 1, 2]);
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);

    let unshifted = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(4096),
        &mut buffer,
    );
    assert_eq!(
        unshifted["scopeSchedule"],
        json!({"k": 0, "cut": "z+0", "maxZoom": 1}),
        "should first deliver the deepest occupied bucket at zoom one"
    );

    let offset = Zoom::new(2).expect("should fit the key width");
    let shifted = manifest(
        fixture.scene(offset),
        &limits,
        visibility(4096),
        &mut buffer,
    );

    assert_eq!(
        shifted["scopeSchedule"],
        json!({"k": 2, "cut": "z+2", "maxZoom": 0}),
        "should publish the requested offset and the cut two subdivisions deeper"
    );
    assert_eq!(
        shifted["bucketSchedule"],
        json!({"span": 1, "cut": "z+0", "maxZoom": 18}),
        "should leave the recorded bucket schedule alone"
    );
}

#[test]
fn schedule_empty_scope() {
    let mut fixture = Fixture::new("manifest-schedule-empty-scope");
    fixture.restrict(core::iter::empty());
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);

    let document = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(4096),
        &mut buffer,
    );

    assert_eq!(
        document,
        json!({
            "generation": fixture.generation().to_string(),
            "wireVersion": 1,
            "variants": ["plain"],
            "bucketSchedule": expected_bucket_schedule(),
            "scopeSchedule": expected_unshifted_scope(),
            "limits": expected_limits(),
        }),
        "should publish the recorded schedule and a root-only scope over an empty view"
    );
}

#[test]
fn snapshot_axes_absent() {
    let fixture = Fixture::new("manifest-snapshot-axes-absent");
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);

    let document = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(4096),
        &mut buffer,
    );

    assert!(
        document.get("createdAt").is_none(),
        "should leave out the creation time of a generation with no observed axes"
    );
    assert_eq!(
        document["generation"],
        json!(fixture.generation().to_string()),
        "should publish the generation the scene captured"
    );
}

#[test]
fn snapshot_axes_present() {
    let decision_time: Timestamp<DecisionTime> = DECISION_TIME
        .parse()
        .expect("should parse the fixture decision time");
    let transaction_time: Timestamp<TransactionTime> = TRANSACTION_TIME
        .parse()
        .expect("should parse the fixture transaction time");
    let fixture = Fixture::edited("manifest-snapshot-axes-present", |metadata| {
        metadata.snapshot.axes = Some(TemporalAxes {
            transaction_time,
            decision_time,
        });
    });
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);

    let mut document = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(4096),
        &mut buffer,
    );

    let created_at = document
        .as_object_mut()
        .expect("should publish a JSON object")
        .remove("createdAt")
        .expect("should publish the creation time of an observed snapshot");
    assert_eq!(
        serde_json::from_value::<Timestamp<DecisionTime>>(created_at)
            .expect("should publish a decision-time timestamp"),
        decision_time,
        "should publish the snapshot's own decision time"
    );
    assert_ne!(
        fixture.generation(),
        fixture.source_generation(),
        "should carry the identity of the republished metadata"
    );
    assert_eq!(
        document,
        json!({
            "generation": fixture.generation().to_string(),
            "wireVersion": 1,
            "variants": ["plain"],
            "bucketSchedule": expected_bucket_schedule(),
            "scopeSchedule": expected_unshifted_scope(),
            "limits": expected_limits(),
        }),
        "should leave the rest of the document as an axesless generation publishes it"
    );
}

/// A span exponent of 32 requires a count wider than a 32-bit integer.
#[test]
fn schedule_maximum_span() {
    let fixture = Fixture::edited("manifest-schedule-maximum-span", |metadata| {
        metadata.reproducibility.config.lod = LodConfig {
            span: Log2::new(32).expect("should fit the exponent domain"),
            max_tile_depth: Zoom::MIN,
        };
    });
    let limits = limits();
    let mut buffer = Vec::new_in(&Global);

    let document = manifest(
        fixture.scene(Zoom::MIN),
        &limits,
        visibility(4096),
        &mut buffer,
    );

    assert_eq!(
        document["bucketSchedule"],
        json!({"span": 0x0001_0000_0000_u64, "cut": "z+32", "maxZoom": 0}),
        "should publish one axis of cells per tile and the root as the deepest served zoom"
    );
    assert_eq!(
        document["scopeSchedule"],
        json!({"k": 0, "cut": "z+32", "maxZoom": 0}),
        "should publish the same cut for the corpus scope"
    );
}
