#!/usr/bin/env python3
"""Opt-in reuse of the integration graph executable, never service or test state."""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import tomllib


COMMAND = ["cargo", "build", "--bin", "hash-graph", "--all-features"]
WRAPPER = "python3 ../../.github/actions/graph-build-cache/graph_build_cache.py compile"
OUTPUT_DIRS = {"target", "node_modules", ".git", ".turbo", "__pycache__"}
# wasm-pack writes this JavaScript consumer output during service startup.
WASM_OUTPUT = Path("libs/@blockprotocol/type-system/rust/pkg")
READY_STATE = Path("target/graph-build-cache.ready.json")
BUILD_ENV = re.compile(
    r"^(CARGO|RUST|CC|CXX|AR|AS|LD|CFLAGS|CXXFLAGS|CPPFLAGS|LDFLAGS|"
    r"HOST_|TARGET_|PKG_CONFIG|OPENSSL|ZSTD|LIBZ|CMAKE|BINDGEN|LLVM|LIBCLANG|"
    r"PROTOC|LIBRARY_PATH|CPATH|C_INCLUDE_PATH|CPLUS_INCLUDE_PATH|SCCACHE_(SERVER_PORT|RECACHE|DISABLE)$)"
)
TOOL_ENV = re.compile(r"^(CC|CXX|AR|AS|LD)(_|$)|^RUSTC(?:_WRAPPER|_WORKSPACE_WRAPPER)?$|^RUSTDOC$|_LINKER$")
EXTERNAL_ENV = re.compile(r"^(OPENSSL|ZSTD|LIBZ|CMAKE|BINDGEN|LLVM|LIBCLANG|PKG_CONFIG|"
                          r"LD_|LIBRARY_PATH|CPATH|C_INCLUDE_PATH|CPLUS_INCLUDE_PATH|DEP_|SCCACHE_(RECACHE|DISABLE)$)")


class NoReuse(Exception):
    """The normal compiler remains the fallback for unsupported configurations."""


