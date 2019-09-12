# serverless-daily-standup-bot

A Slack App for asynchronous daily stand-up meeting.

## How to use

TODO

## Development

### Requirements

- [Node.js](https://nodejs.org/)
- [direnv](https://github.com/direnv/direnv)
- [ngrok](https://ngrok.com/)
- [Docker](https://www.docker.com/)
- [docker-compose](https://docs.docker.com/compose/)

### Create a Slack App

- [Create a Slack App in here](https://api.slack.com/apps)
- Use these information in "App Credentials" (https://api.slack.com/apps/{apiAppId}/general)
    - Client ID
    - Client Secret
    - Signing Secret

### Setup environment variables

```bash
$ cp .env.skeleton .env.dev

# Fill-in environment variables
$ vim .env.dev

$ echo "dotenv .env.dev" > .envrc
$ direnv allow
```

### Setup local server

```bash
$ npm i
$ npm start
```

### Run ngrok proxy on your local machine

In another terminal window

```bash
$ ngrok http 3000
```

### Configure a Slack App

- Configure OAuth settings (https://api.slack.com/apps/{apiAppId}/oauth)
    - Redirect URL: `https://{ngrok domain}/slack/oauth/callback`
    - Scopes:
        - `bot`
        - `chat:write:bot`
        - `commands`
        - `users.profile:read`
- Add a Slash Command (https://api.slack.com/apps/{apiAppId}/slash-commands)
    - `/daily-standup-bot` command
    - Request URL: `https://{ngrok domain}/slack/events`
- Add a Bot user (https://api.slack.com/apps/{apiAppId}/bots)
    - Enable `bot` permission and add a bot user
- Enable Interactive Components (https://api.slack.com/apps/{apiAppId}/interactive-messages)
    - Request URL: `https://{ngrok domain}/slack/events`
- Enable Event Subscriptions (https://api.slack.com/apps/{apiAppId}/event-subscriptions)
    - Request URL: `https://{ngrok domain}/slack/events`
    - Subscribe to Bot Events:
        - `app_metion`
        - `message.im`
