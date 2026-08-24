import struct
from collections.abc import Mapping
from datetime import timedelta
from pathlib import Path
from types import MappingProxyType
from typing import Never

import pytest
import trio
from pydantic import SecretStr

import atlas_tools.relation.evaluation.application.embedding as embedding_module
from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.application.embedding import (
    EmbeddingAcquisitionError,
    EmbeddingBudgetExceededError,
    EmbeddingCacheError,
    EmbeddingIncompleteRequestError,
    embed_grid_async,
)
from atlas_tools.relation.evaluation.domain.api import (
    AttemptFailure,
    CardHash,
    EmbeddingConfig,
    EvaluationCard,
    ModelId,
    ProviderFailure,
)
from atlas_tools.relation.evaluation.storage.api import (
    LoadedConfig,
    VerifiedDeck,
    load_config,
)
from atlas_tools.relation.evaluation.transport.api import (
    EmbeddingAccepted,
    EmbeddingOutcome,
    EmbeddingRejected,
    EmbeddingRequest,
    EmbeddingUsage,
)

ROOT = Path(__file__).parents[3]
GRID_CONFIG = ROOT / "config" / "eval" / "grid.yaml"
MODEL = "test/embedding-v1"
ENDPOINT_URL = "https://openrouter.test/api/v1/embeddings"

VECTORS: Mapping[str, tuple[float, float]] = MappingProxyType(
    {
        "fixed holdout": (6.0, 0.25),
        "shared content": (9.0, 0.5),
        "third content": (8.0, 0.75),
    }
)


class _RecordingTransport:
    __slots__ = ("active", "closed", "maximum_active", "requests")

    def __init__(self) -> None:
        self.active = 0
        self.closed = False
        self.maximum_active = 0
        self.requests: list[EmbeddingRequest] = []

    async def embed(self, request: EmbeddingRequest) -> EmbeddingOutcome:
        self.requests.append(request)
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        try:
            await trio.sleep(0.02)
            return EmbeddingAccepted(
                model=request.model,
                dimension=request.dimension,
                vectors=tuple(
                    tuple(
                        VECTORS[text][index] if index < len(VECTORS[text]) else float(index)
                        for index in range(request.dimension)
                    )
                    for text in request.texts
                ),
                usage=EmbeddingUsage(
                    input_tokens=2 * len(request.texts),
                    total_tokens=2 * len(request.texts),
                    cost_usd=0.001 * len(request.texts),
                ),
            )
        finally:
            self.active -= 1

    async def aclose(self) -> None:
        self.closed = True


class _RejectingTransport:
    __slots__ = ("closed", "failure", "requests")

    def __init__(self, failure: AttemptFailure) -> None:
        self.closed = False
        self.failure = failure
        self.requests = 0

    async def embed(self, request: EmbeddingRequest) -> EmbeddingOutcome:
        del request
        self.requests += 1
        return EmbeddingRejected(failure=self.failure)

    async def aclose(self) -> None:
        self.closed = True


class _CrashingTransport:
    __slots__ = ("requests",)

    def __init__(self) -> None:
        self.requests = 0

    async def embed(self, request: EmbeddingRequest) -> EmbeddingOutcome:
        del request
        self.requests += 1
        raise RuntimeError("connection state became unknowable")

    async def aclose(self) -> None:
        return


class _RecordingProgress:
    __slots__ = ("advances", "phases")

    def __init__(self) -> None:
        self.advances: list[int] = []
        self.phases: list[tuple[str, int | None]] = []

    def phase(self, name: str, *, total: int | None = None) -> None:
        self.phases.append((name, total))

    def advance(self, count: int = 1) -> None:
        self.advances.append(count)

    def note(self, message: str) -> None:
        del message


class _OwnedSettings:
    __slots__ = ("api_key",)

    def __init__(self) -> None:
        self.api_key = SecretStr("owned-secret")


