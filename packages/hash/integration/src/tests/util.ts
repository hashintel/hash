import { print } from "graphql/language/printer";
import { GraphQLClient } from "graphql-request";

import {
  SendLoginCodeMutation,
  SendLoginCodeMutationVariables,
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
  LoginWithLoginCodeMutationVariables,
  LoginWithLoginCodeMutation,
} from "../graphql/apiTypes.gen";
import { createEntity } from "../graphql/queries/entity.queries";
import { createOrg } from "../graphql/queries/org.queries";
import {
  createUser,
  loginWithLoginCode,
  sendLoginCode,
} from "../graphql/queries/user.queries";
import {
  createPage,
  insertBlocksIntoPage,
} from "../graphql/queries/page.queries";

export class ApiClient {
  private client: GraphQLClient;

  constructor(url: string) {
    this.client = new GraphQLClient(url);
  }

  setCookie = (cookie: string) => this.client.setHeader("Cookie", cookie);

  removeCookie = () => this.client.setHeader("Cookie", "");

  async sendLoginCode(vars: SendLoginCodeMutationVariables) {
    return (
      await this.client.request<
        SendLoginCodeMutation,
        SendLoginCodeMutationVariables
      >(sendLoginCode, vars)
    ).sendLoginCode;
  }

  async loginWithLoginCode(vars: LoginWithLoginCodeMutationVariables) {
    const { data, headers } = await this.client.rawRequest<
      LoginWithLoginCodeMutation,
      LoginWithLoginCodeMutationVariables
    >(print(loginWithLoginCode), vars);

    if (!data) {
      throw new Error("loginWithLoginCode mutation did not return data");
    }

    return { user: data.loginWithLoginCode, responseHeaders: headers };
  }

  async createEntity(vars: CreateEntityMutationVariables) {
    return (
      await this.client.request<
        CreateEntityMutation,
        CreateEntityMutationVariables
      >(createEntity, vars)
    ).createEntity;
  }

  async createOrg(vars: CreateOrgMutationVariables) {
    return (
      await this.client.request<CreateOrgMutation, CreateOrgMutationVariables>(
        createOrg,
        vars
      )
    ).createOrg;
  }

  async createUser(vars: CreateUserMutationVariables) {
    return (
      await this.client.request<
        CreateUserMutation,
        CreateUserMutationVariables
      >(createUser, vars)
    ).createUser;
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
