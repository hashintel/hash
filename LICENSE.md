[apache license 2.0]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-APACHE.md
[contact us]: https://hash.ai/contact?utm_medium=organic&utm_source=github_license_repo-root-file
[elastic license 2.0]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-ELASTIC.md
[gnu affero general public license 3.0]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-AGPL.md
[mit license]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-MIT.md
[hash license]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-HASH.md

# License

The vast majority of the HASH monorepo contains **open-source code** variously licensed under either:
- the [MIT License] and [Apache License 2.0] dually (default);
- the [GNU Affero General Public License 3.0]; or
- the [Elastic License 2.0].

In the interests of transparency, certain proprietary code is also made available under the source-available [HASH License].

## 1. License Determination

**The following rules apply on the `main` branch only.** The license for a particular work is defined in accordance with the following prioritized rules (precedence established first-to-last):

1.  **If present:** license information directly present in the file; else
1.  **If a file exists directly or indirectly inside a directory titled `_h`:** available under the [HASH License] only; else
1.  **If present:** `LICENSE`, `LICENSE.md` or `LICENSE.txt` file in the same directory as the work; else
1.  **If present:** first `LICENSE`, `LICENSE.md` or `LICENSE.txt` file found when exploring parent directories up to the project top level directory; else
1.  **Otherwise:** defaults to dual-release under the [MIT License] and [Apache License 2.0], at your option.

No license is granted by HASH to files and work on branches other than `main`.

## 2. Quick Reference

As outlined by the license files in the respective directories:

- Within `/blocks` source code is (unless otherwise noted) generally available under either the [MIT License] or [Apache License 2.0], at your option.
- Within `/apps`, `/libs` and `/tests`, source code in sub-directories (including those which are nested) named `@local` or prefixed `hash` are typically licensed under the [GNU Affero General Public License 3.0].
- Anything inside a directory titled `_h` (no matter how deeply nested within) is available under the [HASH License] only. This applies to code repo-wide (including to code within the aforementioned `/apps`, `/libs` and other directories).

These **quick reference** guidelines are provided as general heuristics only. In all cases, you should follow the above **license determination** rules, outlined in section 2 (above), to verify the actual terms under which work is available.

## 3. Questions

If you have any questions please [contact us].