class _OwnedTransport(_RecordingTransport):
    __slots__ = ("api_key", "maximum_batch_size", "server_url")

    instance: _OwnedTransport | None = None

    def __init__(
        self,
        api_key: str,
        *,
        maximum_batch_size: int,
        server_url: str | None = None,
    ) -> None:
        super().__init__()
        self.api_key = api_key
        self.maximum_batch_size = maximum_batch_size
        self.server_url = server_url
        type(self).instance = self

    async def aclose(self) -> None:
        await trio.lowlevel.checkpoint()
        self.closed = True


def _card(relation_id: str, text: str) -> EvaluationCard:
    return EvaluationCard(
        relation_id=relation_id,
        producer="wikidata",
        card_text=text,
        card_hash=CardHash(sha256_bytes(text.encode("utf-8"))),
        token_count=len(text.split()),
    )


def _inputs(
    *,
    dimension: int = 2,
    max_texts: int = 10,
    batch_size: int = 1,
    endpoint_url: str = ENDPOINT_URL,
    model: str = MODEL,
) -> tuple[LoadedConfig, VerifiedDeck]:
    base = load_config(GRID_CONFIG).grid()
    config = base.model_copy(
        update={
            "embedding": EmbeddingConfig(
                endpoint_url=endpoint_url,
                model=ModelId(model),
                api_key_env="OPENROUTER_API_KEY",
                dimension=dimension,
                batch_size=batch_size,
                max_texts=max_texts,
                request_timeout=timedelta(seconds=1),
            )
        }
    )
    cards = (
        _card("wikidata:P9000002", "shared content"),
        _card("wikidata:P22", "few shot content"),
        _card("wikidata:P8000001", "third content"),
        _card("wikidata:P6", "fixed holdout"),
        _card("wikidata:P9000001", "shared content"),
    )
    by_relation_id = MappingProxyType({card.relation_id: card for card in cards})
    return (
        LoadedConfig(
            path=Path("grid.yaml"),
            config=config,
            content_hash="c" * 64,
        ),
        VerifiedDeck(
            directory=Path("deck"),
            cards_path=Path("deck/cards.jsonl"),
            manifest_path=Path("deck/cards.manifest.json"),
            source_hashes=MappingProxyType(
                {
                    "cards.jsonl": "a" * 64,
                    "cards.manifest.json": "b" * 64,
                }
            ),
            source_namespaces=frozenset({"wikidata"}),
            cards=cards,
            by_relation_id=by_relation_id,
        ),
    )


def _install_inputs(
    monkeypatch: pytest.MonkeyPatch,
    loaded: LoadedConfig,
    deck: VerifiedDeck,
) -> None:
    async def config_loader(_path: Path) -> LoadedConfig:
        return loaded

    async def deck_loader(_path: Path) -> VerifiedDeck:
        return deck

    monkeypatch.setattr(embedding_module, "load_config_async", config_loader)
    monkeypatch.setattr(embedding_module, "load_deck_async", deck_loader)


def _credentials_were_read() -> Never:
    raise AssertionError("credentials must not be read for offline embedding work")


def _remove_artifact(path: Path) -> None:
    path.unlink()
    path.with_name(f"{path.name}.meta.json").unlink()


def test_embedding_config_canonicalizes_equivalent_endpoint_urls() -> None:
    loaded, _ = _inputs(
        endpoint_url="HTTPS://OPENROUTER.TEST/api/v1/embeddings/",
    )

    embedding = loaded.grid().embedding
    assert embedding is not None
    assert embedding.endpoint_url == ENDPOINT_URL


