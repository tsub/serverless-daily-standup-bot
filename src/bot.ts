import {
  App,
  ExpressReceiver,
  AuthorizeResult,
  AuthorizeSourceData
} from "@slack/bolt";
import { getWorkspace } from "./workspace";
import { slackSigningSecret } from "./env";

const authorize: (
  _: AuthorizeSourceData
) => Promise<AuthorizeResult> = async function(source) {
  console.log(source);

  try {
    const workspace = await getWorkspace(source);
    const authTestResult = await this.client.auth.test({
      token: workspace.botAccessToken
    });

    console.log(authTestResult);

    return {
      botToken: workspace.botAccessToken,
      botId: authTestResult.user_id,
      botUserId: workspace.botUserID,
      userToken: workspace.userAccessToken
    };
  } catch (err) {
    throw new Error(err);
  }
};

export const expressReceiver: ExpressReceiver = new ExpressReceiver({
  signingSecret: slackSigningSecret
});

export const botApp: App = new App({
  receiver: expressReceiver,
  authorize: authorize
});

export const handleEvents: (_: App) => App = app => {
  app.message("hi", async ({ message, say }) => {
    say(`Hello, <@${message.user}>`);
  });

  app.error(error => {
    console.error(error);
  });

  return app;
};
