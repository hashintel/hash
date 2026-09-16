#!/usr/bin/env python3
"""Hermetic oracles for prune extra-scope rules. Does not run turbo prune."""

from __future__ import annotations

import unittest

from prune import extra_paths_for_requested, extras_for_requested

CORE = "@hashintel/brunch-agent"
TRANSPORT = "@hashintel/brunch-agent-transport-aisdk"
APP = "@apps/brunch-agent"
WEBSITE = "@apps/petrinaut-website"
FRONTEND = "@apps/hash-frontend"
PLAYWRIGHT = "@tests/hash-playwright"
ATLAS = "hash-graph-atlas"


class FrontendRequestedExtras(unittest.TestCase):
    def test_frontend_direct(self) -> None:
        self.assertEqual(extras_for_requested({FRONTEND}), frozenset({ATLAS}))

    def test_dependent_of_frontend_adds_nothing(self) -> None:
        self.assertEqual(extras_for_requested({PLAYWRIGHT}), frozenset())


class BrunchRequestedExtras(unittest.TestCase):
    def test_app_keeps_only_its_non_workspace_product_inputs(self) -> None:
        self.assertEqual(
            extra_paths_for_requested({APP}),
            [
                ".config/oxlint/brunch",
                "libs/@hashintel/brunch-agent/docs",
                "libs/@hashintel/brunch-agent/evaluations",
                "libs/@hashintel/petrinaut/docs",
            ],
        )

    def test_core_adds_only_its_shared_lint_config(self) -> None:
        self.assertEqual(extras_for_requested({CORE}), frozenset())
        self.assertEqual(
            extra_paths_for_requested({CORE}),
            [".config/oxlint/brunch"],
        )

    def test_sibling_or_website_job_does_not_add_context_paths(self) -> None:
        self.assertEqual(extra_paths_for_requested({TRANSPORT}), [])
        self.assertEqual(extra_paths_for_requested({WEBSITE}), [])
        self.assertEqual(extras_for_requested({WEBSITE}), frozenset())


if __name__ == "__main__":
    unittest.main()
