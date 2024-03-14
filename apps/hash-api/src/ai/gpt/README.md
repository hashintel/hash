# HashGPT

This folder contains functions which support the use of HASH as an external datastore for a custom GPT called HashGPT.

## Development

### Fresh local instance setup

Every time the local database is wiped, your locally-running Hydra will have no registered OAuth2 clients.

To create one, log in to the local HASH frontend as an admin (`admin@example.com`), and run the following in the browser console:

```javascript
fetch("http://localhost:5001/gpt/upsert-gpt-oauth-client", {
  credentials: "include",
  headers: {
    "content-type": "application/json",
  },
  method: "POST",
  body: JSON.stringify({ redirectUri: "https://chat.openai.com" }),
});
```

The redirect URI must start with https://chat.openai.com but the rest does not matter at this point because the GPT will have a new one generated as soon as you set the client details in OpenAI.

The response will include a client id and client secret which you will need to set the OAuth values in the development GPT, in OpenAI.

The other values you will need to update in OpenAI's config are:

- The Authorization URL and Token URL – see [Testing the GPT](#testing-the-gpt)
- If creating a new action, the OAuth Scope should be `read` and the Token Exchange Method should be `Basic`
- from the root edit screen, the action schema should be updated to use the tunnel to your local machine (see [Testing the GPT](#testing-the-gpt))

If creating a new GPT, once you have created an action and given it some OAuth values, the Callback (redirect) URL will appear in the GPT's root edit screen.

### Iteration

Developing HashGPT involves making changes in two places:

1. The custom GPT via [the OpenAI interface](https://chat.openai.com) – here you can edit the GPT's instructions and available actions.
1. The endpoints available to the GPT to call, in this folder.

Any change in one place will likely involve a change in the other – **note particularly the following**:

### Keeping the OAuth2 Redirect URI up to date

Making almost any change or clicking 'save' in the OpenAI interface will generate a new OAuth2 redirect URI, listed as 'Callback URL' in the GPT's edit screen ([relevant OpenAI discussion post](https://community.openai.com/t/gpt-oauth-callback-url-keeps-changing/493236)) – this can be found in the root screen, not the edit screen for the action. **You must set some OAuth2 values in an action before this will appear**.

**The OAuth2 client in HASH must be updated with this new URI before new OAuth2 consent flows will work**.

To do so, log in to the HASH frontend as an admin, and run this in the browser console (or however you want to send the request, including your cookie):

```javascript
const redirectUri = "https://chat.openai.com/aip/[DYNAMIC_ID]/oauth/callback";

fetch("http://localhost:5001/gpt/upsert-gpt-oauth-client", {
  credentials: "include",
  headers: {
    "content-type": "application/json",
  },
  method: "POST",
  body: JSON.stringify({ redirectUri }),
});
```

For example, to update the GPT's instructions, you would do the following:

1. Edit the instructions in the OpenAI interface
1. Click 'Save'
1. Copy the new redirect URI ("Callback URL" in the edit interface)
1. Follow the above steps to update the OAuth2 client in HASH

_Existing_ OAuth2 tokens will continue to work, because the redirect URI is only used as part of the initial consent flow.
So you can skip updating the redirect URI if you are iterating on the GPT locally, until you need to test a new OAuth2 flow.

Note that the convenience endpoint the snippet above uses depends on finding a client named HashGPT, and gives it a default scope.
Do not use this endpoint if you have manually created a different OAuth2 client in Hydra with a different name or other configuration values.

### Keeping the GPT's action schema(s) up to date

An 'action' is an ability for the GPT to call an external API. An action can cover multiple endpoints in the same API host.

The action's definition includes an OpenAPI schema for the endpoints, which is generated from the endpoints in this folder.
If you edit the endpoints, you will need to

1. Regenerate the schema: `yarn workspace @apps/hash-api generate-hash-gpt-schema`
1. Edit the action in the OpenAI interface, with the new schema – updating the `servers.url` field with the host you are testing
1. Follow the steps above to update the OAuth2 client in HASH with the GPT's redirect URI, which will have changed after step 2

When pasting in the new schema, you may see the following error:

```shell
Action sets cannot have duplicate domains [etc]
```

Assuming you have not in fact created a second action, just ignore this error and click 'Save' and go back. It will take effect.

#### New endpoints

If you add **new** endpoints, you must edit the generation script to include them in the schema.

Note that:

1. any internal `$ref` links in the schema must point to `components.schemas` (see existing examples of moving the definitions in the generation script) – they cannot point to definitions elsewhere in the JSON.
1. at the time of writing (Feb 2023) OpenAI does not support circular references in the schema.

### Choosing where to iterate

The GPT's behavior can be influenced in two key ways:

1. Via its `Instructions` in the OpenAI interface
1. Via the descriptions in the action schema

If we want to change how a specific endpoint is used or understood by the GPT, default to updating the action schema.
This has the advantage of being committed and version controlled, versus the OpenAI interface which is not (at least publicly).

## Testing the GPT

### Exposing the API to the internet

The OAuth2 and API endpoints relied on by the GPT must be accessible over the public internet, since they are being called from https://chat.openai.com. Since we proxy Hydra's OAuth2 endpoints via the Node API, in practice this means exposing the Node API.

One way of exposing a locally-running API to the internet is via [ngrok](https://ngrok.com/). This is a tool which creates a secure tunnel to your localhost, and provides a public URL which can be used to access it:

1. sign up for ngrok (free tier is sufficient), then ‘Create edge’. Make a note of the (1) domain and (2) id for your edge
1. install the ngrok CLI.
1. run `ngrok tunnel --label edge=[your_edge_id] http://localhost:5001`

The **domain** for your edge should be used for the following values in the GPT:

1. `servers.url` in the action schema
1. in the OAuth configuration for the action:
   - Authorization URL: `[domain]/oauth2/auth`
   - Token URL: `[domain]/oauth2/token`

Remember that updating OAuth2 settings in the GPT will regenerate the redirect URI, which must then be updated in HASH as described above.

The scope should be `read` in the OAuth config unless you are adding scopes, which the OAuth2 client in Hydra must also be updated to allow.

The 'Token Exchange Method' should be `Basic`, unless you manually create the OAuth2 client in Hydra and set it to send credentials in the body (but [this is not recommended](https://datatracker.ietf.org/doc/html/rfc6749#section-2.3.1)).

### Authenticating with OAuth2

The OAuth2 flow requires using the same domain throughout the flow through the Node API and frontend.
This is because a CSRF cookie will be set in response to the initial request to `/oauth2/auth` which must then be passed in the subsequent calls to Kratos and Hydra.

In practice this means that **the OAuth2 flow cannot be completed when the entry point is the ngrok tunnel**, because the frontend is on a different domain. Instead, to successfully authenticate with a locally-running app do the following:

1. Open DevTools and ensure you are recording network requests
1. Trigger the OAuth2 flow from the GPT – when viewing an action you can click 'Test' against any endpoint to do so
1. You should end up on the frontend login screen – **don't bother to log in**. From here:
   1. Clear your `localhost` cookies (they will interfere with subsequent steps otherwise)
   1. From the network request log, copy the path that GPT directed you to, i.e. `[your-tunnel-domain]/[path]`. It will start with `/oauth2/auth` and contain query params.
1. Now visit `http://localhost:5001/[path]` in your browser. You should be successfully sent through the OAuth2 flow (login, grant consent) and back to the GPT.

Once you have completed the OAuth2 flow, the GPT will have an access token which it can use to make authenticated requests to the HASH API.

#### Scopes

The scopes listed in the OAuth2 configuration must make scopes available to the client in Hydra.
Currently this is simply `read` – different or more granular scopes will involve updating both the GPT's OAuth2 configuration, and the corresponding OAuth2 client configuration in Hydra.

### Using the GPT

The GPT can be used in two modes:

1. Having clicked to 'Edit GPT', you will be in a 'Preview' mode which provides debug information about the API calls the GPT is making, and also allows you to manually trigger specific endpoints by clicking on the action and then clicking 'Test' against an endpoint
1. The normal mode reached by simply clicking on the GPT's name in the ChatGPT sidebar. This will show the calls being made but not the responses.

## Deployment

Because changes are made in the OpenAI interface and are reflected immediately, the only 'deployment' to consider
is ensuring that any changes made to the HashGPT-Dev GPT are then reflected into the production HashGPT.

This will be a manual process of copying over the latest instructions and action schema, and saving.

Remember that doing so will generate a new OAuth2 redirect URI, which must then be updated in HASH as described above.

## Troubleshooting

When an OAuth2 flow fails to complete, check the series of network requests to the Node API, frontend, and redirect to the client.
There will be body content or query parameters which give some clue as to what's gone wrong.
Failing that, check the container logs in Hydra and Kratos.

- **You end up on a `[something]/undefined` URL in openai.com or are kicked back to ChatGPT without ever reaching an OAuth endpoint**: try going into edit mode in the GPT and clicking 'save', then trying again. If this fails you will need to set the OAuth2 client id and secret values again in the GPT, and click save, **and then update the redirect URI again in HASH since it will have changed**. If you have lost the client secret, delete the OAuth2 client in Hydra and recreate it via the `/upsert-gpt-oauth-client` endpoint in HASH (this endpoint will return the client id and secret for new clients). This issue seems to be something to do with the OAuth values being lost in the GPT's configuration.
- **You end up on a Hydra error screen that contains reference to a redirect_uri not being registered**: the GPT's redirect_uri / Callback URL has changed and must be updated in HASH as described above.
- **After logging in as part of the OAuth2 flow, you are just send to the HASH app homepage**: you probably didn't clear your cookies for `localhost` before visiting `localhost:5001/oauth2/auth?params`. Clear them and visit it again.
- **Creating or updating a custom GPT fails in OpenAI**: a circular dependency in an action's JSON schema can cause this. Otherwise try deleting and recreating the action.
- **Kratos or Hydra complain about missing CSRF cookies / tokens**: the auth endpoint and frontend are running on different domains – ensure you're using `localhost` throughout ([see above](#authenticating-with-oauth2))
- **Sent back to OpenAI with invalid or not found state**: possibly you are trying to reuse a flow that is too old, or already used. Start again by triggering sign-in from HashGPT.
- **Hydra doesn't recognise the OAuth2 client**: check `hydra list clients` in the container to confirm the id and redirect URI match those shown in OpenAI. Try inputting all the OAuth2 values again in the GPT and saving. If all fails recreate the action.

### Using the Hydra CLI

Sometimes it is helpful to inspect the registered OAuth2 clients in Hydra, or to create new ones if creating a new GPT or attempting to fix a broken one.

Locally, you can use the Hydra CLI via the Hydra Docker container's terminal:

```bash
# do this once per terminal session to configure the host the CLI will contact
export ORY_SDK_URL=http://localhost:4445

# list all clients
hydra clients list

# create a client
hydra clients create --redirect-uri=[uri] --name=HashGPT --scope=read --grant-type=authorization_code,refresh_token

# update a client – ALL fields must be provided, even if they are not changing
hydra clients update [client_id] --redirect-uri=[uri] --name=[name] --scope=[scope]
```
