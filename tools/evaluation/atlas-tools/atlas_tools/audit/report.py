"""Human-readable report.md rendered from the report.json dict.

Every number in report.md comes from the loaded report.json: the renderer
takes the deserialized dict and only formats values already present in it.
"""

from __future__ import annotations

from typing import Any


def render_markdown(report: dict[str, Any]) -> str:
    config = report["config"]
    dims = config["dims"]
    ks = config["ks"]

    lines: list[str] = ["# Prefix representation audit", ""]

    corpus = report["corpus"]
    lines += [
        f"Corpus: {corpus['rows']} rows x {corpus['dim']} dims;"
        f" {corpus['n_sampled']} sampled queries"
        f" (seed {config['seed']});"
        f" full-vector truth depth {corpus['full_truth_k']}.",
        "",
        "## Metric definitions",
        "",
    ]
    for name in sorted(report["metric_definitions"]):
        lines.append(f"- **{name}**: {report['metric_definitions'][name]}.")
    lines.append("")

    for k in ks:
        lines += [f"## k = {k}", ""]
        lines.append(
            f"| dim | recall@{k} | intrusion_rate@{k} | mean_rank_displacement@{k} |"
        )
        lines.append("| ---: | ---: | ---: | ---: |")
        for d in dims:
            m = report["overall"][str(d)][str(k)]
            lines.append(
                f"| {d} | {m['recall']:.6f} | {m['intrusion_rate']:.6f}"
                f" | {m['mean_rank_displacement']:.6f} |"
            )
        lines.append("")

    lines += ["## Strata", ""]
    if config["strata"] is None:
        lines.append("No strata table provided.")
    else:
        n_groups = sum(len(values) for values in report["groups"].values())
        lines.append(
            f"{n_groups} group(s) evaluated"
            f" (min group size {config['min_group_size']})."
        )
        lines.append("")
        flags = report["flags"]
        if not flags:
            lines.append("No groups flagged (degradation <= 2x overall everywhere).")
        else:
            lines.append("Flagged groups (group degradation > 2x overall):")
            lines.append("")
            for f in flags:
                lines.append(
                    f"- `{f['column']}={f['value']}` at dim={f['dim']}, k={f['k']}:"
                    f" recall {f['group_recall']:.6f}"
                    f" vs overall {f['overall_recall']:.6f}"
                    f" (degradation {f['group_degradation']:.6f}"
                    f" vs {f['overall_degradation']:.6f},"
                    f" n={f['n_queries']})"
                )
    lines.append("")
    return "\n".join(lines)
