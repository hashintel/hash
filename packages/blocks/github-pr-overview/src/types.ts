import { Entity } from "@blockprotocol/graph";

export function isDefined<T>(val: T | undefined | null): val is T {
  return val !== undefined && val !== null;
}

export const enum GITHUB_ENTITY_TYPES {
  PullRequest,
  Review,
  IssueEvent,
}

export enum BlockState {
  Loading = "loading",
  Error = "error",
  Selector = "selector",
  Overview = "overview",
}

export type LocalState = {
  blockState: BlockState;
  selectedPullRequestIdentifier?: PullRequestIdentifier;
  githubEntityTypeIds?: { [key in GITHUB_ENTITY_TYPES]: string };
  allPrs?: Map<string, GithubPullRequestEntityType>;
  pullRequest?: GithubPullRequestEntityType;
  reviews: GithubReviewEntityType["properties"][];
  events: GithubIssueEventEntityType["properties"][];
  infoMessage: string;
};

type Action<S, T = undefined> = T extends undefined
  ? { type: S }
  : {
      type: S;
      payload: T;
    };

export type Actions =
  | Action<"UPDATE_STATE", Partial<LocalState>>
  | Action<"RESET_SELECTED_PR">;

export type PullRequestIdentifier = {
  repository: string;
  number: number;
};

