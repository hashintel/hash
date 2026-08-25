#!/usr/bin/env python3
"""Hermetic oracles for prune extra-scope rules. Does not run turbo prune."""

from __future__ import annotations

import unittest

from prune import (
    expand_scopes,
    extra_paths_for_requested,
    extras_for_requested,
    fixpoint_expand,
)

CORE = "@hashintel/brunch-agent"
TRANSPORT = "@hashintel/brunch-agent-transport-aisdk"
APP = "@apps/brunch-agent"
WEBSITE = "@apps/petrinaut-website"


class BrunchRequestedExtras(unittest.TestCase):
    def test_core_job_adds_the_app_and_context_paths(self) -> None:
        self.assertEqual(extras_for_requested({CORE}), frozenset({APP}))
        self.assertIn(
            APP,
            fixpoint_expand(
                {CORE} | extras_for_requested({CORE}),
                {CORE: frozenset(), APP: frozenset({CORE})},
            ),
        )
        self.assertEqual(
            extra_paths_for_requested({CORE}),
            [
                "libs/@hashintel/brunch-agent/AGENTS.md",
                "libs/@hashintel/brunch-agent/CONTEXT.md",
                "libs/@hashintel/brunch-agent/docs",
                "libs/@hashintel/brunch-agent/scripts",
            ],
        )

    def test_sibling_or_website_job_does_not_add_brunch_extras(self) -> None:
        self.assertEqual(extras_for_requested({TRANSPORT}), frozenset())
        self.assertEqual(extras_for_requested({WEBSITE}), frozenset())
        self.assertEqual(extra_paths_for_requested({TRANSPORT}), [])
        self.assertEqual(extra_paths_for_requested({WEBSITE}), [])

    def test_transitive_core_in_the_closure_does_not_add_the_app(self) -> None:
        dependencies = {
            WEBSITE: frozenset({TRANSPORT}),
            TRANSPORT: frozenset({CORE}),
            CORE: frozenset(),
        }
        expanded = fixpoint_expand({WEBSITE}, dependencies)
        self.assertNotIn(APP, expanded)
        self.assertEqual(extras_for_requested({WEBSITE}), frozenset())


class DarwinPrefix(unittest.TestCase):
    def test_child_crate_still_triggers_the_prefix_family(self) -> None:
        extras = expand_scopes({"@rust/darwin-kperf-sys"})
        self.assertIn("@rust/darwin-kperf-sys", extras)
        self.assertIn("@rust/darwin-kperf-events", extras)


if __name__ == "__main__":
    unittest.main()