def test_grid_embeddings_are_bounded_deduplicated_and_card_bound(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs(batch_size=2)
    _install_inputs(monkeypatch, loaded, deck)
    transport = _RecordingTransport()
    progress = _RecordingProgress()
    output = tmp_path / "embeddings.parquet"

    async def scenario() -> None:
        run = await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=tmp_path / "cache",
            transport=transport,
            maximum_concurrency=2,
            progress=progress,
        )

        assert run.relation_count == 4
        assert run.unique_card_count == 3
        assert run.cache_hits == 0
        assert run.network_texts == 3
        assert run.reused_artifact is False
        assert transport.maximum_active == 2
        assert transport.closed is False
        assert len(transport.requests) == 2
        assert sorted(text for request in transport.requests for text in request.texts) == [
            "fixed holdout",
            "shared content",
            "third content",
        ]
        assert progress.phases == [("embedding cards", 3)]
        assert sorted(progress.advances) == [1, 2]
        assert sum(progress.advances) == 3
        assert tuple(row.relation_id for row in run.artifact.rows) == (
            "wikidata:P6",
            "wikidata:P8000001",
            "wikidata:P9000001",
            "wikidata:P9000002",
        )
        assert tuple(struct.unpack("<2f", row.vector_f32_le) for row in run.artifact.rows) == (
            (6.0, 0.25),
            (8.0, 0.75),
            (9.0, 0.5),
            (9.0, 0.5),
        )
        assert dict(run.artifact.metadata.source_hashes) == {
            "cards.jsonl": "a" * 64,
            "cards.manifest.json": "b" * 64,
            "grid-config": "c" * 64,
        }
        producer = run.artifact.metadata.producer
        assert producer.producer_revision == "openrouter-native-embedding-v1"
        assert producer.request.endpoint_url == ENDPOINT_URL
        assert producer.request.schema_version == 1
        assert producer.request.model == MODEL
        assert producer.request.dimension == 2
        assert producer.response.model == MODEL
        assert producer.response.dimension == 2
        attempts = tuple(sorted((tmp_path / "cache/_requests/attempts").glob("*.json")))
        assert len(attempts) == 2
        attempt_payloads = tuple(path.read_bytes() for path in attempts)
        assert all(b'"kind":"embedding-attempt"' in payload for payload in attempt_payloads)
        assert all(b'"cost_complete":true' in payload for payload in attempt_payloads)
        assert all(ENDPOINT_URL.encode() in payload for payload in attempt_payloads)
        assert all(b"shared content" not in payload for payload in attempt_payloads)
        assert not tuple((tmp_path / "cache/_requests/inflight").glob("*.json"))

    trio.run(scenario)


def test_complete_cache_rebuilds_the_artifact_without_credentials(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs()
    _install_inputs(monkeypatch, loaded, deck)
    output = tmp_path / "embeddings.parquet"
    cache = tmp_path / "cache"

    async def scenario() -> None:
        first_transport = _RecordingTransport()
        await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=first_transport,
            maximum_concurrency=2,
        )
        await trio.to_thread.run_sync(_remove_artifact, output)
        monkeypatch.setattr(
            embedding_module,
            "OpenRouterSettings",
            _credentials_were_read,
        )

        rerun = await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
        )

        assert rerun.cache_hits == 3
        assert rerun.network_texts == 0
        assert tuple(row.relation_id for row in rerun.artifact.rows) == (
            "wikidata:P6",
            "wikidata:P8000001",
            "wikidata:P9000001",
            "wikidata:P9000002",
        )

    trio.run(scenario)


def test_owned_openrouter_uses_the_sdk_server_base_and_closes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs(batch_size=2)
    _install_inputs(monkeypatch, loaded, deck)
    _OwnedTransport.instance = None
    monkeypatch.setattr(embedding_module, "OpenRouterSettings", _OwnedSettings)
    monkeypatch.setattr(
        embedding_module,
        "OpenRouterEmbeddingTransport",
        _OwnedTransport,
    )

    async def scenario() -> None:
        await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=tmp_path / "embeddings.parquet",
            cache_directory=tmp_path / "cache",
        )

        owned = _OwnedTransport.instance
        assert owned is not None
        assert owned.api_key == "owned-secret"
        assert owned.maximum_batch_size == 2
        assert owned.server_url == "https://openrouter.test/api/v1"
        assert owned.closed is True

    trio.run(scenario)


