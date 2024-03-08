# Setting up a Google client

## Prerequisites

A [Google Cloud](https://cloud.google.com/) account with a project to use for the client (e.g. "HASH App").

## Setup

1. Go to the [APIs and services](https://console.cloud.google.com/apis/dashboard) dashboard.
1. Enable the following APIs:
   - Google Picker API
   - Google Sheets API
1. Under 'Credentials', click 'Create Credentials' and create a new OAuth Client:
   - Give it a name
   - Set which origins are allowed to use the client (where the frontend will be hosted)
   - Make a note of the **client id\*\***
   - Create a **client secret** and make a note of its value
1. Under 'OAuth consent screen', click 'Edit App':
   - Set the user support email, logo, required URLs
   - Click 'save and continue' and set the non-sensitive scopes:
     - `https://www.googleapis.com/auth/drive.file`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
     - `openid`
   - Save and continue – you're done.

## Usage

The following environment variables must be set: - `GOOGLE_OAUTH_CLIENT_ID`: in both the frontend and Node API - `GOOGLE_OAUTH_CLIENT_SECRET`: in the Node API only