export type GithubPullRequestEntityType = Entity<{
  repository?: string;
  url?: null | string;
  id?: null | number;
  node_id?: null | string;
  html_url?: null | string;
  diff_url?: null | string;
  patch_url?: null | string;
  issue_url?: null | string;
  commits_url?: null | string;
  review_comments_url?: null | string;
  review_comment_url?: null | string;
  comments_url?: null | string;
  statuses_url?: null | string;
  number?: null | number;
  state?: null | string;
  locked?: null | boolean;
  title?: null | string;
  user?: null | {
    login?: null | string;
    id?: null | number;
    node_id?: null | string;
    avatar_url?: null | string;
    gravatar_id?: null | string;
    url?: null | string;
    html_url?: null | string;
    followers_url?: null | string;
    following_url?: null | string;
    gists_url?: null | string;
    starred_url?: null | string;
    subscriptions_url?: null | string;
    organizations_url?: null | string;
    repos_url?: null | string;
    events_url?: null | string;
    received_events_url?: null | string;
    type?: null | string;
    site_admin?: null | boolean;
    [k: string]: unknown;
  };
  body?: null | string;
  labels?:
    | null
    | (null | {
        id?: null | number;
        node_id?: null | string;
        url?: null | string;
        name?: null | string;
        description?: null | string;
        color?: null | string;
        default?: null | boolean;
        [k: string]: unknown;
      })[];
  milestone?: null | {
    url?: null | string;
    html_url?: null | string;
    labels_url?: null | string;
    id?: null | number;
    node_id?: null | string;
    number?: null | number;
    state?: null | string;
    title?: null | string;
    description?: null | string;
    creator?: null | {
      login?: null | string;
      id?: null | number;
      node_id?: null | string;
      avatar_url?: null | string;
      gravatar_id?: null | string;
      url?: null | string;
      html_url?: null | string;
      followers_url?: null | string;
      following_url?: null | string;
      gists_url?: null | string;
      starred_url?: null | string;
      subscriptions_url?: null | string;
      organizations_url?: null | string;
      repos_url?: null | string;
      events_url?: null | string;
      received_events_url?: null | string;
      type?: null | string;
      site_admin?: null | boolean;
      [k: string]: unknown;
    };
    open_issues?: null | number;
    closed_issues?: null | number;
    created_at?: null | string;
    updated_at?: null | string;
    closed_at?: null | string;
    due_on?: null | string;
    [k: string]: unknown;
  };
  active_lock_reason?: null | string;
  created_at?: null | string;
  updated_at?: null | string;
  closed_at?: null | string;
  merged_at?: null | string;
  merge_commit_sha?: null | string;
  assignee?: null | {
    login?: null | string;
    id?: null | number;
    node_id?: null | string;
    avatar_url?: null | string;
    gravatar_id?: null | string;
    url?: null | string;
    html_url?: null | string;
    followers_url?: null | string;
    following_url?: null | string;
    gists_url?: null | string;
    starred_url?: null | string;
    subscriptions_url?: null | string;
    organizations_url?: null | string;
    repos_url?: null | string;
    events_url?: null | string;
    received_events_url?: null | string;
    type?: null | string;
    site_admin?: null | boolean;
    [k: string]: unknown;
  };
  assignees?:
    | null
    | (null | {
        login?: null | string;
        id?: null | number;
        node_id?: null | string;
        avatar_url?: null | string;
        gravatar_id?: null | string;
        url?: null | string;
        html_url?: null | string;
        followers_url?: null | string;
        following_url?: null | string;
        gists_url?: null | string;
        starred_url?: null | string;
        subscriptions_url?: null | string;
        organizations_url?: null | string;
        repos_url?: null | string;
        events_url?: null | string;
        received_events_url?: null | string;
        type?: null | string;
        site_admin?: null | boolean;
        [k: string]: unknown;
      })[];
  requested_reviewers?:
    | null
    | (null | {
        login?: null | string;
        id?: null | number;
        node_id?: null | string;
        avatar_url?: null | string;
        gravatar_id?: null | string;
        url?: null | string;
        html_url?: null | string;
        followers_url?: null | string;
        following_url?: null | string;
        gists_url?: null | string;
        starred_url?: null | string;
        subscriptions_url?: null | string;
        organizations_url?: null | string;
        repos_url?: null | string;
        events_url?: null | string;
        received_events_url?: null | string;
        type?: null | string;
        site_admin?: null | boolean;
        [k: string]: unknown;
      })[];
  requested_teams?:
    | null
    | (null | {
        id?: null | number;
        node_id?: null | string;
        url?: null | string;
        html_url?: null | string;
        name?: null | string;
        slug?: null | string;
        description?: null | string;
        privacy?: null | string;
        permission?: null | string;
        members_url?: null | string;
        repositories_url?: null | string;
        parent?: null | {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      })[];
  head?: null | {
    label?: null | string;
    ref?: null | string;
    sha?: null | string;
    user_id?: null | number;
    repo_id?: null | number;
    [k: string]: unknown;
  };
  base?: null | {
    label?: null | string;
    ref?: null | string;
    sha?: null | string;
    user_id?: null | number;
    repo_id?: null | number;
    [k: string]: unknown;
  };
  _links?: null | {
    self?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    html?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    issue?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    comments?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    review_comments?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    review_comment?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    commits?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    statuses?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  author_association?: null | string;
  auto_merge?: null | {
    enabled_by?: null | {
      login?: null | string;
      id?: null | number;
      node_id?: null | string;
      avatar_url?: null | string;
      gravatar_id?: null | string;
      url?: null | string;
      html_url?: null | string;
      followers_url?: null | string;
      following_url?: null | string;
      gists_url?: null | string;
      starred_url?: null | string;
      subscriptions_url?: null | string;
      organizations_url?: null | string;
      repos_url?: null | string;
      events_url?: null | string;
      received_events_url?: null | string;
      type?: null | string;
      site_admin?: null | boolean;
      [k: string]: unknown;
    };
    commit_title?: null | string;
    merge_method?: null | string;
    commit_message?: null | string;
    [k: string]: unknown;
  };
  draft?: null | boolean;
  [k: string]: unknown;
}>;

export type GithubReviewEntityType = Entity<{
  repository?: string;
  id?: null | number;
  node_id?: null | string;
  user?: null | {
    login?: null | string;
    id?: null | number;
    node_id?: null | string;
    avatar_url?: null | string;
    gravatar_id?: null | string;
    url?: null | string;
    html_url?: null | string;
    followers_url?: null | string;
    following_url?: null | string;
    gists_url?: null | string;
    starred_url?: null | string;
    subscriptions_url?: null | string;
    organizations_url?: null | string;
    repos_url?: null | string;
    events_url?: null | string;
    received_events_url?: null | string;
    type?: null | string;
    site_admin?: null | boolean;
    [k: string]: unknown;
  };
  body?: null | string;
  state?: null | string;
  html_url?: null | string;
  pull_request_url?: null | string;
  _links?: null | {
    html?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    pull_request?: null | {
      href?: null | string;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  submitted_at?: null | string;
  pull_request_updated_at?: string;
  commit_id?: null | string;
  author_association?: null | string;
  [k: string]: unknown;
}>;

export type GithubIssueEventEntityType = Entity<{
  repository?: string;
  id?: null | number;
  node_id?: null | string;
  url?: null | string;
  actor?: null | {
    login?: null | string;
    id?: null | number;
    node_id?: null | string;
    avatar_url?: null | string;
    gravatar_id?: null | string;
    url?: null | string;
    html_url?: null | string;
    followers_url?: null | string;
    following_url?: null | string;
    gists_url?: null | string;
    starred_url?: null | string;
    subscriptions_url?: null | string;
    organizations_url?: null | string;
    repos_url?: null | string;
    events_url?: null | string;
    received_events_url?: null | string;
    type?: null | string;
    site_admin?: null | boolean;
    [k: string]: unknown;
  };
  event?: null | string;
  commit_id?: null | string;
  commit_url?: null | string;
  created_at?: null | string;
  issue?: null | {
    id?: null | number;
    node_id?: null | string;
    url?: null | string;
    repository_url?: null | string;
    labels_url?: null | string;
    comments_url?: null | string;
    events_url?: null | string;
    html_url?: null | string;
    number?: null | number;
    state?: null | string;
    title?: null | string;
    body?: null | string;
    user?: null | {
      login?: null | string;
      id?: null | number;
      node_id?: null | string;
      avatar_url?: null | string;
      gravatar_id?: null | string;
      url?: null | string;
      html_url?: null | string;
      followers_url?: null | string;
      following_url?: null | string;
      gists_url?: null | string;
      starred_url?: null | string;
      subscriptions_url?: null | string;
      organizations_url?: null | string;
      repos_url?: null | string;
      events_url?: null | string;
      received_events_url?: null | string;
      type?: null | string;
      site_admin?: null | boolean;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}>;
