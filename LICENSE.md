[apache license 2.0]: https://github.com/hashintel/hash/blob/main/.github/licenses/LICENSE-APACHE.md
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

## License Determination

**The following rules apply on the `main` branch only.** The license for a particular work is defined with following prioritized rules (precedence established top-to-bottom):

1.  If present: license information directly present in the file
1.  If a file exists directly or indirectly inside a directory titled `_h`: it is available under the [HASH License] only
1.  If present: `LICENSE`, `LICENSE.md` or `LICENSE.txt` file in the same directory as the work
1.  If present: first `LICENSE`, `LICENSE.md` or `LICENSE.txt` file found when exploring parent directories up to the project top level directory
1.  Otherwise: defaults to dual-release under the [MIT License] and [Apache License 2.0], at your option

Files and work on branches other than `main` may be unlicensed. By default you should assume that all rights are reserved, and should reach out to the branch author to clarify if in any doubt.

## Quick Reference

As outlined by the license files in the respective directories:

- Within `/blocks` source code is (unless otherwise noted) generally available under either the MIT License or Apache License 2.0, at your option.
- Within `/apps`, `/libs` and `/tests`, source code in sub-directories (including those which are nested) named `@local` or prefixed `hash` are typically licensed under version 3 of the GNU Affero General Public License.

These **quick reference** guidelines are provided as general heuristics only. In all cases, you should follow the above **license determination** rules, outlined in the section above, to verify the actual terms under which code has been published.

## Questions

If you have any questions please [contact us](https://hash.ai/contact).