def failure_reason(error: Exception) -> str:
    # Only locally assigned reason codes are printable, never exception messages.
    if isinstance(error, NoReuse):
        return error.args[0] if error.args else "unsupported"
    if isinstance(error, OSError):
        return "filesystem-error"
    if isinstance(error, KeyError):
        return "missing-field"
    if isinstance(error, ValueError):
        return "invalid-data"
    return "subprocess-failed"


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def encoded(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def event(phase: str, status: str, started: float, key: str = "", reason: str = "") -> None:
    print(json.dumps({"phase": phase, "status": status, "key": key,
                      **({"reason": reason} if reason else {}),
                      "seconds": round(time.monotonic() - started, 3)}), file=sys.stderr)


def run(args: list[str], root: Path, env: dict[str, str]) -> bytes:
    try:
        return subprocess.run(args, cwd=root / "apps/hash-graph", env=env,
                              check=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE).stdout
    except (OSError, subprocess.SubprocessError) as error:
        reason = ("metadata-command-failed" if "metadata" in args else
                  "sysroot-query-failed" if "sysroot" in args else "tool-version-failed")
        raise NoReuse(reason) from error


def file_digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def path_state(path: Path) -> list | None:
    try:
        value = path.lstat()
    except FileNotFoundError:
        return None
    return [value.st_mode, value.st_dev, value.st_ino, value.st_nlink,
            value.st_uid, value.st_gid, value.st_size, value.st_mtime_ns,
            value.st_ctime_ns, os.readlink(path) if path.is_symlink() else ""]


def compiler_environment(root: Path, original: dict[str, str]) -> tuple[dict[str, str], str]:
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise NoReuse("unsupported-platform")
    if any(original.get(name) for name in (
        "CARGO_TARGET_DIR", "CARGO_BUILD_TARGET_DIR", "CARGO_BUILD_TARGET",
        "CARGO_BUILD_BUILD_DIR", "CARGO_BUILD_PROFILE",
    )) or any(name.startswith("CARGO_PROFILE_") for name in original):
        raise NoReuse("custom-target-or-profile")
    # Custom flags can reference external include files, linkers or codegen backends.
    # Those inputs belong to Cargo's normal path until explicitly modeled here.
    if any(value and "FLAGS" in name and BUILD_ENV.match(name)
           and name != "CARGO_MAKEFLAGS" for name, value in original.items()):
        raise NoReuse("custom-build-flags")
    if any(value and EXTERNAL_ENV.match(name) for name, value in original.items()):
        raise NoReuse("external-input-or-cache-control-env")

    env = {name: value for name, value in original.items() if BUILD_ENV.match(name)}
    env.update({"HOME": original["HOME"], "PATH": original["PATH"],
                "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TMPDIR": "/tmp"})
    # Use real tool directories, not Yarn's per-invocation temporary PATH entries.
    # Tool-manager shims may need their setup environment to locate the pinned tool.
    # Discovery is read-only; compilation and version checks use the isolated environment.
    sysroot = Path(run(["rustc", "--print", "sysroot"], root, original).decode().strip())
    if not sysroot.is_absolute():
        raise NoReuse("invalid-sysroot-path")
    try:
        sysroot = sysroot.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise NoReuse("invalid-sysroot-path") from error
    tools = {"rustc": sysroot / "bin/rustc", "cargo": sysroot / "bin/cargo"}
    for name in ("protoc", "cc", "c++", "ld", "ar", "as", "pkg-config", "cmake", "make"):
        resolved = shutil.which(original.get("PROTOC") or name, path=original["PATH"]) if name == "protoc" else shutil.which(name, path=original["PATH"])
        if resolved:
            tools[name] = Path(resolved).resolve()
        elif name in {"protoc", "cc", "c++", "ld"}:
            raise NoReuse("required-tool-missing")
    for name, value in env.items():
        if value and (TOOL_ENV.search(name) or name == "PROTOC"):
            words = shlex.split(value)
            # Wrapper commands with arguments need their own input model.
            if len(words) != 1:
                raise NoReuse("tool-env-command-arguments")
            resolved = shutil.which(words[0], path=original["PATH"])
            if not resolved:
                raise NoReuse("tool-env-command-missing")
            tools[name] = Path(resolved).resolve()
            env[name] = str(tools[name])
    env["PATH"] = os.pathsep.join(dict.fromkeys(
        [str(sysroot / "bin"), *(str(path.parent) for path in tools.values()),
         "/usr/local/bin", "/usr/bin", "/bin"]
    ))
    for name in ("rustc", "cargo"):
        resolved = shutil.which(name, path=env["PATH"])
        if not resolved or Path(resolved).resolve() != tools[name].resolve():
            raise NoReuse("rust-tool-path-mismatch")
    # Only fixed compiler commands are probed. Environment-selected tools are
    # identified by their bytes without executing them for cache inspection.
    versions = {
        "rustc": digest(run(["rustc", "-vV"], root, env)),
        "cargo": digest(run(["cargo", "--version"], root, env)),
    }
    identities = []
    for name, path in sorted(tools.items()):
        if not path.is_file():
            raise NoReuse("tool-file-missing")
        identities.append([name, str(path), file_digest(path), versions.get(name)])
    return env, digest(encoded(identities))


def cargo_configs(root: Path, env: dict[str, str]) -> list[Path]:
    paths = {Path(env.get("CARGO_HOME", str(Path(env["HOME"]) / ".cargo"))) / name
             for name in ("config", "config.toml")}
    for directory in [root / "apps/hash-graph", *(root / "apps/hash-graph").parents]:
        paths.update(directory / ".cargo" / name for name in ("config", "config.toml"))
    for path in paths:
        if path.is_file():
            config = tomllib.loads(path.read_text())
            if any(name in config for name in ("include", "env", "source", "patch")) or any(
                name in config.get("build", {}) for name in
                ("target", "target-dir", "build-dir", "rustflags", "rustc", "rustc-wrapper", "rustc-workspace-wrapper")
            ):
                raise NoReuse("custom-cargo-config")
            for target in config.get("target", {}).values():
                if set(target) - {"rustflags"} or target.get("rustflags", []) != ["-Ctarget-cpu=x86-64-v3"]:
                    raise NoReuse("custom-cargo-target-config")
    return sorted(paths)


def source_paths(root: Path, packages: list[str], configs: list[Path]) -> tuple[set[Path], dict[Path, list[str]]]:
    tracked = subprocess.check_output(["git", "ls-files", "--cached", "-z"], cwd=root)
    directories = [Path(manifest).parent for manifest in packages]
    directories.append(root / ".github/actions/graph-build-cache")
    fixed = {root / name for name in ("Cargo.toml", "Cargo.lock", "rust-toolchain", "rust-toolchain.toml")}
    prefixes = tuple(f"{directory.relative_to(root).as_posix()}/" for directory in directories)
    paths = fixed | {root / name for name in map(os.fsdecode, tracked.split(b"\0"))
                     if name.startswith(prefixes)}
    def add_directory(directory: Path) -> None:
        for parent, dirs, files in os.walk(directory, followlinks=False):
            dirs[:] = sorted(name for name in dirs if name not in OUTPUT_DIRS
                             and Path(parent) / name != root / WASM_OUTPUT)
            paths.update(Path(parent) / name for name in dirs if (Path(parent) / name).is_symlink())
            paths.update(Path(parent) / name for name in files)

    # Retain absent tracked paths in the digest: pruning and deletion both matter.
    # Cargo can also read generated or ignored files inside local package directories.
    for directory in directories:
        if not directory.is_relative_to(root):
            raise NoReuse("external-source-package")
        add_directory(directory)
    paths.update(configs)
    links = {}
    while True:
        pending = [path for path in paths if path.is_symlink() and path not in links]
        if not pending:
            break
        for path in pending:
            try:
                target = path.resolve()
            except RuntimeError as error:
                raise NoReuse("source-symlink-loop") from error
            if not target.is_relative_to(root):
                raise NoReuse("external-source-symlink")
            links[path] = [os.readlink(path), str(target.relative_to(root))]
            if target.is_dir():
                add_directory(target)
            else:
                paths.add(target)
    return paths, links


def source_state(root: Path, packages: list[str], configs: list[str | Path]) -> str:
    paths, _ = source_paths(root, packages, [Path(path) for path in configs])
    return digest(encoded([
        [str(path.relative_to(root)) if path.is_relative_to(root) else str(path), path_state(path)]
        for path in sorted(paths)
    ]))


def source_digest(root: Path, packages: list[str], configs: list[Path]) -> tuple[str, dict]:
    paths, links = source_paths(root, packages, configs)
    before = digest(encoded([
        [str(path.relative_to(root)) if path.is_relative_to(root) else str(path), path_state(path)]
        for path in sorted(paths)
    ]))
    hasher = hashlib.sha256()
    for path in sorted(paths):
        name = str(path.relative_to(root)) if path.is_relative_to(root) else str(path)
        content = links[path] if path in links else file_digest(path) if path.is_file() else "absent"
        hasher.update(encoded([name, content]))
    context = {"packages": packages, "configs": [str(path) for path in configs],
               "state": source_state(root, packages, configs)}
    if context["state"] != before:
        raise NoReuse("source-changed-during-inspection")
    return hasher.hexdigest(), context


def graph_resolution(root: Path, metadata: dict) -> dict:
    """Keep every dependency kind and target condition reachable from the graph."""
    packages = {package["id"]: package for package in metadata["packages"]}
    resolve = metadata.get("resolve")
    if not isinstance(resolve, dict):
        raise NoReuse("missing-cargo-resolution")
    nodes = {node["id"]: node for node in resolve["nodes"]}
    if len(packages) != len(metadata["packages"]) or len(nodes) != len(resolve["nodes"]):
        raise NoReuse("duplicate-cargo-resolution-id")
    roots = [package for package in packages.values()
             if Path(package["manifest_path"]).resolve() == root / "apps/hash-graph/Cargo.toml"]
    if len(roots) != 1 or not any(target["name"] == "hash-graph" and "bin" in target["kind"]
                                  for target in roots[0]["targets"]):
        raise NoReuse("ambiguous-graph-package")
    if resolve.get("root") not in (None, roots[0]["id"]):
        raise NoReuse("unexpected-cargo-resolution-root")
    reached, pending = set(), [roots[0]["id"]]
    while pending:
        package_id = pending.pop()
        if package_id in reached:
            continue
        if package_id not in packages or package_id not in nodes:
            raise NoReuse("incomplete-cargo-resolution")
        reached.add(package_id)
        pending.extend(dependency["pkg"] for dependency in nodes[package_id]["deps"])
    directories = [Path(packages[package_id]["manifest_path"]).parent for package_id in reached
                   if packages[package_id]["source"] is None]
    for package_id in reached:
        package = packages[package_id]
        if package["source"] is None:
            directory = Path(package["manifest_path"]).parent
            if not directory.resolve().is_relative_to(root):
                raise NoReuse("external-source-package")
            for path in [target["src_path"] for target in package["targets"]] + [
                package[name] for name in ("readme", "license_file") if package.get(name)
            ]:
                candidate = Path(os.path.normpath(directory / path))
                if not any(candidate.is_relative_to(modeled) for modeled in directories):
                    raise NoReuse("external-package-input")
                if OUTPUT_DIRS.intersection(candidate.relative_to(root).parts) or candidate.is_relative_to(root / WASM_OUTPUT):
                    raise NoReuse("excluded-package-input")
    return {"root": roots[0]["id"],
            "packages": [packages[package_id] for package_id in sorted(reached)],
            "nodes": [nodes[package_id] for package_id in sorted(reached)]}


def machine_digest(root: Path, original: dict[str, str]) -> str:
    machine = {"platform": platform.platform(), "machine": platform.machine(),
               "image": original.get("ImageVersion", ""), "root": str(root),
               "os": file_digest(Path("/etc/os-release"))}
    # The native probe requires usable v3 features on every permitted CPU.
    machine["cpu"] = "x86-64-v3"
    return digest(encoded(machine))


def native_cache_line(root: Path, env: dict[str, str]) -> int:
    # kiddo selects compiled code using native L1 Data cache-line detection.
    # Probe every permitted CPU without changing the compiler's affinity.
    started = time.monotonic()
    if not all(hasattr(os, name) for name in ("sched_getaffinity", "sched_setaffinity")):
        raise NoReuse("cpu-affinity-unavailable")
    cpus = os.sched_getaffinity(0)
    if not cpus:
        raise NoReuse("cpu-affinity-unavailable")
    source = root / ".github/actions/graph-build-cache/cache_line_probe.rs"
    # Detection macros must run at baseline ISA, not fold to compile-time v3.
    target = ["-Ctarget-cpu=x86-64"]
    with tempfile.TemporaryDirectory(prefix="graph-cache-cpu-") as directory:
        probe = Path(directory) / "probe"
        subprocess.run(["rustc", "--edition=2021", *target, str(source), "-o", str(probe)], env=env, check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        values = []
        for cpu in sorted(cpus):
            def pin_child():
                os.sched_setaffinity(0, {cpu})
                if os.sched_getaffinity(0) != {cpu}:
                    raise NoReuse("cpu-affinity-unavailable")
            # This helper is single-threaded; affinity changes only in the child.
            result = subprocess.run([str(probe)], env=env, check=True, preexec_fn=pin_child,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=2)
            value = json.loads(result.stdout)
            if (not isinstance(value, dict) or set(value) != {"status", "bytes"}
                    or value["status"] != "ok" or type(value["bytes"]) is not int
                    or not 0 < value["bytes"] <= 131_072):
                raise NoReuse("cpu-cache-line-unavailable")
            values.append(value["bytes"])
        if len(set(values)) != 1 or os.sched_getaffinity(0) != cpus:
            raise NoReuse("cpu-cache-line-inconsistent")
    event("cpu-probe", "ready", started)
    return values[0]


def sealed_tool_paths(env: dict[str, str]) -> list[str]:
    commands = {"rustc", "cargo", "protoc", "cc", "c++", "ld", "ar", "as",
                "pkg-config", "cmake", "make"}
    for name, value in env.items():
        if value and (TOOL_ENV.search(name) or name == "PROTOC"):
            words = shlex.split(value)
            if len(words) == 1:
                commands.add(words[0])
    paths = {str(Path(path).resolve()) for command in commands
             if (path := shutil.which(command, path=env["PATH"]))}
    return sorted(paths)


def context_state(root: Path, original: dict[str, str], tools: list[str]) -> str:
    relevant = {name: value for name, value in original.items()
                if BUILD_ENV.match(name) or EXTERNAL_ENV.match(name)}
    relevant["HOME"] = original["HOME"]
    commands = {name: (original.get("PROTOC") or name) if name == "protoc" else name
                for name in ("rustc", "cargo", "protoc", "cc", "c++", "ld", "ar", "as",
                             "pkg-config", "cmake", "make", "git")}
    commands.update({name: value for name, value in original.items()
                     if value and (TOOL_ENV.search(name) or name == "PROTOC")})
    selected = []
    for name, command in sorted(commands.items()):
        words = shlex.split(command)
        resolved = shutil.which(words[0], path=original["PATH"]) if len(words) == 1 else None
        path = Path(resolved).resolve() if resolved else None
        selected.append([name, str(path) if path else None, path_state(path) if path else None])
    affinity = sorted(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else []
    return digest(encoded({"environment": relevant, "selected_tools": selected,
                           "sealed_tools": [[path, path_state(Path(path))] for path in tools],
                           "machine": machine_digest(root, original), "affinity": affinity}))


def fingerprint(root: Path, original: dict[str, str]) -> tuple[str, dict[str, str], dict, dict]:
    env, tools = compiler_environment(root, original)
    configs = cargo_configs(root, env)
    # Resolve the pruned workspace before hashing: Cargo may update its copied lockfile.
    metadata = json.loads(run(["cargo", "metadata", "--format-version=1", "--all-features"],
                              root, env))
    if (Path(metadata["target_directory"]).resolve() != root / "target"
            or Path(metadata["workspace_root"]).resolve() != root):
        raise NoReuse("custom-metadata-target")
    resolution = graph_resolution(root, metadata)
    detector_versions = {"kiddo": "6.0.0", "yep-cache-line-size": "0.9.3", "raw-cpuid": "11.6.0"}
    detector_sources = {(package["name"], package["version"], package["source"])
                        for package in resolution["packages"] if package["name"] in detector_versions}
    if detector_sources != {(name, version, "registry+https://github.com/rust-lang/crates.io-index")
                            for name, version in detector_versions.items()}:
        raise NoReuse("unmodeled-cache-line-detector")
    packages = sorted(package["manifest_path"] for package in resolution["packages"]
                      if package["source"] is None)
    sources, source = source_digest(root, packages, configs)
    tool_paths = sealed_tool_paths(env)
    inputs = {"schema": 1, "command": COMMAND, "sources": sources,
              "resolution": digest(encoded(resolution)), "environment": digest(encoded(env)),
              "tools": tools, "machine": machine_digest(root, original),
              "cpu_cache_line": native_cache_line(root, env)}
    key = "graph-build-v1-" + digest(encoded(inputs))
    context = {"source": source, "tools": tool_paths,
               "state": context_state(root, original, tool_paths)}
    return key, env, inputs, context


def regular(path: Path) -> bool:
    return path.exists() and not path.is_symlink() and stat.S_ISREG(path.stat().st_mode)


def executable(path: Path) -> bool:
    if not regular(path) or not path.stat().st_mode & 0o111:
        return False
    with path.open("rb") as stream:
        header = stream.read(20)
    return (len(header) == 20 and header[:6] == b"\x7fELF\x02\x01"
            and int.from_bytes(header[18:20], "little") == 62)


def save_ready(root: Path, original: dict[str, str], key: str, context: dict, binary: Path) -> None:
    if (source_state(root, context["source"]["packages"], context["source"]["configs"])
            != context["source"]["state"]
            or context_state(root, original, context["tools"]) != context["state"]):
        raise NoReuse("inputs-changed")
    if not executable(binary):
        raise NoReuse("binary-not-executable")
    ready = root / READY_STATE
    ready.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=ready.parent, prefix=".graph-build-ready-",
                                         delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(json.dumps({"schema": 1, "key": key, **context,
                                     "binary": path_state(binary)}, sort_keys=True) + "\n")
        os.replace(temporary, ready)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def ready_state(root: Path, original: dict[str, str]) -> dict | None:
    ready = root / READY_STATE
    binary = root / "target/debug/hash-graph"
    try:
        if not regular(ready):
            return None
        value = json.loads(ready.read_text())
        if (set(value) != {"schema", "key", "source", "tools", "state", "binary"}
                or value["schema"] != 1 or not isinstance(value["key"], str)
                or set(value["source"]) != {"packages", "configs", "state"}
                or not isinstance(value["tools"], list)):
            return None
        if (source_state(root, value["source"]["packages"], value["source"]["configs"])
                != value["source"]["state"]
                or context_state(root, original, value["tools"]) != value["state"]
                or path_state(binary) != value["binary"] or not executable(binary)):
            return None
        return value
    except (NoReuse, OSError, ValueError, TypeError, KeyError,
            RuntimeError, subprocess.SubprocessError):
        return None


def clear_ready(root: Path) -> None:
    ready = root / READY_STATE
    if ready.is_symlink() or ready.is_file():
        ready.unlink(missing_ok=True)


def verified_payload_digest(payload: Path, key: str) -> str | None:
    try:
        if payload.is_symlink() or not regular(payload / "manifest.json"):
            return None
        manifest = json.loads((payload / "manifest.json").read_text())
        binary = payload / "hash-graph"
        if (set(manifest) == {"key", "sha256"} and manifest["key"] == key
                and executable(binary) and manifest["sha256"] == file_digest(binary)):
            return manifest["sha256"]
    except (OSError, ValueError, TypeError):
        return None
    return None


def write_payload(payload: Path, binary: Path, key: str) -> dict[str, list]:
    if payload.is_symlink() or any((payload / name).is_symlink()
                                    for name in ("hash-graph", "manifest.json")):
        raise NoReuse("payload-symlink")
    if not regular(binary):
        raise NoReuse("binary-not-regular")
    payload.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=payload, prefix=".snapshot-") as directory:
        snapshot = Path(directory) / "hash-graph"
        # Cargo may retain a hardlink in deps; cache corruption must not reach it.
        shutil.copy2(binary, snapshot)
        hashed_state = path_state(snapshot)
        snapshot_hash = file_digest(snapshot)
        if path_state(snapshot) != hashed_state:
            raise NoReuse("payload-changed-during-hash")
        manifest = Path(directory) / "manifest.json"
        manifest.write_text(json.dumps(
            {"key": key, "sha256": snapshot_hash}
        ) + "\n")
        os.replace(snapshot, payload / "hash-graph")
        os.replace(manifest, payload / "manifest.json")
    installed = {name: path_state(payload / name) for name in ("hash-graph", "manifest.json")}
    if (hashed_state is None or any(value is None for value in installed.values())
            or any(installed["hash-graph"][index] != hashed_state[index]
                   for index in (0, 1, 2, 3, 4, 5, 6, 7, 9))):
        raise NoReuse("payload-changed-during-install")
    return installed


def link_or_copy_binary(source: Path, destination: Path) -> bool:
    if not regular(source):
        raise NoReuse("binary-not-regular")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix=".hash-graph-") as directory:
        temporary = Path(directory) / "hash-graph"
        try:
            os.link(source, temporary, follow_symlinks=False)
            linked = True
        except OSError:
            shutil.copy2(source, temporary)
            linked = False
        os.replace(temporary, destination)
    return linked


@contextmanager
def build_lock(root: Path):
    # Reuse is Linux-only; unsupported Windows callers retain the Cargo fallback.
    if os.name == "nt":
        yield
        return
    import fcntl

    target = root / "target"
    target.mkdir(parents=True, exist_ok=True)
    with (target / "graph-build-cache.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def compile_graph(root: Path, original: dict[str, str]) -> int:
    if original.get("HASH_GRAPH_BUILD_CACHE") != "1":
        return subprocess.run(COMMAND, cwd=root / "apps/hash-graph", env=original).returncode
    started = time.monotonic()
    with build_lock(root):
        event("lock", "acquired", started)
        return _compile_graph_locked(root, original)


def _compile_graph_locked(root: Path, original: dict[str, str]) -> int:
    ready = root / READY_STATE
    binary = root / "target/debug/hash-graph"
    started = time.monotonic()
    state = ready_state(root, original)
    if state is not None:
        event("restore", "live", started, state["key"])
        return 0
    if ready.is_symlink() or ready.exists():
        clear_ready(root)
        binary.unlink(missing_ok=True)

    started = time.monotonic()
    try:
        key, env, _, context = fingerprint(root, original)
    except (NoReuse, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        event("prepare", "unsupported", started, reason=failure_reason(error))
        return subprocess.run(COMMAND, cwd=root / "apps/hash-graph", env=original).returncode
    event("prepare", "ready", started, key)
    payload = root / "target/graph-build-cache"
    started = time.monotonic()
    if verified_payload_digest(payload, key) is not None:
        if not regular(binary) or not binary.samefile(payload / "hash-graph"):
            link_or_copy_binary(payload / "hash-graph", binary)
        try:
            save_ready(root, original, key, context, binary)
        except (NoReuse, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
            clear_ready(root)
            binary.unlink(missing_ok=True)
            event("reject", "unsupported", started, key, failure_reason(error))
        else:
            event("restore", "hit", started, key)
            return 0
    else:
        event("restore", "miss", started, key)
    # Force a rejected restored output to be recreated by Cargo.
    binary.unlink(missing_ok=True)
    started = time.monotonic()
    result = subprocess.run(COMMAND, cwd=root / "apps/hash-graph", env=env)
    event("build", "success" if result.returncode == 0 else "failed", started, key)
    if result.returncode:
        return result.returncode
    started = time.monotonic()
    if not executable(binary):
        event("reject", "invalid-output", started, key)
        return 1
    try:
        save_ready(root, original, key, context, binary)
        event("reuse", "ready", started, key)
    except (NoReuse, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        event("reject", "unsupported", started, key, failure_reason(error))
    return 0


def publish(root: Path, original: dict[str, str]) -> bool:
    started = time.monotonic()
    expected = original.get("EXPECTED_GRAPH_BUILD_KEY", "")
    with build_lock(root):
        state = ready_state(root, original)
        if state is None or state["key"] != expected:
            event("publish", "skipped", started, expected, "missing-or-stale-live-build")
            return False
        payload = root / "target/graph-build-cache"
        binary = root / "target/debug/hash-graph"
        try:
            payload_state = write_payload(payload, binary, expected)
            if (ready_state(root, original) is None
                    or any(path_state(payload / name) != state
                           for name, state in payload_state.items())):
                shutil.rmtree(payload, ignore_errors=True)
                event("publish", "skipped", started, expected, "inputs-or-output-changed")
                return False
        except (NoReuse, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
            shutil.rmtree(payload, ignore_errors=True)
            event("publish", "skipped", started, expected, failure_reason(error))
            return False
    event("publish", "ready", started, expected)
    return True


def prepare(root: Path, original: dict[str, str]) -> str:
    started = time.monotonic()
    key = ""
    package = root / "apps/hash-graph/package.json"
    previous = None
    try:
        clear_ready(root)
        if original.get("HASH_GRAPH_BUILD_CACHE") != "1":
            raise NoReuse("disabled")
        package_before = package.read_bytes()
        content = json.loads(package_before)
        if content["scripts"]["compile"] not in {" ".join(COMMAND), WRAPPER}:
            raise NoReuse("custom-compile-command")
        previous = package_before
        with build_lock(root):
            pass
        content["scripts"]["compile"] = WRAPPER
        package.write_text(json.dumps(content, indent=2) + "\n")
        key, _, inputs, _ = fingerprint(root, original)
        target = root / "target"
        target.mkdir(exist_ok=True)
        (target / "graph-build-inputs.json").write_text(json.dumps(
            {"key": key, "inputs": inputs}, sort_keys=True
        ) + "\n")
        event("prepare", "ready", started, key)
    except (NoReuse, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        key = ""
        if previous is not None:
            content = json.loads(previous)
            if content["scripts"]["compile"] == WRAPPER:
                content["scripts"]["compile"] = " ".join(COMMAND)
                previous = (json.dumps(content, indent=2) + "\n").encode()
            package.write_bytes(previous)
        event("prepare", "unsupported", started, reason=failure_reason(error))
    return key


def main() -> int:
    root = Path(__file__).resolve().parents[3]
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "compile", "publish"}:
        raise SystemExit("Usage: graph_build_cache.py prepare|compile|publish")
    original = dict(os.environ)
    if sys.argv[1] == "compile":
        return compile_graph(root, original)
    if sys.argv[1] == "publish":
        valid = publish(root, original)
        if original.get("GITHUB_OUTPUT"):
            with open(original["GITHUB_OUTPUT"], "a") as stream:
                stream.write(f"valid={str(valid).lower()}\n")
        return 0
    key = prepare(root, original)
    if original.get("GITHUB_OUTPUT"):
        with open(original["GITHUB_OUTPUT"], "a") as stream:
            stream.write(f"key={key}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
