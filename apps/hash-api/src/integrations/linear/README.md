# Testing the integration

You need to create or edit an application in 'Linear -> Settings -> API'.

Take the following for environment variables for the Node API:

1. Client ID -> `LINEAR_CLIENT_ID`
2. Client secret -> `LINEAR_CLIENT_SECRET`
3. Webhooks / Signing secret -> `LINEAR_WEBHOOK_SECRET`

# Testing the webhook

1. sign up for ngrok (free tier is sufficient), then 'Create edge'. Make a note of the (1) domain and (2) id for your edge
2. install the ngrok CLI.
3. run `ngrok tunnel --label edge=[your_edge_id] http://localhost:5001`

Set the webhook URL in your Linear application to `[your-ngrok-domain]/webhooks/linear`

Visit `[your-ngrok-domain]` to confirm that the tunnel is working correctly (output should be same as visiting the Node API at `http://localhost:5001`)
