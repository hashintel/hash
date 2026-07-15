"""Define durable schemas and filenames for evaluation analysis artifacts."""

import pyarrow as pa

CLASSIFIER_METADATA_FILENAME = "classifier.json"
CLASSIFIER_ARRAYS_FILENAME = "arrays.npz"
CLASSIFIER_OUT_OF_FOLD_FILENAME = "out-of-fold.parquet"
ORDERING_ALGORITHM = "relation-id-ascending-v1"
PARQUET_ALGORITHM = "pyarrow-parquet-zstd-3-no-dictionary-v1"

SOFT_LABEL_SCHEMA = pa.schema(
    [
        pa.field("relation_id", pa.string(), nullable=False),
        pa.field("card_hash", pa.string(), nullable=False),
        pa.field("producer", pa.string(), nullable=False),
        pa.field("family_id", pa.string(), nullable=True),
        pa.field("prescreen_stratum", pa.string(), nullable=False),
        pa.field("coincident_votes", pa.int64(), nullable=False),
        pa.field("proximal_votes", pa.int64(), nullable=False),
        pa.field("overlay_votes", pa.int64(), nullable=False),
        pa.field("unclear_votes", pa.int64(), nullable=False),
        pa.field("abstentions", pa.int64(), nullable=False),
        pa.field("refined", pa.bool_(), nullable=False),
        pa.field("review", pa.bool_(), nullable=False),
    ]
)

EMBEDDING_SCHEMA = pa.schema(
    [
        pa.field("relation_id", pa.string(), nullable=False),
        pa.field("card_hash", pa.string(), nullable=False),
        pa.field("encoding", pa.string(), nullable=False),
        pa.field("dimension", pa.int32(), nullable=False),
        pa.field("vector_f32_le", pa.binary(), nullable=False),
    ]
)

OUT_OF_FOLD_SCHEMA = pa.schema(
    [
        pa.field("relation_id", pa.string(), nullable=False),
        pa.field("card_hash", pa.string(), nullable=False),
        pa.field("family_id", pa.string(), nullable=False),
        pa.field("fold", pa.int32(), nullable=False),
        pa.field("calibration_temperature", pa.float64(), nullable=False),
        pa.field("applicability", pa.float64(), nullable=False),
        pa.field("distance", pa.float64(), nullable=False),
        pa.field("logit_coincident", pa.float64(), nullable=False),
        pa.field("logit_proximal", pa.float64(), nullable=False),
        pa.field("logit_overlay", pa.float64(), nullable=False),
        pa.field("raw_coincident", pa.float64(), nullable=False),
        pa.field("raw_proximal", pa.float64(), nullable=False),
        pa.field("raw_overlay", pa.float64(), nullable=False),
        pa.field("calibrated_coincident", pa.float64(), nullable=False),
        pa.field("calibrated_proximal", pa.float64(), nullable=False),
        pa.field("calibrated_overlay", pa.float64(), nullable=False),
    ]
)

ARRAY_SCHEMA = {
    "applicability_inverse_scales": {"dtype": "<f8", "shape": ["dimension"]},
    "applicability_mean": {"dtype": "<f8", "shape": ["dimension"]},
    "applicability_training_distances": {
        "dtype": "<f8",
        "shape": ["training_cards"],
    },
    "coefficients": {"dtype": "<f8", "shape": [3, "dimension"]},
    "cross_fit_applicability_inverse_scales": {
        "dtype": "<f8",
        "shape": ["folds", "dimension"],
    },
    "cross_fit_applicability_mean": {
        "dtype": "<f8",
        "shape": ["folds", "dimension"],
    },
    "cross_fit_applicability_training_distances": {
        "dtype": "<f8",
        "shape": ["rows*(folds-1)"],
    },
    "intercepts": {"dtype": "<f8", "shape": [3]},
}

_ARTIFACT_METADATA_FIELDS = {
    "algorithm_hash": "sha256",
    "algorithms": "map[string,string]",
    "artifact": "non-empty-string",
    "content_hashes": "map[string,sha256]",
    "metadata_hash": "computed-sha256",
    "schema_hashes": "map[string,sha256]",
    "schema_version": "literal[1]",
    "source_hashes": "map[string,sha256]",
}

SOFT_LABEL_METADATA_SCHEMA = {
    "artifact": "relation-soft-labels",
    "fields": {
        **_ARTIFACT_METADATA_FIELDS,
        "relation_order_hash": "sha256",
        "rows": "positive-int",
    },
    "schema_version": 1,
}

EMBEDDING_METADATA_SCHEMA = {
    "artifact": "relation-embeddings",
    "fields": {
        **_ARTIFACT_METADATA_FIELDS,
        "producer": {
            "producer_revision": "literal[openrouter-native-embedding-v1]",
            "request": {
                "dimension": "positive-int",
                "encoding_format": "literal[float]",
                "endpoint_url": "non-empty-string",
                "model": "non-empty-string",
                "schema_version": "literal[1]",
            },
            "response": {
                "dimension": "positive-int",
                "model": "non-empty-string",
            },
            "vector_encoding": "literal[f32-le-v1]",
        },
        "relation_order_hash": "sha256",
        "rows": "positive-int",
    },
    "schema_version": 1,
}

METADATA_SCHEMA = {
    "artifact": "relation-policy-classifier",
    "content": [
        CLASSIFIER_ARRAYS_FILENAME,
        CLASSIFIER_OUT_OF_FOLD_FILENAME,
    ],
    "fields": {
        **_ARTIFACT_METADATA_FIELDS,
        "schema_version": "literal[4]",
        "classes": "tuple[coincident,proximal,overlay]",
        "closure": "classifier-closure-binding-v1",
        "config": "classifier-config-v1",
        "cross_fit_temperatures": "tuple[positive-finite-float64]",
        "embedding_dimension": "positive-int",
        "fold_assignment_hash": "sha256",
        "metrics": "classifier-metrics-v2",
        "model_iterations": "positive-int",
        "relation_order_hash": "sha256",
        "rows": "positive-int",
        "target_resolutions": "classifier-target-resolution-binding-v1-or-null",
        "temperature": "positive-finite-float64",
    },
    "schema_version": 4,
}
