#!/usr/bin/env python3
"""Hermetic oracles for prune extra-scope rules. Does not run turbo prune."""

from __future__ import annotations

import unittest

from prune import (
    expand_scopes,
    extra_paths_for_requested,
    fixpoint_expand,
)

CORE = "@hashintel/brunch-agent"
TRANSPORT = "@hashintel/brunch-agent-transport-aisdk"
APP = "@apps/brunch-agent"
PLUGIN_GHERKIN = "@hashintel/brunch-agent-plugin-gherkin"
PLUGIN_SDCPN = "@hashintel/brunch-agent-plugin-sdcpn"
WEBSITE = "@apps/petrinaut-website"


class BrunchRequestedExtras(unittest.TestCase):
    def test_core_task_graph_adds_the_app_plugins_and_context_paths(self) -> None:
        expected_workspaces = frozenset({APP, PLUGIN_GHERKIN, PLUGIN_SDCPN})
        expanded = fixpoint_expand(
            {CORE},
            {
                CORE: expected_workspaces,
                APP: frozenset({CORE}),
                PLUGIN_GHERKIN: frozenset({CORE}),
                PLUGIN_SDCPN: frozenset({CORE}),
            },
        )
        self.assertTrue(expected_workspaces.issubset(expanded))
        self.assertEqual(
            extra_paths_for_requested({CORE}),
            [
                ".config/oxlint/brunch",
                "libs/@hashintel/brunch-agent/AGENTS.md",
                "libs/@hashintel/brunch-agent/CONTEXT.md",
                "libs/@hashintel/brunch-agent/docs",
                "libs/@hashintel/brunch-agent/evaluations",
                "libs/@hashintel/brunch-agent/scripts",
            ],
        )

    def test_app_job_adds_the_baseline_evaluation_paths(self) -> None:
        self.assertEqual(
            extra_paths_for_requested({APP}),
            ["libs/@hashintel/brunch-agent/evaluations"],
        )

    def test_sibling_or_website_job_does_not_add_context_paths(self) -> None:
        self.assertEqual(extra_paths_for_requested({TRANSPORT}), [])
        self.assertEqual(extra_paths_for_requested({WEBSITE}), [])

class DarwinPrefix(unittest.TestCase):
    def test_child_crate_still_triggers_the_prefix_family(self) -> None:
        extras = expand_scopes({"@rust/darwin-kperf-sys"})
        self.assertIn("@rust/darwin-kperf-sys", extras)
        self.assertIn("@rust/darwin-kperf-events", extras)


TYPE_SYSTEM = "@blockprotocol/type-system"
TYPE_SYSTEM_RS = "@blockprotocol/type-system-rs"


class DependencyScopes(unittest.TestCase):
    def test_dependencies_become_scopes_and_trigger_extras(self) -> None:
        expanded = fixpoint_expand(
            {TYPE_SYSTEM}, {TYPE_SYSTEM: frozenset({TYPE_SYSTEM_RS})}
        )
        self.assertIn(TYPE_SYSTEM_RS, expanded)
        # The rust twin in scope also fires its EXTRA_DEPENDENCIES rule.
        self.assertIn("@rust/hash-graph-test-data", expanded)


if __name__ == "__main__":
    unittest.main()
