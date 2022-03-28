const COMMENT_EXAMPLES = [
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/804591810",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/issues/5#issuecomment-804591810",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/5",
      id: 804591810,
      node_id: "MDEyOklzc3VlQ29tbWVudDgwNDU5MTgxMA==",
      user: {
        login: "ecton",
        id: 50053,
        node_id: "MDQ6VXNlcjUwMDUz",
        avatar_url: "https://avatars.githubusercontent.com/u/50053?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/ecton",
        html_url: "https://github.com/ecton",
        followers_url: "https://api.github.com/users/ecton/followers",
        following_url:
          "https://api.github.com/users/ecton/following{/other_user}",
        gists_url: "https://api.github.com/users/ecton/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/ecton/starred{/owner}{/repo}",
        subscriptions_url: "https://api.github.com/users/ecton/subscriptions",
        organizations_url: "https://api.github.com/users/ecton/orgs",
        repos_url: "https://api.github.com/users/ecton/repos",
        events_url: "https://api.github.com/users/ecton/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/ecton/received_events",
        type: "User",
        site_admin: "False",
      },
      created_at: "2021-03-23T03:37:34.000000Z",
      updated_at: "2021-03-23T03:37:34.000000Z",
      author_association: "MEMBER",
      body: "Still need to add tests for the edge cases around the transaction query API",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/803612169",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/pull/1#issuecomment-803612169",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/1",
      id: 803612169,
      node_id: "MDEyOklzc3VlQ29tbWVudDgwMzYxMjE2OQ==",
      user: {
        login: "codecov[bot]",
        id: 22429695,
        node_id: "MDM6Qm90MjI0Mjk2OTU=",
        avatar_url: "https://avatars.githubusercontent.com/in/254?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/codecov%5Bbot%5D",
        html_url: "https://github.com/apps/codecov",
        followers_url:
          "https://api.github.com/users/codecov%5Bbot%5D/followers",
        following_url:
          "https://api.github.com/users/codecov%5Bbot%5D/following{/other_user}",
        gists_url:
          "https://api.github.com/users/codecov%5Bbot%5D/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/codecov%5Bbot%5D/starred{/owner}{/repo}",
        subscriptions_url:
          "https://api.github.com/users/codecov%5Bbot%5D/subscriptions",
        organizations_url: "https://api.github.com/users/codecov%5Bbot%5D/orgs",
        repos_url: "https://api.github.com/users/codecov%5Bbot%5D/repos",
        events_url:
          "https://api.github.com/users/codecov%5Bbot%5D/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/codecov%5Bbot%5D/received_events",
        type: "Bot",
        site_admin: "False",
      },
      created_at: "2021-03-21T16:09:36.000000Z",
      updated_at: "2021-03-24T12:58:20.000000Z",
      author_association: "NONE",
      body: "# [Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/1?src=pr&el=h1) Report\n> Merging [#1](https://codecov.io/gh/khonsulabs/pliantdb/pull/1?src=pr&el=desc) (589a019) into [main](https://codecov.io/gh/khonsulabs/pliantdb/commit/a2a0e326ed840b22dcafb56542428ad0c8ae810b?el=desc) (a2a0e32) will **increase** coverage by `16.60%`.\n> The diff coverage is `n/a`.\n\n[![Impacted file tree graph](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/graphs/tree.svg?width=650&height=150&src=pr&token=DTN021D8I8)](https://codecov.io/gh/khonsulabs/pliantdb/pull/1?src=pr&el=tree)\n\n```diff\n@@             Coverage Diff             @@\n##             main       #1       +/-   ##\n===========================================\n+ Coverage   38.33%   54.93%   +16.60%     \n===========================================\n  Files          16       15        -1     \n  Lines         647     1347      +700     \n  Branches      294        0      -294     \n===========================================\n+ Hits          248      740      +492     \n- Misses        104      607      +503     \n+ Partials      295        0      -295     \n```\n\n\n| [Impacted Files](https://codecov.io/gh/khonsulabs/pliantdb/pull/1?src=pr&el=tree) | Coverage \u0394 | |\n|---|---|---|\n| [local/src/error.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL2Vycm9yLnJz) | `4.51% <0.00%> (-10.88%)` | :arrow_down: |\n| [core/src/schema/view.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL3ZpZXcucnM=) | `0.00% <0.00%> (\u00f8)` | |\n| [pliantdb/src/lib.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-cGxpYW50ZGIvc3JjL2xpYi5ycw==) | | |\n| [core/src/schema/collection.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL2NvbGxlY3Rpb24ucnM=) | `40.00% <0.00%> (+3.63%)` | :arrow_up: |\n| [core/src/transaction.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-Y29yZS9zcmMvdHJhbnNhY3Rpb24ucnM=) | `48.26% <0.00%> (+7.52%)` | :arrow_up: |\n| [core/src/test\\_util.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-Y29yZS9zcmMvdGVzdF91dGlsLnJz) | `66.66% <0.00%> (+14.03%)` | :arrow_up: |\n| [core/src/document/revision.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-Y29yZS9zcmMvZG9jdW1lbnQvcmV2aXNpb24ucnM=) | `100.00% <0.00%> (+21.05%)` | :arrow_up: |\n| [core/src/schema/view/map.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL3ZpZXcvbWFwLnJz) | `86.36% <0.00%> (+35.69%)` | :arrow_up: |\n| [core/src/schema/database.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL2RhdGFiYXNlLnJz) | `100.00% <0.00%> (+35.71%)` | :arrow_up: |\n| [local/src/open\\_trees.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL29wZW5fdHJlZXMucnM=) | `100.00% <0.00%> (+40.00%)` | :arrow_up: |\n| ... and [5 more](https://codecov.io/gh/khonsulabs/pliantdb/pull/1/diff?src=pr&el=tree-more) | |\n\n------\n\n[Continue to review full report at Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/1?src=pr&el=continue).\n> **Legend** - [Click here to learn more](https://docs.codecov.io/docs/codecov-delta)\n> `\u0394 = absolute <relative> (impact)`, `\u00f8 = not affected`, `? = missing data`\n> Powered by [Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/1?src=pr&el=footer). Last update [a2a0e32...589a019](https://codecov.io/gh/khonsulabs/pliantdb/pull/1?src=pr&el=lastupdated). Read the [comment docs](https://docs.codecov.io/docs/pull-request-comments).\n",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/806284424",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/pull/6#issuecomment-806284424",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/6",
      id: 806284424,
      node_id: "MDEyOklzc3VlQ29tbWVudDgwNjI4NDQyNA==",
      user: {
        login: "codecov[bot]",
        id: 22429695,
        node_id: "MDM6Qm90MjI0Mjk2OTU=",
        avatar_url: "https://avatars.githubusercontent.com/in/254?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/codecov%5Bbot%5D",
        html_url: "https://github.com/apps/codecov",
        followers_url:
          "https://api.github.com/users/codecov%5Bbot%5D/followers",
        following_url:
          "https://api.github.com/users/codecov%5Bbot%5D/following{/other_user}",
        gists_url:
          "https://api.github.com/users/codecov%5Bbot%5D/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/codecov%5Bbot%5D/starred{/owner}{/repo}",
        subscriptions_url:
          "https://api.github.com/users/codecov%5Bbot%5D/subscriptions",
        organizations_url: "https://api.github.com/users/codecov%5Bbot%5D/orgs",
        repos_url: "https://api.github.com/users/codecov%5Bbot%5D/repos",
        events_url:
          "https://api.github.com/users/codecov%5Bbot%5D/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/codecov%5Bbot%5D/received_events",
        type: "Bot",
        site_admin: "False",
      },
      created_at: "2021-03-25T01:08:49.000000Z",
      updated_at: "2021-03-27T23:17:57.000000Z",
      author_association: "NONE",
      body: "# [Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/6?src=pr&el=h1) Report\n> Merging [#6](https://codecov.io/gh/khonsulabs/pliantdb/pull/6?src=pr&el=desc) (e5e7110) into [main](https://codecov.io/gh/khonsulabs/pliantdb/commit/ec9121496580246f876d65e663d2e4b2d6247258?el=desc) (ec91214) will **increase** coverage by `12.75%`.\n> The diff coverage is `90.66%`.\n\n[![Impacted file tree graph](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/graphs/tree.svg?width=650&height=150&src=pr&token=DTN021D8I8)](https://codecov.io/gh/khonsulabs/pliantdb/pull/6?src=pr&el=tree)\n\n```diff\n@@             Coverage Diff             @@\n##             main       #6       +/-   ##\n===========================================\n+ Coverage   58.95%   71.70%   +12.75%     \n===========================================\n  Files          15       26       +11     \n  Lines        1357     2541     +1184     \n===========================================\n+ Hits          800     1822     +1022     \n- Misses        557      719      +162     \n```\n\n\n| [Impacted Files](https://codecov.io/gh/khonsulabs/pliantdb/pull/6?src=pr&el=tree) | Coverage \u0394 | |\n|---|---|---|\n| [local/src/error.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL2Vycm9yLnJz) | `15.64% <0.00%> (+1.60%)` | :arrow_up: |\n| [local/src/lib.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL2xpYi5ycw==) | `100.00% <\u00f8> (\u00f8)` | |\n| [core/src/test\\_util.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-Y29yZS9zcmMvdGVzdF91dGlsLnJz) | `64.70% <60.00%> (-1.97%)` | :arrow_down: |\n| [local/src/config.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL2NvbmZpZy5ycw==) | `57.56% <82.35%> (\u00f8)` | |\n| [core/src/schema/database.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL2RhdGFiYXNlLnJz) | `92.10% <86.36%> (-7.90%)` | :arrow_down: |\n| [core/src/schema/view/map.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL3ZpZXcvbWFwLnJz) | `91.30% <88.09%> (-3.70%)` | :arrow_down: |\n| [core/src/schema/view.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL3ZpZXcucnM=) | `56.75% <88.23%> (+56.75%)` | :arrow_up: |\n| [local/src/views/integrity\\_scanner.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL3ZpZXdzL2ludGVncml0eV9zY2FubmVyLnJz) | `89.02% <89.02%> (\u00f8)` | |\n| [jobs/src/manager/tests.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-am9icy9zcmMvbWFuYWdlci90ZXN0cy5ycw==) | `90.47% <90.47%> (\u00f8)` | |\n| [jobs/src/task.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree#diff-am9icy9zcmMvdGFzay5ycw==) | `91.66% <91.66%> (\u00f8)` | |\n| ... and [27 more](https://codecov.io/gh/khonsulabs/pliantdb/pull/6/diff?src=pr&el=tree-more) | |\n\n------\n\n[Continue to review full report at Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/6?src=pr&el=continue).\n> **Legend** - [Click here to learn more](https://docs.codecov.io/docs/codecov-delta)\n> `\u0394 = absolute <relative> (impact)`, `\u00f8 = not affected`, `? = missing data`\n> Powered by [Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/6?src=pr&el=footer). Last update [ec91214...e5e7110](https://codecov.io/gh/khonsulabs/pliantdb/pull/6?src=pr&el=lastupdated). Read the [comment docs](https://docs.codecov.io/docs/pull-request-comments).\n",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/809454297",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/pull/20#issuecomment-809454297",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/20",
      id: 809454297,
      node_id: "MDEyOklzc3VlQ29tbWVudDgwOTQ1NDI5Nw==",
      user: {
        login: "kl-botsu",
        id: 59885859,
        node_id: "MDQ6VXNlcjU5ODg1ODU5",
        avatar_url: "https://avatars.githubusercontent.com/u/59885859?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/kl-botsu",
        html_url: "https://github.com/kl-botsu",
        followers_url: "https://api.github.com/users/kl-botsu/followers",
        following_url:
          "https://api.github.com/users/kl-botsu/following{/other_user}",
        gists_url: "https://api.github.com/users/kl-botsu/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/kl-botsu/starred{/owner}{/repo}",
        subscriptions_url:
          "https://api.github.com/users/kl-botsu/subscriptions",
        organizations_url: "https://api.github.com/users/kl-botsu/orgs",
        repos_url: "https://api.github.com/users/kl-botsu/repos",
        events_url: "https://api.github.com/users/kl-botsu/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/kl-botsu/received_events",
        type: "User",
        site_admin: "False",
      },
      created_at: "2021-03-29T15:03:50.000000Z",
      updated_at: "2021-03-29T15:05:39.000000Z",
      author_association: "CONTRIBUTOR",
      body: "[![CLA assistant check](https://cla.khonsulabs.com:443/pull/badge/signed)](https://cla.khonsulabs.com:443/khonsulabs/pliantdb?pullRequest=20) <br/>All committers have signed the CLA.",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/809042983",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/pull/20#issuecomment-809042983",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/20",
      id: 809042983,
      node_id: "MDEyOklzc3VlQ29tbWVudDgwOTA0Mjk4Mw==",
      user: {
        login: "codecov[bot]",
        id: 22429695,
        node_id: "MDM6Qm90MjI0Mjk2OTU=",
        avatar_url: "https://avatars.githubusercontent.com/in/254?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/codecov%5Bbot%5D",
        html_url: "https://github.com/apps/codecov",
        followers_url:
          "https://api.github.com/users/codecov%5Bbot%5D/followers",
        following_url:
          "https://api.github.com/users/codecov%5Bbot%5D/following{/other_user}",
        gists_url:
          "https://api.github.com/users/codecov%5Bbot%5D/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/codecov%5Bbot%5D/starred{/owner}{/repo}",
        subscriptions_url:
          "https://api.github.com/users/codecov%5Bbot%5D/subscriptions",
        organizations_url: "https://api.github.com/users/codecov%5Bbot%5D/orgs",
        repos_url: "https://api.github.com/users/codecov%5Bbot%5D/repos",
        events_url:
          "https://api.github.com/users/codecov%5Bbot%5D/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/codecov%5Bbot%5D/received_events",
        type: "Bot",
        site_admin: "False",
      },
      created_at: "2021-03-29T03:38:20.000000Z",
      updated_at: "2021-03-29T19:53:33.000000Z",
      author_association: "NONE",
      body: "# [Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/20?src=pr&el=h1) Report\n> Merging [#20](https://codecov.io/gh/khonsulabs/pliantdb/pull/20?src=pr&el=desc) (c185084) into [main](https://codecov.io/gh/khonsulabs/pliantdb/commit/edf579783da9e83172f67a95e939cd9e940389b2?el=desc) (edf5797) will **increase** coverage by `1.69%`.\n> The diff coverage is `91.42%`.\n\n[![Impacted file tree graph](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/graphs/tree.svg?width=650&height=150&src=pr&token=DTN021D8I8)](https://codecov.io/gh/khonsulabs/pliantdb/pull/20?src=pr&el=tree)\n\n```diff\n@@            Coverage Diff             @@\n##             main      #20      +/-   ##\n==========================================\n+ Coverage   75.50%   77.20%   +1.69%     \n==========================================\n  Files          26       26              \n  Lines        2874     2983     +109     \n==========================================\n+ Hits         2170     2303     +133     \n+ Misses        704      680      -24     \n```\n\n\n| [Impacted Files](https://codecov.io/gh/khonsulabs/pliantdb/pull/20?src=pr&el=tree) | Coverage \u0394 | |\n|---|---|---|\n| [core/src/schema/view/map.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL3ZpZXcvbWFwLnJz) | `95.71% <0.00%> (+4.40%)` | :arrow_up: |\n| [local/src/error.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL2Vycm9yLnJz) | `15.77% <0.00%> (+0.13%)` | :arrow_up: |\n| [local/src/views.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL3ZpZXdzLnJz) | `100.00% <\u00f8> (\u00f8)` | |\n| [local/src/tasks.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL3Rhc2tzLnJz) | `95.04% <57.14%> (-0.92%)` | :arrow_down: |\n| [local/src/tests.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL3Rlc3RzLnJz) | `88.62% <76.92%> (-0.48%)` | :arrow_down: |\n| [core/src/schema/view.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-Y29yZS9zcmMvc2NoZW1hL3ZpZXcucnM=) | `78.18% <85.00%> (+21.42%)` | :arrow_up: |\n| [local/src/storage.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL3N0b3JhZ2UucnM=) | `95.66% <96.90%> (+0.11%)` | :arrow_up: |\n| [core/src/connection.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-Y29yZS9zcmMvY29ubmVjdGlvbi5ycw==) | `90.52% <100.00%> (+0.30%)` | :arrow_up: |\n| [core/src/test\\_util.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-Y29yZS9zcmMvdGVzdF91dGlsLnJz) | `89.60% <100.00%> (+16.79%)` | :arrow_up: |\n| [local/src/views/mapper.rs](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree#diff-bG9jYWwvc3JjL3ZpZXdzL21hcHBlci5ycw==) | `92.95% <100.00%> (+0.68%)` | :arrow_up: |\n| ... and [3 more](https://codecov.io/gh/khonsulabs/pliantdb/pull/20/diff?src=pr&el=tree-more) | |\n\n------\n\n[Continue to review full report at Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/20?src=pr&el=continue).\n> **Legend** - [Click here to learn more](https://docs.codecov.io/docs/codecov-delta)\n> `\u0394 = absolute <relative> (impact)`, `\u00f8 = not affected`, `? = missing data`\n> Powered by [Codecov](https://codecov.io/gh/khonsulabs/pliantdb/pull/20?src=pr&el=footer). Last update [edf5797...c185084](https://codecov.io/gh/khonsulabs/pliantdb/pull/20?src=pr&el=lastupdated). Read the [comment docs](https://docs.codecov.io/docs/pull-request-comments).\n",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/816393925",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/pull/28#issuecomment-816393925",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/28",
      id: 816393925,
      node_id: "MDEyOklzc3VlQ29tbWVudDgxNjM5MzkyNQ==",
      user: {
        login: "ecton",
        id: 50053,
        node_id: "MDQ6VXNlcjUwMDUz",
        avatar_url: "https://avatars.githubusercontent.com/u/50053?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/ecton",
        html_url: "https://github.com/ecton",
        followers_url: "https://api.github.com/users/ecton/followers",
        following_url:
          "https://api.github.com/users/ecton/following{/other_user}",
        gists_url: "https://api.github.com/users/ecton/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/ecton/starred{/owner}{/repo}",
        subscriptions_url: "https://api.github.com/users/ecton/subscriptions",
        organizations_url: "https://api.github.com/users/ecton/orgs",
        repos_url: "https://api.github.com/users/ecton/repos",
        events_url: "https://api.github.com/users/ecton/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/ecton/received_events",
        type: "User",
        site_admin: "False",
      },
      created_at: "2021-04-09T04:32:42.000000Z",
      updated_at: "2021-04-09T04:32:42.000000Z",
      author_association: "MEMBER",
      body: "This is now \"feature complete\". Need to: \r\n* write docs for the networking types\r\n* Figure out whether I care about making the type-less APIs on Storage accessible only through a trait that marks them as internal only. Because the APIs cross crate boundaries, I can't make them truly private APIs. Users really shouldn't use much outside fo the Connection and ServerConnection traits.",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/819000099",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/issues/30#issuecomment-819000099",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/30",
      id: 819000099,
      node_id: "MDEyOklzc3VlQ29tbWVudDgxOTAwMDA5OQ==",
      user: {
        login: "ecton",
        id: 50053,
        node_id: "MDQ6VXNlcjUwMDUz",
        avatar_url: "https://avatars.githubusercontent.com/u/50053?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/ecton",
        html_url: "https://github.com/ecton",
        followers_url: "https://api.github.com/users/ecton/followers",
        following_url:
          "https://api.github.com/users/ecton/following{/other_user}",
        gists_url: "https://api.github.com/users/ecton/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/ecton/starred{/owner}{/repo}",
        subscriptions_url: "https://api.github.com/users/ecton/subscriptions",
        organizations_url: "https://api.github.com/users/ecton/orgs",
        repos_url: "https://api.github.com/users/ecton/repos",
        events_url: "https://api.github.com/users/ecton/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/ecton/received_events",
        type: "User",
        site_admin: "False",
      },
      created_at: "2021-04-13T19:34:00.000000Z",
      updated_at: "2021-04-13T19:34:00.000000Z",
      author_association: "MEMBER",
      body: "As of cb2f1e9391211774636e9d65e39445e713a654d9, this has been fixed, but keeping this open because khonsulabs/fabruic#5 will move a lot of this logic into fabruic.",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
  {
    type: "RECORD",
    stream: "comments",
    record: {
      url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/comments/818960104",
      html_url:
        "https://github.com/khonsulabs/bonsaidb/pull/28#issuecomment-818960104",
      issue_url: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/28",
      id: 818960104,
      node_id: "MDEyOklzc3VlQ29tbWVudDgxODk2MDEwNA==",
      user: {
        login: "ecton",
        id: 50053,
        node_id: "MDQ6VXNlcjUwMDUz",
        avatar_url: "https://avatars.githubusercontent.com/u/50053?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/ecton",
        html_url: "https://github.com/ecton",
        followers_url: "https://api.github.com/users/ecton/followers",
        following_url:
          "https://api.github.com/users/ecton/following{/other_user}",
        gists_url: "https://api.github.com/users/ecton/gists{/gist_id}",
        starred_url:
          "https://api.github.com/users/ecton/starred{/owner}{/repo}",
        subscriptions_url: "https://api.github.com/users/ecton/subscriptions",
        organizations_url: "https://api.github.com/users/ecton/orgs",
        repos_url: "https://api.github.com/users/ecton/repos",
        events_url: "https://api.github.com/users/ecton/events{/privacy}",
        received_events_url:
          "https://api.github.com/users/ecton/received_events",
        type: "User",
        site_admin: "False",
      },
      created_at: "2021-04-13T18:26:42.000000Z",
      updated_at: "2021-04-14T00:10:44.000000Z",
      author_association: "MEMBER",
      body: "Things left as of this morning's review process:\r\n\r\n- [x] Add server configuration\r\n- [x] Write server example\r\n- [x] Write server documentation:\r\n  - [x] trusted-dns\r\n  - [x] websockets\r\n- [x] Add integration-style test with multiple clients.",
      _sdc_repository: "khonsulabs/bonsaidb",
    },
    time_extracted: "2022-03-12T17:17:48.154352Z",
  },
];
