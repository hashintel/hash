#!/usr/bin/env sh

set -eux

yarn reset-database
yarn httpyac send --all tests/friendship.http
yarn reset-database
yarn httpyac send --all tests/circular-links.http
yarn reset-database
yarn httpyac send --all tests/ambiguous.http
yarn reset-database
