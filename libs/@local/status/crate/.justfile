#!/usr/bin/env just --justfile

set fallback

[private]
@default:
  just usage

[private]
miri *arguments:
  @echo 'miri is disabled for `hash-status`'
