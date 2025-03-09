# HASH Crate Dependency Diagram

This document provides a visualization of the crate dependencies in the HASH codebase.

The diagram shows relationships between crates in the repository, with different arrow styles representing different dependency types:

- `-->` : Normal dependency
- `-.->` : Dev dependency
- `--->` : Build dependency
- `==>` : Dependency from root crate (when one is specified)

## Dependency Diagram

```mermaid
graph TD
    %% Configure the diagram
    linkStyle default stroke-width:1.5px
    classDef default stroke-width:1px
    classDef root stroke-width:2px
    classDef dev stroke-width:1px
    classDef build stroke-width:1px
    
    %% Legend
    %% --> : Normal dependency
    %% -.-> : Dev dependency
    %% ---> : Build dependency
    %% ==> : Dependency from root crate
    
    %% This is a placeholder - the actual diagram will be generated at build time
    %% by running the diagram command
```

## Customizing the Diagram

The dependency diagram can be customized when generated using the following options:

- `--root <CRATE>`: Highlight a specific crate as the root
- `--crate-name <CRATE>`: Filter to show only a specific crate and its dependencies
- `--focus`: Show only direct dependencies of the specified crate
- `--no-dedup-transitive`: Include all transitive dependencies (by default, transitive dependencies are deduplicated)
- `--include-dev-deps` or `-t`: Include development dependencies
- `--include-build-deps` or `-b`: Include build dependencies

## Generating the Diagram

Run the following command to generate the dependency diagram with all dependencies included:

```
cargo run -- diagram --include-dev-deps --include-build-deps
```

Or use the NPM script:

```
npm run generate-diagram
```
