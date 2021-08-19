import { GraphQLClient } from "graphql-request";

import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateOrgMutation,
  CreateOrgMutationVariables,
  CreatePageMutation,
  CreatePageMutationVariables,
  CreateUserMutation,
  CreateUserMutationVariables,
  InsertBlocksIntoPageMutation,
  InsertBlocksIntoPageMutationVariables,
} from "../graphql/apiTypes.gen";
import { createEntity } from "../graphql/queries/entity.queries";
import { createUser } from "../graphql/queries/user.queries";
import { createOrg } from "../graphql/queries/org.queries";
import {
  createPage,
  insertBlocksIntoPage,
} from "../graphql/queries/page.queries";

export class ApiClient {
  private client: GraphQLClient;

  constructor(url: string) {
    this.client = new GraphQLClient(url);
  }

  async createEntity(vars: CreateEntityMutationVariables) {
    return (
      await this.client.request<
        CreateEntityMutation,
        CreateEntityMutationVariables
      >(createEntity, vars)
    ).createEntity;
  }

  async createUser(vars: CreateUserMutationVariables) {
    return (
      await this.client.request<
        CreateUserMutation,
        CreateUserMutationVariables
      >(createUser, vars)
    ).createUser;
  }

  async createOrg(vars: CreateOrgMutationVariables) {
    return (
      await this.client.request<CreateOrgMutation, CreateOrgMutationVariables>(
        createOrg,
        vars
      )
    ).createOrg;
  }

  async createPage(vars: CreatePageMutationVariables) {
    return (
      await this.client.request<
        CreatePageMutation,
        CreatePageMutationVariables
      >(createPage, vars)
    ).createPage;
  }

  async insertBlocksIntoPage(vars: InsertBlocksIntoPageMutationVariables) {
    return (
      await this.client.request<
        InsertBlocksIntoPageMutation,
        InsertBlocksIntoPageMutationVariables
      >(insertBlocksIntoPage, vars)
    ).insertBlocksIntoPage;
  }
}
