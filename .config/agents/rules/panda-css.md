---
name: panda-css
description: Panda CSS styling framework guidance. Use when working with @pandacss packages, styled components, design tokens, or responsive/conditional styles.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - panda-css
      - panda css
      - pandacss
      - "@pandacss"
    intent-patterns:
      - "\\b(use|style|create|configure)\\b.*?\\bpanda(-| )?css\\b"
      - "\\bcss\\b.*?\\b(recipe|pattern|token)s?\\b"
---

# Panda CSS

CSS-in-JS framework with static analysis and atomic CSS output for type-safe, optimized styling.

## LLM-Optimized Documentation

Fetch these pre-compiled docs for comprehensive topic coverage:

| Topic         | URL                                          | Covers                                                                           |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Complete Docs | https://panda-css.com/llms-full.txt          | Everything in one file                                                           |
| Overview      | https://panda-css.com/llms.txt/overview      | Getting started, browser support, FAQ, why Panda                                 |
| Installation  | https://panda-css.com/llms.txt/installation  | Framework-specific setup guides                                                  |
| Concepts      | https://panda-css.com/llms.txt/concepts      | Patterns, recipes, conditional styles, responsive design, cascade layers, hooks  |
| Theming       | https://panda-css.com/llms.txt/theming       | Design tokens, text styles, layer styles, animation styles                       |
| Utilities     | https://panda-css.com/llms.txt/utilities     | All CSS utilities by category (background, border, flex, grid, typography, etc.) |
| Customization | https://panda-css.com/llms.txt/customization | Custom theme, utilities, patterns, presets                                       |
| Guides        | https://panda-css.com/llms.txt/guides        | Practical use case guides                                                        |
| Migration     | https://panda-css.com/llms.txt/migration     | Migrating from other CSS-in-JS libraries                                         |
| References    | https://panda-css.com/llms.txt/references    | CLI commands, configuration reference                                            |

For broad topic understanding, fetch the aggregated `/llms.txt/topic` URL. For specific page details, fetch `/docs/path/page.mdx`.

## Key Concepts

### Cascade Layers (specificity order)

1. `reset` - CSS reset/preflight
2. `base` - Global base styles
3. `tokens` - Design token CSS variables
4. `recipes` - Component recipe styles
5. `utilities` - Atomic utility classes

### Styling Approaches

- `css()` function - Inline atomic styles
- Recipes (`cva`) - Multi-variant component styles with base, variants, compoundVariants
- Config recipes - JIT generation, only used variants compiled
- Patterns - Layout primitives (Stack, Flex, Grid, Container)

### Conditional Styling

- Pseudo-classes: `_hover`, `_focus`, `_active`, `_disabled`
- Pseudo-elements: `_before`, `_after`
- Responsive: `sm`, `md`, `lg`, `xl`, `2xl` breakpoints
- Color opacity: `color/opacity` syntax (e.g., `blue.500/50`)

### Design Tokens

- Semantic tokens with light/dark mode support
- Token categories: colors, spacing, sizes, fonts, radii, shadows
- Access via `token()` function or curly brace syntax

## Key Patterns

- Static analysis at build time extracts styles from source
- JIT CSS generation - only used styles are compiled
- Type-safe APIs with generated TypeScript types
- Atomic CSS output for optimal caching
- `extend` keyword for customizing without losing defaults
