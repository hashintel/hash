#!/usr/bin/env python3
"""Hermetic graph-output reuse checks; never compile Rust or launch services."""

from __future__ import annotations

import contextlib
import errno
import io
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import graph_build_cache as cache


def binary(path: Path, content: bytes = b"compiled") -> None:
    header = bytearray(64)
    header[:6] = b"\x7fELF\x02\x01"
    header[18:20] = (62).to_bytes(2, "little")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + content)
    path.chmod(0o755)


class GraphBuildCache(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.env = {"HASH_GRAPH_BUILD_CACHE": "1", "HOME": str(self.root / "home"), "PATH": "/usr/bin"}
        self.isolated = {"HOME": self.env["HOME"], "PATH": "/usr/bin", "LANG": "C.UTF-8"}
        self.files = ["Cargo.toml", "Cargo.lock", ".cargo/config.toml", "rust-toolchain.toml",
                      "apps/hash-graph/package.json", "apps/hash-graph/Cargo.toml", "apps/hash-graph/src/main.rs",
                      "libs/dependency/Cargo.toml", "libs/dependency/src/lib.rs",
                      "libs/dependency/migrations/up.sql", "web/source.ts"]
        for name in self.files:
            self.write(name, b"input\n")
        self.write(".cargo/config.toml", b"[target.'cfg(target_arch = \"x86_64\")']\nrustflags = [\"-Ctarget-cpu=x86-64-v3\"]\n")
        self.write("apps/hash-graph/package.json", json.dumps({"scripts": {"compile": " ".join(cache.COMMAND)}}).encode())
        self.metadata = {"target_directory": str(self.root / "target"), "workspace_root": str(self.root),
                         "resolve": {"nodes": [{"id": "graph", "deps": [{"pkg": "dependency"}], "features": []},
                                                {"id": "dependency", "deps": [], "features": []}]},
                         "packages": [{"id": name, "name": name, "version": "0.1.0", "source": None, "manifest_path": str(self.root / directory / "Cargo.toml"),
                                       "targets": [{"name": "hash-graph" if name == "graph" else name,
                                                    "kind": ["bin" if name == "graph" else "lib"],
                                                    "src_path": str(self.root / directory / "src" / source)}]}
                                      for name, directory, source in (("graph", "apps/hash-graph", "main.rs"),
                                                                      ("dependency", "libs/dependency", "lib.rs"))]}
        for name, version in (("kiddo", "6.0.0"), ("yep-cache-line-size", "0.9.3"), ("raw-cpuid", "11.6.0")):
            self.metadata["packages"].append({"id": name, "name": name, "version": version,
                                              "source": "registry+https://github.com/rust-lang/crates.io-index",
                                              "manifest_path": f"/registry/{name}/Cargo.toml", "targets": []})
            self.metadata["resolve"]["nodes"].append({"id": name, "deps": [], "features": []})
            self.metadata["resolve"]["nodes"][0]["deps"].append({"pkg": name})
        self.tracked = b"\0".join(name.encode() for name in self.files) + b"\0"
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(cache.platform, "machine", return_value="x86_64"))
        self.stack.enter_context(patch.object(cache, "compiler_environment", return_value=(self.isolated, "tools-v1")))
        self.stack.enter_context(patch.object(cache, "native_cache_line", return_value=64))
        self.stack.enter_context(patch.object(cache, "machine_digest", side_effect=lambda root, env: cache.digest((str(root) + env.get("ImageVersion", "")).encode())))
        self.stack.enter_context(patch.object(cache.subprocess, "check_output", return_value=self.tracked))
        self.metadata_command = self.stack.enter_context(patch.object(cache, "run", side_effect=lambda *args: json.dumps(self.metadata).encode()))
        self.stack.enter_context(contextlib.redirect_stderr(io.StringIO()))
        self.output = self.root / "target/debug/hash-graph"
        self.payload = self.root / "target/graph-build-cache"

    def write(self, name: str, value: bytes) -> Path:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
        return path

    def key(self) -> str:
        return cache.fingerprint(self.root, self.env)[0]

    def compile(self, code: int = 0, mutation=None, produce: bool = True, content: bytes = b"compiled"):
        def build(command, *, cwd, env):
            self.assertEqual(command, cache.COMMAND)
            self.assertEqual(cwd, self.root / "apps/hash-graph")
            if mutation:
                mutation()
            if not code and produce:
                binary(self.output, content)
            return subprocess.CompletedProcess(command, code)
        return patch.object(cache.subprocess, "run", side_effect=build)

    def publish(self) -> bool:
        return cache.publish(self.root, {**self.env, "EXPECTED_GRAPH_BUILD_KEY": self.key()})

    def test_exact_hit_restores_only_binary_without_compiling(self) -> None:
        with self.compile() as build:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            self.assertEqual(build.call_count, 1)
            self.assertEqual(self.metadata_command.call_count, 1)
        self.assertFalse(self.payload.exists())
        with self.compile() as build, patch.object(cache, "fingerprint") as inspect, \
             patch.object(cache, "file_digest", wraps=cache.file_digest) as hashes:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            build.assert_not_called()
            inspect.assert_not_called()
        self.assertFalse(any(call.args[0] == self.output for call in hashes.call_args_list))
        self.assertTrue(self.publish())
        self.assertEqual(sorted(path.name for path in self.payload.iterdir()), ["hash-graph", "manifest.json"])
        self.output.unlink()
        cache.clear_ready(self.root)
        with self.compile() as build, patch.object(cache, "file_digest", wraps=cache.file_digest) as hashes:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            build.assert_not_called()
        binary_hashes = [call.args[0] for call in hashes.call_args_list
                         if call.args[0] in {self.output, self.payload / "hash-graph"}]
        self.assertEqual(binary_hashes, [self.payload / "hash-graph"])
        self.assertEqual(self.output.read_bytes(), (self.payload / "hash-graph").read_bytes())
        self.assertTrue(self.output.samefile(self.payload / "hash-graph"))
        inode = self.output.stat().st_ino
        with self.compile() as build, patch.object(cache, "file_digest", wraps=cache.file_digest) as hashes:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            build.assert_not_called()
        binary_hashes = [call.args[0] for call in hashes.call_args_list
                         if call.args[0] in {self.output, self.payload / "hash-graph"}]
        self.assertEqual(binary_hashes, [])
        self.assertEqual(inode, self.output.stat().st_ino)

    def test_rejected_restored_payload_falls_back_to_cargo(self) -> None:
        with self.compile():
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
        self.assertTrue(self.publish())
        self.output.unlink()
        cache.clear_ready(self.root)
        save_ready = cache.save_ready
        attempts = 0

        def reject_once(*args):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise cache.NoReuse("synthetic-input-drift")
            return save_ready(*args)

        with patch.object(cache, "save_ready", side_effect=reject_once), \
             self.compile(content=b"rebuilt after rejection") as build:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            build.assert_called_once()
        self.assertEqual(attempts, 2)
        self.assertIn(b"rebuilt after rejection", self.output.read_bytes())
        self.assertFalse(self.output.samefile(self.payload / "hash-graph"))

    def test_transient_source_change_during_build_does_not_mark_ready(self) -> None:
        source = self.root / "apps/hash-graph/src/main.rs"
        original = source.read_bytes()

        def build(command, *, cwd, env):
            source.write_bytes(b"transient source")
            binary(self.output, b"compiled from transient source")
            source.write_bytes(original)
            return subprocess.CompletedProcess(command, 0)

        with patch.object(cache.subprocess, "run", side_effect=build):
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
        self.assertEqual(source.read_bytes(), original)
        self.assertFalse((self.root / cache.READY_STATE).exists())
        with self.compile(content=b"stable rebuild") as stable:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            stable.assert_called_once()

    def test_live_ready_invalidates_source_environment_tool_and_affinity(self) -> None:
        source = self.root / "apps/hash-graph/src/main.rs"
        original_source = source.read_bytes()
        first_bin = self.root / "first-bin"
        second_bin = self.root / "second-bin"
        for directory in (first_bin, second_bin):
            binary(directory / "wrapper")
        tool_env = {**self.env, "PATH": f"{first_bin}:/usr/bin", "RUSTC_WRAPPER": "wrapper"}
        moved_tool_env = {**tool_env, "PATH": f"{second_bin}:/usr/bin"}
        cases = [
            ("source", self.env, self.env,
             lambda: source.write_bytes(b"changed source"), {0, 1}, {0, 1}),
            ("external environment", self.env, {**self.env, "DEP_SYNTHETIC": "changed"},
             lambda: None, {0, 1}, {0, 1}),
            ("tool resolution", tool_env, moved_tool_env,
             lambda: None, {0, 1}, {0, 1}),
            ("affinity", self.env, self.env,
             lambda: None, {0, 1}, {0}),
        ]
        for name, initial, changed, mutate, initial_affinity, changed_affinity in cases:
            with self.subTest(name=name):
                shutil.rmtree(self.root / "target", ignore_errors=True)
                source.write_bytes(original_source)
                with patch.object(cache.os, "sched_getaffinity", return_value=initial_affinity,
                                  create=True), self.compile():
                    self.assertEqual(cache.compile_graph(self.root, initial), 0)
                mutate()
                with patch.object(cache.os, "sched_getaffinity", return_value=changed_affinity,
                                  create=True), self.compile() as build, \
                     patch.object(cache, "fingerprint", wraps=cache.fingerprint) as inspect:
                    self.assertEqual(cache.compile_graph(self.root, changed), 0)
                    build.assert_called_once()
                    self.assertGreaterEqual(inspect.call_count, 1)
        source.write_bytes(original_source)

    @unittest.skipUnless("fork" in multiprocessing.get_all_start_methods(), "requires POSIX processes")
    def test_concurrent_compilers_and_fallback_share_one_lock(self) -> None:
        context = multiprocessing.get_context("fork")
        fingerprint = cache.fingerprint
        for fallback in (False, True):
            with self.subTest(fallback=fallback):
                shutil.rmtree(self.root / "target", ignore_errors=True)
                entered = context.Event()
                release = context.Event()
                second_started = context.Event()
                overlapping_build = context.Event()
                builds = context.Value("i", 0)

                def inspect(root, env):
                    if env.get("RUSTFLAGS"):
                        raise cache.NoReuse("synthetic-unsupported")
                    return fingerprint(root, env)

                def build(command, *, cwd, env):
                    with builds.get_lock():
                        builds.value += 1
                        number = builds.value
                    if number > 1 and not release.is_set():
                        overlapping_build.set()
                    entered.set()
                    if not release.wait(10):
                        raise AssertionError("compiler was not released")
                    binary(self.output)
                    return subprocess.CompletedProcess(command, 0)

                def worker(second):
                    env = dict(self.env)
                    if second:
                        second_started.set()
                        if fallback:
                            env["RUSTFLAGS"] = "custom"
                    if cache.compile_graph(self.root, env) != 0:
                        raise AssertionError("compiler failed")

                processes = [context.Process(target=worker, args=(second,)) for second in (False, True)]
                try:
                    with patch.object(cache, "fingerprint", side_effect=inspect), patch.object(cache.subprocess, "run", side_effect=build):
                        processes[0].start()
                        self.assertTrue(entered.wait(5))
                        processes[1].start()
                        self.assertTrue(second_started.wait(5))
                        self.assertFalse(overlapping_build.wait(0.2))
                        release.set()
                        for process in processes:
                            process.join(10)
                            self.assertEqual(process.exitcode, 0)
                    self.assertEqual(builds.value, 2 if fallback else 1)
                    self.assertFalse(overlapping_build.is_set())
                finally:
                    release.set()
                    for process in processes:
                        if process.is_alive():
                            process.terminate()
                        if process.pid is not None:
                            process.join(5)

    def test_changed_inputs_and_cargo_replacement_preserve_old_payload_inode(self) -> None:
        with self.compile():
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
        self.assertTrue(self.publish())
        old_key = self.key()
        old_binary = self.payload / "hash-graph"
        old_content = old_binary.read_bytes()
        retained = self.root / "retained-graph"
        os.link(old_binary, retained)
        self.write("apps/hash-graph/src/main.rs", b"changed input")
        with self.compile(content=b"changed executable"):
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
        self.assertTrue(self.publish())
        self.assertEqual(retained.read_bytes(), old_content)
        self.assertNotEqual(old_key, self.key())
        self.assertFalse(self.output.samefile(old_binary))
        self.assertEqual(old_binary.read_bytes(), self.output.read_bytes())

        # Cargo links its final output from deps, removing old paths before relinking.
        dependency_output = self.root / "target/debug/deps/hash-graph-example"
        dependency_output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.output, dependency_output)
        self.assertFalse(dependency_output.samefile(old_binary))
        before = old_binary.read_bytes()
        key = self.key()
        with cache.build_lock(self.root):
            dependency_output.unlink()
            binary(dependency_output, b"normal Cargo replacement")
            self.output.unlink()
            os.link(dependency_output, self.output)
        self.assertEqual(old_binary.read_bytes(), before)
        self.assertIsNotNone(cache.verified_payload_digest(self.payload, key))

    def test_runtime_mutation_does_not_corrupt_detached_payload(self) -> None:
        for mutation in (lambda: self.output.write_bytes(b"corrupt"), lambda: self.output.chmod(0o644)):
            shutil.rmtree(self.root / "target", ignore_errors=True)
            with self.compile():
                self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            self.assertTrue(self.publish())
            self.assertFalse(self.output.samefile(self.payload / "hash-graph"))
            cached = (self.payload / "hash-graph").read_bytes()
            mutation()
            self.assertEqual((self.payload / "hash-graph").read_bytes(), cached)
            self.assertIsNotNone(cache.verified_payload_digest(self.payload, self.key()))
            with self.compile() as build:
                self.assertEqual(cache.compile_graph(self.root, self.env), 0)
                build.assert_not_called()
            self.assertTrue(self.output.samefile(self.payload / "hash-graph"))

    def test_corrupted_payload_recovers_from_fresh_cargo_dependency_output(self) -> None:
        dependency_output = self.root / "target/debug/deps/hash_graph-example"

        def uplift(command, *, cwd, env):
            if not dependency_output.exists():
                binary(dependency_output, b"original executable body")
            self.output.unlink(missing_ok=True)
            os.link(dependency_output, self.output)
            return subprocess.CompletedProcess(command, 0)

        with patch.object(cache.subprocess, "run", side_effect=uplift) as build:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            self.assertTrue(self.publish())
            original = dependency_output.read_bytes()
            self.assertTrue(self.output.samefile(dependency_output))
            self.assertFalse(self.output.samefile(self.payload / "hash-graph"))
            with (self.payload / "hash-graph").open("r+b") as stream:
                stream.seek(64)
                stream.write(b"corrupted")
            self.assertIsNone(cache.verified_payload_digest(self.payload, self.key()))
            cache.clear_ready(self.root)
            self.output.unlink()
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            self.assertEqual(build.call_count, 2)
            self.assertTrue(self.output.samefile(dependency_output))
            self.assertEqual(self.output.read_bytes(), original)
            self.assertTrue(self.publish())
            self.assertFalse(self.output.samefile(self.payload / "hash-graph"))
            self.assertIsNotNone(cache.verified_payload_digest(self.payload, self.key()))

    def test_copy_fallback_and_atomic_staging_cleanup(self) -> None:
        with patch.object(cache.os, "link", side_effect=OSError(errno.EXDEV, "cross-device link")):
            with self.compile():
                self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            self.assertTrue(self.publish())
            self.assertFalse(self.output.samefile(self.payload / "hash-graph"))
            self.output.unlink()
            with self.compile() as build:
                self.assertEqual(cache.compile_graph(self.root, self.env), 0)
                build.assert_not_called()
            self.assertEqual(self.output.read_bytes(), (self.payload / "hash-graph").read_bytes())
        before = self.output.read_bytes()
        with patch.object(cache.os, "replace", side_effect=OSError("synthetic replacement failure")):
            with self.assertRaises(OSError):
                cache.link_or_copy_binary(self.payload / "hash-graph", self.output)
        self.assertEqual(self.output.read_bytes(), before)
        payload_before = (self.payload / "hash-graph").read_bytes()
        with patch.object(cache.shutil, "copy2", side_effect=OSError("synthetic copy failure")):
            with self.assertRaises(OSError):
                cache.write_payload(self.payload, self.output, self.key())
        self.assertEqual((self.payload / "hash-graph").read_bytes(), payload_before)
        self.assertEqual(self.output.read_bytes(), before)
        self.assertEqual(list((self.root / "target").rglob(".hash-graph-*")), [])
        self.assertEqual(list((self.root / "target").rglob(".snapshot-*")), [])

    def test_publish_rejects_payload_changed_after_hash(self) -> None:
        with self.compile():
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
        write_payload = cache.write_payload

        def corrupt_after_write(*args):
            result = write_payload(*args)
            with (self.payload / "hash-graph").open("r+b") as stream:
                stream.seek(64)
                stream.write(b"corrupt")
            return result

        with patch.object(cache, "write_payload", side_effect=corrupt_after_write):
            self.assertFalse(self.publish())
        self.assertFalse(self.payload.exists())
        self.assertTrue((self.root / cache.READY_STATE).exists())
        self.assertTrue(self.output.exists())
        with self.compile() as build:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            build.assert_not_called()

    def test_tar_payload_restores_without_external_hardlink(self) -> None:
        with self.compile():
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
        self.assertTrue(self.publish())
        archive = self.root / "payload.tar"
        key = self.key()
        subprocess.run(["tar", "--posix", "-cf", str(archive), "-C", str(self.root),
                        "target/graph-build-cache"], check=True)
        with tarfile.open(archive) as contents:
            self.assertTrue(contents.getmember("target/graph-build-cache/hash-graph").isfile())
            self.assertNotIn("target/graph-build-cache.lock", contents.getnames())
        self.output.unlink()
        shutil.rmtree(self.payload)
        subprocess.run(["tar", "-xf", str(archive), "-C", str(self.root)], check=True)
        self.assertEqual((self.payload / "hash-graph").stat().st_nlink, 1)
        self.assertIsNotNone(cache.verified_payload_digest(self.payload, key))
        with self.compile() as build:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            build.assert_not_called()

    def test_source_changes_include_transitive_non_rust_generated_and_deletions(self) -> None:
        before = self.key()
        for name in self.files:
            if name in {".cargo/config.toml", "web/source.ts"}:
                continue
            with self.subTest(name=name):
                path = self.root / name
                old = path.read_bytes()
                path.write_bytes(old + b"changed")
                self.assertNotEqual(before, self.key())
                path.write_bytes(old)
                path.unlink()
                self.assertNotEqual(before, self.key())
                path.write_bytes(old)
        generated = self.write("libs/dependency/generated/types.rs", b"generated")
        self.assertNotEqual(before, self.key())
        generated.unlink()
        self.assertEqual(before, self.key())
        self.write("libs/dependency/target/build/artifact", b"output")
        self.assertEqual(before, self.key())

    def test_key_binds_resolution_environment_tools_platform_and_absolute_path(self) -> None:
        before = self.key()
        self.metadata["resolve"]["nodes"][1]["features"] = ["new-feature"]
        self.assertNotEqual(before, self.key())
        self.metadata["resolve"]["nodes"][1]["features"] = []
        self.isolated["CARGO_INCREMENTAL"] = "0"
        self.assertNotEqual(before, self.key())
        del self.isolated["CARGO_INCREMENTAL"]
        with patch.object(cache, "compiler_environment", return_value=(self.isolated, "tools-v2")):
            self.assertNotEqual(before, self.key())
        self.env["ImageVersion"] = "new-image"
        self.assertNotEqual(before, self.key())
        del self.env["ImageVersion"]
        self.assertEqual(before, self.key())
        with patch.object(cache, "machine_digest", return_value="another-root"):
            self.assertNotEqual(before, self.key())
        with patch.object(cache, "native_cache_line", return_value=128):
            self.assertNotEqual(before, self.key())

    def test_unrelated_files_and_disconnected_packages_keep_the_key(self) -> None:
        before = self.key()
        for name in ("web/source.ts", "README.md", ".github/workflows/example.yml"):
            self.write(name, b"unrelated change")
        self.metadata["packages"].append({"id": "unrelated", "name": "unrelated", "source": None,
                                          "manifest_path": str(self.root / "other/Cargo.toml"), "targets": []})
        self.metadata["resolve"]["nodes"].append({"id": "unrelated", "deps": [], "features": ["unused"]})
        self.metadata["workspace_members"] = ["graph", "dependency", "unrelated"]
        self.write("other/src/lib.rs", b"unrelated source")
        self.assertEqual(before, self.key())
        self.metadata["resolve"]["nodes"][0]["deps"].append({"pkg": "unrelated", "name": "renamed", "dep_kinds": [{"kind": "dev", "target": "cfg(windows)"}]})
        reached = self.key()
        self.assertNotEqual(before, reached)
        self.write("other/src/lib.rs", b"changed dependency")
        self.assertNotEqual(reached, self.key())
        before_helper_change = self.key()
        self.write(".github/actions/graph-build-cache/cache_line_probe.rs", b"changed probe")
        self.assertNotEqual(before_helper_change, self.key())

    def test_resolution_rejects_missing_ambiguous_or_external_inputs(self) -> None:
        original = json.dumps(self.metadata)
        mutations = [
            lambda data: data.update(resolve=None),
            lambda data: data["packages"].append(data["packages"][0]),
            lambda data: data["resolve"]["nodes"].append(data["resolve"]["nodes"][0]),
            lambda data: data["resolve"]["nodes"].pop(),
            lambda data: data["packages"][0].update(targets=[]),
            lambda data: data["packages"][1]["targets"][0].update(src_path=str(self.root / "other.rs")),
            lambda data: data["packages"][1].update(readme="../outside.md"),
            lambda data: data["packages"][1]["targets"][0].update(src_path=str(self.root / "libs/dependency/target/generated.rs")),
            lambda data: data["resolve"].update(root="dependency"),
            lambda data: data["packages"][2].update(version="6.0.1"),
            lambda data: data["packages"][2].update(source="git+https://example.invalid/source"),
            lambda data: data["resolve"]["nodes"][0]["deps"].pop(),
            lambda data: data.update(workspace_root="/outside"),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(case=index):
                self.metadata = json.loads(original)
                mutate(self.metadata)
                with self.assertRaises(cache.NoReuse):
                    self.key()
        self.metadata = json.loads(original)

    def test_declared_wasm_output_does_not_drift_but_tracked_and_generated_inputs_do(self) -> None:
        manifest = self.write("libs/@blockprotocol/type-system/rust/Cargo.toml", b"input")
        self.metadata["packages"].append({"id": "wasm", "name": "wasm", "source": None, "manifest_path": str(manifest), "targets": []})
        self.metadata["resolve"]["nodes"][0]["deps"].append({"pkg": "wasm"})
        self.metadata["resolve"]["nodes"].append({"id": "wasm", "deps": [], "features": []})
        before = self.key()
        output_name = "libs/@blockprotocol/type-system/rust/pkg/type-system_bg.wasm"
        output = self.write(output_name, b"wasm output")
        self.assertEqual(before, self.key())
        output.write_bytes(b"rebuilt wasm output")
        self.assertEqual(before, self.key())
        generated = self.write("libs/@blockprotocol/type-system/rust/generated/types.rs", b"generated input")
        self.assertNotEqual(before, self.key())
        generated.unlink()
        self.assertEqual(before, self.key())
        other_pkg = self.write("libs/dependency/pkg/input.rs", b"another package input")
        self.assertNotEqual(before, self.key())
        other_pkg.unlink()
        sibling = self.write("libs/dependency-other/input.rs", b"unrelated input")
        with patch.object(cache.subprocess, "check_output", return_value=self.tracked + b"libs/dependency-other/input.rs\0"):
            self.assertEqual(before, self.key())
        sibling.unlink()
        with patch.object(cache.subprocess, "check_output", return_value=self.tracked + output_name.encode() + b"\0"):
            tracked_key = self.key()
            output.write_bytes(b"changed tracked input")
            self.assertNotEqual(tracked_key, self.key())

    def test_corrupt_missing_nonexecutable_and_symlink_payloads_miss(self) -> None:
        mutations = [lambda: (self.payload / "hash-graph").write_bytes(b"corrupt"),
                     lambda: (self.payload / "manifest.json").write_text("[]"),
                     lambda: (self.payload / "manifest.json").unlink(),
                     lambda: (self.payload / "hash-graph").chmod(0o644),
                     lambda: (self.payload / "hash-graph").unlink()]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                shutil.rmtree(self.root / "target", ignore_errors=True)
                binary(self.output)
                cache.write_payload(self.payload, self.output, self.key())
                mutation()
                with self.compile() as build:
                    self.assertEqual(cache.compile_graph(self.root, self.env), 0)
                    build.assert_called_once()
        binary(self.output)
        cache.write_payload(self.payload, self.output, self.key())
        cached = self.payload / "hash-graph"
        cached.unlink()
        cached.symlink_to(self.output)
        with self.compile() as build:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            build.assert_called_once()
        self.assertTrue(cached.is_symlink())
    def test_changed_inputs_and_failed_or_invalid_build_do_not_publish(self) -> None:
        with self.compile(mutation=lambda: self.write("Cargo.lock", b"changed during build")):
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
        self.assertFalse(self.payload.exists())
        self.assertFalse(self.publish())
        with self.compile(code=7):
            self.assertEqual(cache.compile_graph(self.root, self.env), 7)
        self.assertFalse(self.payload.exists())
        with self.compile(produce=False):
            self.assertEqual(cache.compile_graph(self.root, self.env), 1)
        self.assertFalse(self.payload.exists())

    def test_disabled_or_unsupported_uses_original_command_and_environment(self) -> None:
        for mode in (None, "0", "baseline"):
            self.env.pop("HASH_GRAPH_BUILD_CACHE", None)
            if mode:
                self.env["HASH_GRAPH_BUILD_CACHE"] = mode
            with self.compile() as build:
                self.assertEqual(cache.compile_graph(self.root, self.env), 0)
                self.assertIs(build.call_args.kwargs["env"], self.env)
        self.env["HASH_GRAPH_BUILD_CACHE"] = "1"
        with patch.object(cache, "fingerprint", side_effect=cache.NoReuse), self.compile() as build:
            self.assertEqual(cache.compile_graph(self.root, self.env), 0)
            self.assertIs(build.call_args.kwargs["env"], self.env)

    def test_unsupported_config_and_external_sources_reject_reuse(self) -> None:
        for value in (b"[build]\ntarget-dir = '/custom'\n", b"[env]\nCUSTOM='value'\n",
                      b"[target.example]\nlinker='/custom/ld'\n"):
            self.write(".cargo/config.toml", value)
            with self.assertRaises(cache.NoReuse):
                self.key()
        self.write(".cargo/config.toml", b"")
        source = self.root / "libs/dependency/src/lib.rs"
        source.unlink()
        source.symlink_to("/outside/source.rs")
        with self.assertRaises(cache.NoReuse):
            self.key()
        source.unlink()
        self.metadata["packages"][0]["manifest_path"] = "/outside/Cargo.toml"
        with self.assertRaises(cache.NoReuse):
            self.key()

    def test_in_repository_symlinks_bind_target_text_and_contents(self) -> None:
        source = self.root / "libs/dependency/src/lib.rs"
        before = self.key()
        source.unlink()
        source.symlink_to(self.root / "Cargo.lock")
        linked = self.key()
        self.assertNotEqual(before, linked)
        self.write("Cargo.lock", b"changed linked content")
        self.assertNotEqual(linked, self.key())

    def test_prepare_patches_only_supported_original_and_restores_on_failure(self) -> None:
        package = self.root / "apps/hash-graph/package.json"
        before = package.read_bytes()
        with patch.object(cache, "fingerprint", side_effect=cache.NoReuse):
            self.assertEqual(cache.prepare(self.root, self.env), "")
        self.assertEqual(before, package.read_bytes())
        key = cache.prepare(self.root, self.env)
        self.assertEqual(json.loads(package.read_text())["scripts"]["compile"], cache.WRAPPER)
        self.assertEqual(key, self.key())
        self.assertEqual(key, json.loads((self.root / "target/graph-build-inputs.json").read_text())["key"])
        self.assertEqual(cache.prepare(self.root, self.env), key)
        with patch.object(cache, "fingerprint", side_effect=cache.NoReuse):
            self.assertEqual(cache.prepare(self.root, self.env), "")
        self.assertEqual(json.loads(package.read_text())["scripts"]["compile"], " ".join(cache.COMMAND))
        package.write_text('{"scripts":{"compile":"custom command"}}')
        before = package.read_bytes()
        self.assertEqual(cache.prepare(self.root, self.env), "")
        self.assertEqual(before, package.read_bytes())
        package.write_text("invalid")
        self.assertEqual(cache.prepare(self.root, self.env), "")
        self.assertEqual(package.read_text(), "invalid")

    def test_prepare_lock_failure_restores_original_command_and_disables_reuse(self) -> None:
        package = self.root / "apps/hash-graph/package.json"
        self.assertTrue(cache.prepare(self.root, self.env))
        self.assertEqual(json.loads(package.read_text())["scripts"]["compile"], cache.WRAPPER)
        with patch.object(cache, "build_lock", side_effect=OSError("synthetic unsupported lock")), patch.object(cache, "fingerprint") as inspect:
            self.assertEqual(cache.prepare(self.root, self.env), "")
            inspect.assert_not_called()
        self.assertEqual(json.loads(package.read_text())["scripts"]["compile"], " ".join(cache.COMMAND))

    def test_manifest_contains_only_digests_and_no_environment_values(self) -> None:
        self.isolated["CARGO_REGISTRIES_EXAMPLE_TOKEN"] = "synthetic-sensitive-value"
        _, _, inputs, _ = cache.fingerprint(self.root, self.env)
        self.assertNotIn("synthetic-sensitive-value", json.dumps(inputs))
        self.assertNotIn(str(self.root), json.dumps(inputs))


class NativeCacheLine(unittest.TestCase):
    def test_probe_inputs_failures_affinity_and_cleanup(self) -> None:
        good = {"status": "ok", "bytes": 64}
        cases = [([good, good], None), ([good, {"status": "ok", "bytes": 128}], "heterogeneous"),
                 *[([{"status": "ok", "bytes": value}], "invalid") for value in (0, "64", True, -1, 131073)],
                 *[([value], "invalid") for value in ([], {"status": "unsupported"}, b"not-json")],
                 *[([good, good], failure) for failure in ("compile", "signal", "timeout", "pin")]]
        for outputs, failure in cases:
            with self.subTest(failure=failure, outputs=outputs):
                directories, selected = [], []
                child = None
                values = iter(outputs)
                env = {"PATH": "/compiler/bin:/usr/bin", "RUSTC": "/untrusted/compiler"}

                def get_affinity(pid):
                    return {2, 5} if child is None else child

                def set_affinity(pid, cpus):
                    nonlocal child
                    self.assertIsNotNone(child, "parent affinity must not change")
                    if failure == "pin":
                        raise subprocess.SubprocessError("synthetic child failure")
                    child = cpus
                    selected.append(cpus)

                def run(command, **kwargs):
                    nonlocal child
                    self.assertIs(kwargs["env"], env)
                    self.assertTrue(kwargs["check"])
                    if "-o" in command:
                        self.assertEqual(command[0], "rustc")
                        self.assertIn("--edition=2021", command)
                        self.assertIn("-Ctarget-cpu=x86-64", command)
                        probe = Path(command[-1])
                        directories.append(probe.parent)
                        if failure == "compile":
                            raise subprocess.CalledProcessError(1, command)
                        probe.write_bytes(b"synthetic probe")
                    else:
                        child = {2, 5}
                        try:
                            kwargs["preexec_fn"]()
                        finally:
                            child = None
                        if failure == "signal":
                            raise subprocess.CalledProcessError(-4, command)
                        if failure == "timeout":
                            raise subprocess.TimeoutExpired(command, 2)
                        value = next(values)
                        return subprocess.CompletedProcess(command, 0, value if isinstance(value, bytes) else json.dumps(value).encode())
                    return subprocess.CompletedProcess(command, 0)

                with patch.object(cache.os, "sched_getaffinity", get_affinity, create=True), \
                     patch.object(cache.os, "sched_setaffinity", set_affinity, create=True), \
                     patch.object(cache.subprocess, "run", run):
                    if failure is None:
                        self.assertEqual(cache.native_cache_line(Path("/workspace"), env), 64)
                        self.assertEqual(selected, [{2}, {5}])
                    else:
                        with self.assertRaises((cache.NoReuse, ValueError, subprocess.SubprocessError)):
                            cache.native_cache_line(Path("/workspace"), env)
                self.assertTrue(all(not path.exists() for path in directories))


class MachineIdentity(unittest.TestCase):
    def test_x86_uses_probed_class(self) -> None:
        with patch.object(cache.platform, "machine", return_value="x86_64"), \
             patch.object(cache.platform, "platform", return_value="Linux-synthetic"), \
             patch.object(cache, "file_digest", return_value="os-digest"), \
             patch.object(Path, "read_text") as cpu:
            root, env = Path("/workspace"), {"ImageVersion": "synthetic-image"}
            cpu.return_value = "model name: Model A\nflags: sse2 avx2\n"
            first = cache.machine_digest(root, env)
            cpu.return_value = "model name: Model B\nflags: sse2 avx2\n"
            self.assertEqual(cache.machine_digest(root, env), first)
            cpu.return_value = "model name: Model B\nflags: sse2\n"
            self.assertEqual(cache.machine_digest(root, env), first)
            cpu.assert_not_called()


class CompilerEnvironment(unittest.TestCase):
    def test_real_environment_function_resolves_shims_before_isolating(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            installed = root / "installed/bin"
            installed.mkdir(parents=True)
            for name in ("rustc", "cargo", "protoc", "cc", "c++", "ld", "ar", "as", "pkg-config", "cmake", "make", "custom-wrapper", "custom-cc"):
                tool = installed / name
                tool.write_bytes(b"synthetic tool")
                tool.chmod(0o755)
            shims = root / "shims"
            shims.mkdir()
            (shims / "protoc").write_bytes(b"tool-manager shim")
            (shims / "protoc").chmod(0o755)
            original = {"HOME": str(root / "home"), "PATH": f"{shims}:{installed}",
                        "PROTOC": str(installed / "protoc"), "RUSTUP_TOOLCHAIN": "nightly-synthetic",
                        "RUSTC_WRAPPER": str(installed / "custom-wrapper"), "CC": str(installed / "custom-cc"),
                        "SCCACHE_SERVER_PORT": "4226", "MISE_TRUSTED_CONFIG_PATHS": "/synthetic",
                        "GITHUB_TOKEN": "synthetic-sensitive-value"}
            calls = []

            def query(args, cwd, env):
                calls.append((args, env))
                return str(root / "installed").encode() if "sysroot" in args else b"synthetic version"

            with patch.object(cache.platform, "system", return_value="Linux"), patch.object(cache.platform, "machine", return_value="x86_64"), patch.object(cache, "run", side_effect=query):
                env, tools = cache.compiler_environment(root, original)
                self.assertIs(calls[0][1], original)
                self.assertTrue(all(call_env is env for _, call_env in calls[1:]))
                self.assertEqual([args for args, _ in calls],
                                 [["rustc", "--print", "sysroot"], ["rustc", "-vV"], ["cargo", "--version"]])
                self.assertEqual(env["PATH"].split(os.pathsep)[0], str(installed))
                self.assertEqual(env["SCCACHE_SERVER_PORT"], "4226")
                self.assertEqual(env["PROTOC"], str(installed / "protoc"))
                self.assertNotIn(str(shims), env["PATH"])
                self.assertNotIn("GITHUB_TOKEN", env)
                self.assertNotIn("MISE_TRUSTED_CONFIG_PATHS", env)
                self.assertNotIn("synthetic-sensitive-value", tools)
                (installed / "cc").write_bytes(b"changed tool")
                self.assertNotEqual(tools, cache.compiler_environment(root, original)[1])
                _, before_wrapper_change = cache.compiler_environment(root, original)
                (installed / "custom-wrapper").write_bytes(b"changed wrapper")
                self.assertNotEqual(before_wrapper_change, cache.compiler_environment(root, original)[1])
                self.assertTrue(all(args[0] in {"rustc", "cargo"} for args, _ in calls))
                with patch.object(cache, "run", return_value=b"relative"), \
                     self.assertRaisesRegex(cache.NoReuse, "invalid-sysroot-path"):
                    cache.compiler_environment(root, original)
                loop = root / "loop"
                loop.symlink_to(loop)
                with patch.object(cache, "run", return_value=str(loop).encode()), \
                     self.assertRaisesRegex(cache.NoReuse, "invalid-sysroot-path"):
                    cache.compiler_environment(root, original)
                fallback = root / "fallback"
                fallback.mkdir()
                for name in ("rustc", "cc"):
                    tool = fallback / name
                    tool.write_bytes(b"fallback tool")
                    tool.chmod(0o755)
                    (installed / name).chmod(0o644)
                fallback_original = {**original, "PATH": f"{original['PATH']}:{fallback}"}
                before_fallback = len(calls)
                with self.assertRaisesRegex(cache.NoReuse, "rust-tool-path-mismatch"):
                    cache.compiler_environment(root, fallback_original)
                self.assertEqual(calls[before_fallback:], [(["rustc", "--print", "sysroot"], fallback_original)])

    def test_diagnostics_use_reason_codes_without_exception_payloads(self) -> None:
        for args, expected in ((["rustc", "--print", "sysroot"], "sysroot-query-failed"),
                               (["cargo", "metadata"], "metadata-command-failed"),
                               (["protoc", "--version"], "tool-version-failed")):
            error = subprocess.CalledProcessError(1, ["synthetic-sensitive-value"], stderr=b"synthetic-sensitive-value")
            with self.subTest(args=args), patch.object(cache.subprocess, "run", side_effect=error):
                with self.assertRaises(cache.NoReuse) as caught:
                    cache.run(args, Path("/synthetic"), {})
                self.assertEqual(cache.failure_reason(caught.exception), expected)
        for error in (OSError("synthetic-sensitive-value"), KeyError("synthetic-sensitive-value"), ValueError("synthetic-sensitive-value")):
            self.assertNotIn("synthetic-sensitive-value", cache.failure_reason(error))

    def test_custom_flags_targets_and_profiles_fall_back(self) -> None:
        original = {"HOME": "/home/example", "PATH": "/usr/bin"}
        with patch.object(cache.platform, "system", return_value="Linux"), patch.object(cache.platform, "machine", return_value="x86_64"):
            for name in ("RUSTFLAGS", "CFLAGS", "CARGO_TARGET_DIR", "CARGO_BUILD_TARGET",
                         "CARGO_PROFILE_DEV_OPT_LEVEL", "CARGO_ENCODED_RUSTFLAGS",
                         "OPENSSL_DIR", "PKG_CONFIG_PATH", "CPATH", "LD_LIBRARY_PATH", "LD_PRELOAD", "LD_AUDIT", "LD_DEBUG",
                         "SCCACHE_RECACHE", "SCCACHE_DISABLE"):
                with self.subTest(name=name), self.assertRaises(cache.NoReuse):
                    cache.compiler_environment(Path("/example"), {**original, name: "custom"})

    def test_sccache_port_is_a_build_input_and_unrelated_variables_are_not(self) -> None:
        self.assertTrue(cache.BUILD_ENV.match("SCCACHE_SERVER_PORT"))
        self.assertFalse(cache.BUILD_ENV.match("GITHUB_TOKEN"))
        self.assertFalse(cache.BUILD_ENV.match("HASH_GRAPH_LOG_FOLDER"))


if __name__ == "__main__":
    unittest.main()
