#!/usr/bin/env sh

set -eux

yarn reset-database -o none
yarn httpyac send --all tests/friendship.http -o none
yarn reset-database -o none
yarn httpyac send --all tests/circular-links.http -o none
yarn reset-database -o none
yarn httpyac send --all tests/ambiguous.http -o none
yarn reset-database -o none
yarn httpyac send --all tests/link-inheritance.http -o none
yarn reset-database -o none
