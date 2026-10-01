from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

from repo_chores.constraints._engine.diagnostics import (
    ConvergenceError,
    Diagnostic,
    Diagnostics,
    RuleError,
    RuleWarning,
)
from repo_chores.constraints._engine.location import Location
from repo_chores.constraints._engine.report import (
    CheckReport,
    CheckStatus,
    FixReport,
    ManifestDiff,
)
from repo_chores.constraints._engine.workspace import (
    Workspace,
    WorkspaceInputs,
)
from repo_chores.constraints._engine.writes import ManifestWrites

type Constraint = Callable[[Workspace], None]


@dataclass(frozen=True, slots=True, kw_only=True)
class Evaluation:
    inputs: WorkspaceInputs
    report: CheckReport


@dataclass(frozen=True, slots=True, kw_only=True)
class Engine:
    directory: Path
    max_passes: int = 100

    def __post_init__(self) -> None:
        if self.max_passes < 1:
            raise ValueError("max_passes must be positive")

    def _evaluate(self, constraints: Iterable[Constraint]) -> Evaluation:
        """Run passes over the live documents until one makes no change.

        A pass whose resulting state repeats an earlier one is a cycle, even when
        its own writes cancel out, and blocks evaluation.
        """
        rules = tuple(constraints)
        inputs = WorkspaceInputs.load(self.directory)
        with inputs.recorder.activate():
            return self._run(rules=rules, inputs=inputs)

    def _run(self, *, rules: tuple[Constraint, ...], inputs: WorkspaceInputs) -> Evaluation:
        trace = inputs.recorder
        seen = {inputs.fingerprint(): 0}
        warnings: dict[tuple[Location, str, str], RuleWarning] = {}

        def finish(diagnostics: Iterable[Diagnostic], passes: int) -> Evaluation:
            diffs = tuple(
                ManifestDiff(path=manifest.path, before=manifest.original, after=rendered)
                for manifest in sorted(inputs.files, key=lambda manifest: manifest.path)
                if (rendered := manifest.render()) is not None and rendered != manifest.original
            )
            errors = (entry for entry in diagnostics if isinstance(entry, RuleError))
            return Evaluation(
                inputs=inputs,
                report=CheckReport(
                    operations=tuple(trace.operations),
                    diffs=diffs,
                    diagnostics=(*errors, *warnings.values()),
                    passes=passes,
                ),
            )

        def fixpoint(message: str) -> RuleError:
            root = inputs.root.path
            return RuleError(
                location=Location(manifest=root, path=()),
                rule="<fixpoint>",
                error=ConvergenceError(directory=root.parent, message=message),
            )

        for pass_number in range(1, self.max_passes + 1):
            trace.pass_number = pass_number
            operations = len(trace.operations)
            diagnostics = Diagnostics()
            workspace = Workspace(inputs=inputs, diagnostics=diagnostics)

            for constraint in rules:
                name = getattr(constraint, "__qualname__", type(constraint).__qualname__)
                diagnostics.rule = trace.rule = (
                    name if isinstance(name, str) else type(constraint).__qualname__
                )
                constraint(workspace)

            for entry in diagnostics.entries:
                if isinstance(entry, RuleWarning):
                    warnings.setdefault((entry.location, entry.rule, str(entry.warning)), entry)

            if len(trace.operations) == operations:
                return finish(diagnostics.entries, pass_number)

            fingerprint = inputs.fingerprint()
            if fingerprint in seen:
                return finish(
                    (
                        *diagnostics.entries,
                        fixpoint(
                            f"constraints revisited pass {seen[fingerprint]} after pass {pass_number}"
                        ),
                    ),
                    pass_number,
                )

            seen[fingerprint] = pass_number

        return finish(
            (fixpoint(f"constraints did not converge within {self.max_passes} passes"),),
            self.max_passes,
        )

    def check(self, constraints: Iterable[Constraint]) -> CheckReport:
        return self._evaluate(constraints).report

    def fix(self, constraints: Iterable[Constraint]) -> FixReport:
        evaluation = self._evaluate(constraints)
        if evaluation.report.status is CheckStatus.BLOCKED:
            return FixReport(report=evaluation.report, written=())

        written = ManifestWrites(manifests=evaluation.inputs.files).apply()
        return FixReport(report=evaluation.report, written=written)
