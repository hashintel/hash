# Contributing

🎉 First off, thanks for taking the time to contribute! 🎉

Please note we have established a set of [community guidelines](https://hash.ai/legal/community). Please follow these in your interactions with the project.

We have a [community Discord server](https://hash.ai/discord) and a [support forum](https://hash.community/) where you can ask questions about contributing, and where the community can chime in with helpful advice. If you'd like to make a significant change or re-architecture, please first discuss the change there (or create an [issue](https://github.com/hashintel/hash/issues)) to get feedback.

## What belongs in the HASH Standard Library

The HASH standard library is a collection of helper functions for building simulations. Standard library functions should be:

- General Purpose - both in the use case they are solving for and in their interface.
- Performant - if it's in the standard library it will be used in lots of simulations, and should be designed to be fast and memory efficient.
- Pure functions - While there can be exceptions, the expectation is a standard library function should not store any state nor cause side effects.

When in doubt, [ask](https://hash.ai/discord)!

## Pull Request Process

1.  Before opening a Pull Request, you must sign HASH's Contributor License Agreement available at [hash.ai/legal/cla](https://hash.ai/legal/cla).
1.  Once you've signed the CLA and finalized your PR, please ensure any install or build dependencies are removed before doing a build.
1.  After submitting your PR, it'll be reviewed by a HASH standard library maintainer. After you have the approval of a maintainer, you may merge the pull request.

## Contribution requirements

1.  All PRs should include tests.
1.  You may contribute functions in either Python or TypeScript, or both.

## Code of Conduct

In the interest of fostering an open and welcoming environment, we as
contributors and maintainers pledge to making participation in our project and
our community a harassment-free experience for everyone, regardless of age, body
size, disability, ethnicity, gender identity and expression, level of experience,
nationality, personal appearance, race, religion, or sexual identity and
orientation. You can read more in our [community guidelines](https://hash.ai/legal/community).

Examples of behavior that contributes to creating a positive environment
include:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

Examples of unacceptable behavior by participants include:

- The use of sexualized language or imagery and unwelcome sexual attention or
  advances
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information, such as a physical or electronic
  address, without explicit permission
- Other conduct which could reasonably be considered inappropriate in a
  professional setting

[HASH](https://hash.ai/) reserves the right to remove, edit, or reject comments,
commits, code, wiki edits, issues, and other contributions that are not aligned
to this Code of Conduct, or to ban temporarily or permanently any contributor
for other behaviors that they deem inappropriate, threatening, offensive, or
harmful.

This Code of Conduct applies both within project spaces and in public spaces
when an individual is representing the project or its community. Examples of
representing a project or community include using an official project e-mail
address, posting via an official social media account, or acting as an appointed
representative at an online or offline event. Representation of a project may be
further defined and clarified by project maintainers.

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported by contacting the project team through [hash.ai/contact](https://hash.ai/contact).
All complaints will be reviewed and investigated and will result in a response that
is deemed necessary and appropriate to the circumstances. The project team is
obligated to maintain confidentiality with regard to the reporter of an incident.
Further details of specific enforcement policies may be posted separately.

### Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage], version 1.4,
available at [http://contributor-covenant.org/version/1/4][version]

[homepage]: http://contributor-covenant.org
[version]: http://contributor-covenant.org/version/1/4/
