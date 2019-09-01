export const slackAuthorizationURL = "https://slack.com/oauth/authorize";
export const slackTokenURL = "https://slack.com/api/oauth.access";
export const slackAuthorizationScope = [
  "bot",
  "chat:write:bot",
  "users.profile:read"
].join(" ");
