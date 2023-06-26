#!/usr/bin/env just --justfile

set fallback

[private]
default:
  @just usage

miri *arguments:
  @echo 'miri is disabled for `sarif`'

coverage *arguments:
  cargo llvm-cov --workspace --all-features --doctests {{arguments}}
