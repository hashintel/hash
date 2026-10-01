import os
import stat
import tempfile
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from repo_chores.constraints._engine.diagnostics import FixError
from repo_chores.constraints._engine.manifest import Manifest


@dataclass(frozen=True, slots=True, kw_only=True)
class PreparedManifest:
    manifest: Manifest
    content: bytes


@dataclass(frozen=True, slots=True, kw_only=True)
class StagedManifest:
    prepared: PreparedManifest
    temporary: Path


class ManifestWrites:
    def __init__(self, *, manifests: Iterable[Manifest]) -> None:
        self._manifests = tuple(manifests)
        self._prepared = tuple(
            PreparedManifest(manifest=manifest, content=content)
            for manifest in sorted(self._manifests, key=lambda manifest: manifest.path)
            if (content := manifest.render()) != manifest.original
        )

    @staticmethod
    def _stage(
        *,
        prepared: PreparedManifest,
        staged: list[StagedManifest],
        written: list[Path],
    ) -> None:
        path = prepared.manifest.path

        try:  # ruff: ignore[too-many-statements-in-try-clause] - I/O failure is a possibility in all statements
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=path.parent,
                prefix=f".{path.name}.",
                suffix=".tmp",
                delete=False,
            ) as output:
                temporary = Path(output.name)
                staged.append(StagedManifest(prepared=prepared, temporary=temporary))

                output.write(prepared.content)
                output.flush()

                os.fsync(output.fileno())
                temporary.chmod(stat.S_IMODE(path.stat().st_mode))
        except OSError as error:
            raise FixError(path=path, written=tuple(written)) from error

    def _apply(self, *, staged: list[StagedManifest], written: list[Path]) -> None:
        for prepared in self._prepared:
            self._stage(prepared=prepared, staged=staged, written=written)

        for manifest in self._manifests:
            manifest.verify()

        for replacement in staged:
            manifest = replacement.prepared.manifest
            manifest.verify()

            try:
                replacement.temporary.replace(manifest.path)
            except OSError as error:
                raise FixError(path=manifest.path, written=tuple(written)) from error

            written.append(manifest.path)

    def apply(self) -> tuple[Path, ...]:
        """Refuse stale inputs, then atomically replace each changed manifest.

        Replacement is atomic per file, not across the workspace. An I/O failure
        carries the paths already written; it never rolls back over another writer.
        """
        if not self._prepared:
            return ()
        for manifest in self._manifests:
            manifest.verify()

        staged: list[StagedManifest] = []
        written: list[Path] = []
        failure: BaseException | None = None

        try:
            self._apply(staged=staged, written=written)
        except BaseException as error:
            failure = error
            if written:
                error.add_note(f"Manifests already written: {tuple(written)}")

            raise
        finally:
            for replacement in staged:
                try:
                    replacement.temporary.unlink(missing_ok=True)
                except OSError as error:
                    if failure is None:
                        raise FixError(
                            path=replacement.temporary, written=tuple(written)
                        ) from error

                    failure.add_note(
                        f"Could not remove temporary file {replacement.temporary}: {error}"
                    )

        return tuple(written)