def test_owned_embedding_transport_closes_when_acquisition_is_cancelled(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs(batch_size=1)
    _install_inputs(monkeypatch, loaded, deck)
    _OwnedTransport.instance = None
    monkeypatch.setattr(embedding_module, "OpenRouterSettings", _OwnedSettings)
    monkeypatch.setattr(
        embedding_module,
        "OpenRouterEmbeddingTransport",
        _OwnedTransport,
    )

    async def scenario() -> None:
        async def acquire() -> None:
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=tmp_path / "embeddings.parquet",
                cache_directory=tmp_path / "cache",
            )

        async with trio.open_nursery() as nursery:
            nursery.start_soon(acquire)
            while True:
                owned = _OwnedTransport.instance
                if owned is not None and owned.requests:
                    break
                await trio.lowlevel.checkpoint()
            nursery.cancel_scope.cancel()

        owned = _OwnedTransport.instance
        assert owned is not None
        assert owned.closed is True

    trio.run(scenario)


def test_dimension_drift_buys_new_vectors_instead_of_reusing_cache(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs()
    _install_inputs(monkeypatch, loaded, deck)
    output = tmp_path / "embeddings.parquet"
    cache = tmp_path / "cache"

    async def scenario() -> None:
        await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=_RecordingTransport(),
        )
        await trio.to_thread.run_sync(_remove_artifact, output)
        changed, _ = _inputs(dimension=3)
        _install_inputs(monkeypatch, changed, deck)
        changed_transport = _RecordingTransport()
        rerun = await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=changed_transport,
        )

        assert rerun.cache_hits == 0
        assert rerun.network_texts == 3
        assert len(changed_transport.requests) == 3
        assert all(request.dimension == 3 for request in changed_transport.requests)

    trio.run(scenario)


def test_endpoint_drift_rejects_artifact_and_cache_reuse(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs()
    _install_inputs(monkeypatch, loaded, deck)
    output = tmp_path / "embeddings.parquet"
    cache = tmp_path / "cache"

    async def scenario() -> None:
        await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=_RecordingTransport(),
        )
        changed, _ = _inputs(
            endpoint_url="https://second-router.test/v2/embeddings",
        )
        _install_inputs(monkeypatch, changed, deck)
        unused = _RecordingTransport()

        with pytest.raises(ValueError, match="producer does not match"):
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=output,
                cache_directory=cache,
                transport=unused,
            )
        assert unused.requests == []

        await trio.to_thread.run_sync(_remove_artifact, output)
        changed_transport = _RecordingTransport()
        rerun = await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=changed_transport,
        )

        assert rerun.cache_hits == 0
        assert rerun.network_texts == 3
        assert {request.endpoint_url for request in changed_transport.requests} == {
            "https://second-router.test/v2/embeddings"
        }

    trio.run(scenario)


def test_batching_policy_drift_reuses_semantically_identical_cache(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs(batch_size=1)
    _install_inputs(monkeypatch, loaded, deck)
    output = tmp_path / "embeddings.parquet"
    cache = tmp_path / "cache"

    async def scenario() -> None:
        await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=_RecordingTransport(),
        )
        await trio.to_thread.run_sync(_remove_artifact, output)
        changed, _ = _inputs(batch_size=3, max_texts=1)
        _install_inputs(monkeypatch, changed, deck)
        unused = _RecordingTransport()

        rerun = await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=unused,
            maximum_concurrency=1,
        )

        assert rerun.cache_hits == 3
        assert rerun.network_texts == 0
        assert unused.requests == []

    trio.run(scenario)


@pytest.mark.parametrize(
    ("old", "new"),
    [
        (
            b'"producer_revision":"openrouter-native-embedding-v1"',
            b'"producer_revision":"openrouter-native-embedding-v2"',
        ),
        (b'"schema_version":1', b'"schema_version":2'),
    ],
    ids=("producer-revision", "wire-schema"),
)
def test_cache_identity_tampering_fails_closed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    old: bytes,
    new: bytes,
) -> None:
    loaded, deck = _inputs()
    _install_inputs(monkeypatch, loaded, deck)
    output = tmp_path / "embeddings.parquet"
    cache = tmp_path / "cache"

    async def scenario() -> None:
        await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=_RecordingTransport(),
        )
        await trio.to_thread.run_sync(_remove_artifact, output)
        cache_entry = next(path for path in cache.rglob("*.json") if "_requests" not in path.parts)
        payload = cache_entry.read_bytes()
        assert old in payload
        cache_entry.write_bytes(payload.replace(old, new))

        with pytest.raises(EmbeddingCacheError, match="invalid embedding cache entry"):
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=output,
                cache_directory=cache,
                transport=_RecordingTransport(),
            )

    trio.run(scenario)


