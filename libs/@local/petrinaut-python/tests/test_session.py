from __future__ import annotations

import json

import pytest

from petrinaut import (
    PetrinautProtocolError,
    PetrinautRunError,
    PetrinautSession,
)

from .conftest import FakeProcess, spawn


def test_file_session_requests() -> None:
    process = FakeProcess(
        [
            {"id": 1, "result": {"ok": True}},
            {"id": 2, "result": {"parameters": [], "places": [], "metrics": []}},
            {"id": 3, "result": {"seed": 42, "metrics": {"Metric": 1.5}}},
        ]
    )
    invocation = spawn(process)
    session = PetrinautSession.from_model_file(
        "./model.json",
        command=("node", "/cli.js"),
        popen_factory=invocation["popen_factory"],
    )
    session.start()

    assert session.healthz() == {"ok": True}
    assert session.metadata() == {"parameters": [], "places": [], "metrics": []}
    assert session.run({"maxSteps": 10, "seed": 42})["metrics"] == {"Metric": 1.5}

    assert invocation["command"] == [
        "node",
        "/cli.js",
        "serve",
        "--model",
        "./model.json",
        "--stdio",
    ]
    lines = [json.loads(line) for line in process.stdin.getvalue().splitlines()]
    # A file source writes no bootstrap line: the first stdin line is a request.
    assert lines[0] == {"id": 1, "method": "healthz"}
    assert lines[2] == {
        "id": 3,
        "method": "run",
        "params": {"maxSteps": 10, "seed": 42},
    }
    session.close()


def test_stdin_model_bootstrap() -> None:
    process = FakeProcess([{"id": 1, "result": {"ok": True}}])
    invocation = spawn(process)
    session = PetrinautSession.from_model(
        {"title": "Example", "places": []},
        command=("node", "/cli.js"),
        popen_factory=invocation["popen_factory"],
    )
    session.start()
    assert session.healthz() == {"ok": True}

    assert invocation["command"] == [
        "node",
        "/cli.js",
        "serve",
        "--model-stdin",
        "--stdio",
    ]
    lines = [json.loads(line) for line in process.stdin.getvalue().splitlines()]
    assert lines[0] == {"title": "Example", "places": []}
    assert lines[1] == {"id": 1, "method": "healthz"}
    session.close()


def test_error_frame_recovery() -> None:
    process = FakeProcess(
        [
            {"id": 1, "error": {"message": 'Unknown parameter "x"'}},
            {"id": 2, "result": {"ok": True}},
        ]
    )
    invocation = spawn(process)
    session = PetrinautSession.from_model_file(
        "./model.json", popen_factory=invocation["popen_factory"]
    )
    session.start()

    with pytest.raises(PetrinautRunError, match='Unknown parameter "x"'):
        session.run({"maxSteps": 1, "parameters": {"x": 1}})
    assert session.healthz() == {"ok": True}
    session.close()


def test_non_object_result_rejected() -> None:
    process = FakeProcess([{"id": 1, "result": 42}])
    invocation = spawn(process)
    session = PetrinautSession.from_model_file(
        "./model.json", popen_factory=invocation["popen_factory"]
    )
    session.start()

    with pytest.raises(PetrinautProtocolError, match="non-object result"):
        session.healthz()


def test_request_custom_method() -> None:
    process = FakeProcess([{"id": 1, "result": [1, 2, 3]}])
    invocation = spawn(process)
    session = PetrinautSession.from_model_file(
        "./model.json", popen_factory=invocation["popen_factory"]
    )
    session.start()

    assert session.request("custom.method", {"key": "value"}) == [1, 2, 3]
    lines = [json.loads(line) for line in process.stdin.getvalue().splitlines()]
    assert lines[0] == {
        "id": 1,
        "method": "custom.method",
        "params": {"key": "value"},
    }
    session.close()


def test_invalid_params_recovery() -> None:
    process = FakeProcess([{"id": 1, "result": {"ok": True}}])
    invocation = spawn(process)
    session = PetrinautSession.from_model_file(
        "./model.json",
        command=("node", "/cli.js"),
        popen_factory=invocation["popen_factory"],
    )
    session.start()

    with pytest.raises(TypeError, match="not JSON-serializable"):
        session.request("run", {"bad": object()})

    # The caller's bug must not have closed the healthy session.
    assert session.healthz() == {"ok": True}
    session.close()


def test_invalid_model_before_spawn() -> None:
    with pytest.raises(TypeError, match="not JSON-serializable"):
        PetrinautSession.from_model({"bad": object()})


def test_large_model_before_spawn() -> None:
    with pytest.raises(ValueError, match="MiB limit"):
        PetrinautSession.from_model({"blob": "x" * (9 * 1024 * 1024)})
