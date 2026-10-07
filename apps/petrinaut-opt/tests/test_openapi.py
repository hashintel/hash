import runpy
import shutil
import sys
from pathlib import Path
from types import ModuleType

import pytest

SCHEMA = b'{\n  "openapi": "3.1.0",\n  "paths": {}\n}\n'


class SchemaApplication:
    @staticmethod
    def openapi() -> dict[str, object]:
        return {"paths": {}, "openapi": "3.1.0"}


@pytest.fixture
def generator_script(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    script = tmp_path / "scripts" / "generate_openapi.py"
    script.parent.mkdir()
    shutil.copyfile(Path(__file__).resolve().parents[1] / "scripts" / script.name, script)
    api_module = ModuleType("petrinaut_optimization.api")
    monkeypatch.setattr(api_module, "app", SchemaApplication(), raising=False)
    monkeypatch.setitem(sys.modules, api_module.__name__, api_module)
    monkeypatch.setenv("PATH", "")
    return script


def run_generator(script: Path, monkeypatch: pytest.MonkeyPatch, *, check: bool) -> int:
    arguments = [str(script)]
    if check:
        arguments.append("--check")
    monkeypatch.setattr(sys, "argv", arguments)
    with pytest.raises(SystemExit) as exit_info:
        runpy.run_path(str(script), run_name="__main__")
    assert isinstance(exit_info.value.code, int)
    return exit_info.value.code


@pytest.mark.parametrize("existing", [None, b"stale schema"])
def test_generate_schema(
    *,
    generator_script: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    existing: bytes | None,
) -> None:
    schema_path = tmp_path / "openapi" / "openapi.json"
    if existing is not None:
        schema_path.parent.mkdir()
        schema_path.write_bytes(existing)

    assert run_generator(generator_script, monkeypatch, check=False) == 0
    assert schema_path.read_bytes() == SCHEMA


def test_check_current(
    *,
    generator_script: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    schema_path = tmp_path / "openapi" / "openapi.json"
    schema_path.parent.mkdir()
    schema_path.write_bytes(SCHEMA)

    def reject_write(_path: Path, _data: bytes) -> int:
        pytest.fail("checking a current schema must not rewrite it")

    monkeypatch.setattr(Path, "write_bytes", reject_write)

    assert run_generator(generator_script, monkeypatch, check=True) == 0
    assert schema_path.read_bytes() == SCHEMA
    assert not capsys.readouterr().err


@pytest.mark.parametrize("saved", [b"{}\n", b"\xff", SCHEMA.replace(b"\n", b"\r\n")])
def test_check_stale(
    *,
    generator_script: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    saved: bytes,
) -> None:
    schema_path = tmp_path / "openapi" / "openapi.json"
    schema_path.parent.mkdir()
    schema_path.write_bytes(saved)

    assert run_generator(generator_script, monkeypatch, check=True) == 1
    assert schema_path.read_bytes() == saved
    diagnostics = capsys.readouterr().err
    assert "out of date" in diagnostics
    assert "uv run python -m scripts.generate_openapi" in diagnostics


def test_check_missing(
    *,
    generator_script: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run_generator(generator_script, monkeypatch, check=True) == 1
    assert not (tmp_path / "openapi").exists()
    diagnostics = capsys.readouterr().err
    assert "missing" in diagnostics
    assert "uv run python -m scripts.generate_openapi" in diagnostics