def test_billed_attempt_recovers_cache_before_any_reissue(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs(batch_size=3)
    _install_inputs(monkeypatch, loaded, deck)
    output = tmp_path / "embeddings.parquet"
    cache = tmp_path / "cache"
    publish = embedding_module._publish_cache_entries

    def interrupt_publication(_entries: object) -> None:
        raise OSError("simulated cache publication interruption")

    async def scenario() -> None:
        monkeypatch.setattr(embedding_module, "_publish_cache_entries", interrupt_publication)
        with pytest.raises(OSError, match="simulated cache publication interruption"):
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=output,
                cache_directory=cache,
                transport=_RecordingTransport(),
                maximum_concurrency=1,
            )
        assert len(tuple((cache / "_requests/attempts").glob("*.json"))) == 1
        assert len(tuple((cache / "_requests/inflight").glob("*.json"))) == 1

        monkeypatch.setattr(embedding_module, "_publish_cache_entries", publish)
        unused = _RecordingTransport()
        recovered = await embed_grid_async(
            config_path=Path("grid.yaml"),
            deck_directory=Path("deck"),
            output_path=output,
            cache_directory=cache,
            transport=unused,
            maximum_concurrency=1,
        )

        assert recovered.cache_hits == 3
        assert recovered.network_texts == 0
        assert unused.requests == []
        assert not tuple((cache / "_requests/inflight").glob("*.json"))

    trio.run(scenario)


def test_unknown_paid_outcome_blocks_automatic_reissue(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs(batch_size=3)
    _install_inputs(monkeypatch, loaded, deck)
    cache = tmp_path / "cache"

    async def scenario() -> None:
        crashing = _CrashingTransport()
        with pytest.raises(RuntimeError, match="connection state became unknowable"):
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=tmp_path / "embeddings.parquet",
                cache_directory=cache,
                transport=crashing,
                maximum_concurrency=1,
            )
        assert crashing.requests == 1
        assert len(tuple((cache / "_requests/inflight").glob("*.json"))) == 1
        assert not tuple((cache / "_requests/attempts").glob("*.json"))

        unused = _RecordingTransport()
        with pytest.raises(EmbeddingIncompleteRequestError, match="unknown paid outcome"):
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=tmp_path / "embeddings.parquet",
                cache_directory=cache,
                transport=unused,
                maximum_concurrency=1,
            )
        assert unused.requests == []

    trio.run(scenario)


def test_miss_budget_and_transport_failure_stop_before_artifact_publication(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded, deck = _inputs(max_texts=2)
    _install_inputs(monkeypatch, loaded, deck)
    monkeypatch.setattr(
        embedding_module,
        "OpenRouterSettings",
        _credentials_were_read,
    )
    output = tmp_path / "embeddings.parquet"

    async def scenario() -> None:
        with pytest.raises(EmbeddingBudgetExceededError, match="3 misses, maximum is 2"):
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=output,
                cache_directory=tmp_path / "budget-cache",
            )
        assert not output.exists()

        admitted, _ = _inputs(max_texts=3)
        _install_inputs(monkeypatch, admitted, deck)
        failure = ProviderFailure(
            exception_type="ProviderUnavailable",
            message="embedding endpoint unavailable",
            http_status_code=503,
        )
        transport = _RejectingTransport(failure)
        with pytest.raises(EmbeddingAcquisitionError) as raised:
            await embed_grid_async(
                config_path=Path("grid.yaml"),
                deck_directory=Path("deck"),
                output_path=output,
                cache_directory=tmp_path / "failure-cache",
                transport=transport,
                maximum_concurrency=2,
            )

        assert raised.value.failure is failure
        assert transport.requests <= 2
        assert transport.closed is False
        assert not output.exists()

    trio.run(scenario)
