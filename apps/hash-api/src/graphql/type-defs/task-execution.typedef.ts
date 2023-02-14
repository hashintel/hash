import { gql } from "apollo-server-express";

export const executeTaskTypedef = gql`
  input GithubCredentials {
    """
    GitHub Personal Access Token
    """
    personal_access_token: String!
  }
  input GithubTaskConfig {
    """
    A space-separated list of GitHub Repositories, e.g. 'blockprotocol/blockprotocol hashintel/hash'
    """
    repository: String!
    """
    The date from which you'd like to replicate data from GitHub in the format YYYY-MM-DDT00:00:00Z.
    For the streams which support this configuration, only data generated on or after the start date will be replicated.
    This field doesn't apply to all streams
    """
    start_date: String!
    credentials: GithubCredentials!
  }

  input AsanaCredentials {
    """
    Asana Personal Access Token
    """
    personal_access_token: String!
  }
  input AsanaTaskConfig {
    credentials: AsanaCredentials!
  }

  extend type Mutation {
    """
    Execute the Demo Task
    """
    executeDemoTask: String!

    """
    Call the GitHub Integration Spec Task
    """
    executeGithubSpecTask: String!
    """
    Call the GitHub Integration Check Task
    """
    executeGithubCheckTask(config: GithubTaskConfig!): String!
    """
    Call the GitHub Integration Discover Task
    """
    executeGithubDiscoverTask(config: GithubTaskConfig!): String!
    """
    Call the GitHub Integration Read Task
    """
    executeGithubReadTask(config: GithubTaskConfig!): String!

    """
    Call the Asana Integration Spec Task
    """
    executeAsanaSpecTask: String!
    """
    Call the Asana Integration Check Task
    """
    executeAsanaCheckTask(config: AsanaTaskConfig!): String!
    """
    Call the Asana Integration Discover Task
    """
    executeAsanaDiscoverTask(config: AsanaTaskConfig!): String!
    """
    Call the Asana Integration Read Task
    """
    executeAsanaReadTask(config: AsanaTaskConfig!): String!
  }
`;
