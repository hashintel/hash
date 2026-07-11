"""Human-readable report.md rendered from the report.json dict.

Every number in report.md comes from the loaded report.json: the renderer
takes the deserialized dict and only formats values already present in it.
"""

from atlas_tools.audit.evaluation import RunnerReport


def render_markdown(report: RunnerReport) -> str:
    lines: list[str] = ["# Prefix representation audit", ""]

    corpus = report.corpus
    lines += [
        f"Corpus: {corpus.rows} rows x {corpus.dim} dims;"
        f" {corpus.n_sampled} sampled queries"
        f" (seed {report.config.seed});"
        f" full-vector truth depth {corpus.full_truth_k}.",
        "",
        "## Metric definitions",
        "",
    ]
    for name in sorted(report.metric_definitions):
        lines.append(f"- **{name}**: {report.metric_definitions[name]}.")
    lines.append("")

    for k in report.config.ks:
        lines += [f"## k = {k}", ""]
        lines.append(
            f"| dim | recall@{k} | intrusion_rate@{k} | mean_rank_displacement@{k} |"
        )
        lines.append("| ---: | ---: | ---: | ---: |")

        for dim in report.config.dims:
            metrics = report.overall[dim][k]

            lines.append(
                f"| {dim} | {metrics.recall:.6f} | {metrics.intrusion_rate:.6f}"
                f" | {metrics.mean_rank_displacement:.6f} |"
            )

        lines.append("")

    lines += ["## Strata", ""]
    if report.config.strata is None:
        lines.append("No strata table provided.")
    else:
        n_groups = sum(len(values.columns) for values in report.groups.values())

        lines.append(
            f"{n_groups} group(s) evaluated"
            f" (min group size {report.config.min_group_size})."
        )
        lines.append("")
        flags = report.flags

        if not flags:
            lines.append("No groups flagged (degradation <= 2x overall everywhere).")
        else:
            lines.append("Flagged groups (group degradation > 2x overall):")
            lines.append("")

            for flag in flags:
                lines.append(
                    f"- `{flag.column}={flag.value}` at dim={flag.dim}, k={flag.k}:"
                    f" recall {flag.group_recall:.6f}"
                    f" vs overall {flag.overall_recall:.6f}"
                    f" (degradation {flag.group_degradation:.6f}"
                    f" vs {flag.overall_degradation:.6f},"
                    f" n={flag.n_queries})"
                )

    lines.append("")
    return "\n".join(lines)
