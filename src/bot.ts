import {
  App,
  ExpressReceiver,
  AuthorizeResult,
  AuthorizeSourceData,
  SlackActionMiddlewareArgs,
  DialogSubmitAction
} from "@slack/bolt";
import * as WebApi from "seratch-slack-types/web-api";
import { getWorkspace } from "./workspace";
import { slackSigningSecret, appName } from "./env";
import { setting, getSetting, saveSetting } from "./setting";

const authorize: (
  _: AuthorizeSourceData
) => Promise<AuthorizeResult> = async function(source) {
  console.log(JSON.stringify(source));

  try {
    const workspace = await getWorkspace(source);
    const authTestResult: WebApi.AuthTestResponse = await this.client.auth.test(
      {
        token: workspace.botAccessToken
      }
    );

    console.log(JSON.stringify(authTestResult));

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

  app.command(`/${appName}`, async ({ payload, ack, say, context }) => {
    ack();
    console.log(JSON.stringify(payload));

    switch (payload.text) {
      case "setting":
        const setting = await getSetting(payload.team_id, payload.channel_id);

        const response: WebApi.DialogOpenResponse = await app.client.dialog.open(
          {
            /* eslint-disable @typescript-eslint/camelcase */
            token: context.botToken,
            trigger_id: payload.trigger_id,
            dialog: {
              callback_id: "setting",
              title: `Setting for #${payload.channel_name}`,
              elements: [
                {
                  type: "textarea",
                  hint: "Please type user ID (not username)",
                  label: "Members",
                  name: "user_ids",
                  placeholder: `W012A3CDE
W034B4FGH`,
                  value: setting && setting.userIDs.join("\n")
                },
                {
                  type: "textarea",
                  hint: "Please write multiple questions in multiple lines",
                  label: "Questions",
                  name: "questions",
                  placeholder: `What did you do yesterday?
What will you do today?
Anything blocking your progress?`,
                  value: setting && setting.questions.join("\n")
                },
                {
                  type: "text",
                  hint:
                    "https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html",
                  label: "Execution schedule",
                  name: "schedule_expression",
                  placeholder: "cron(0 1 ? * MON-FRI *)",
                  value: setting && setting.scheduleExpression
                }
              ]
            }
            /* eslint-enable @typescript-eslint/camelcase */
          }
        );

        if (response.ok) {
          break;
        }

        console.error(response.error);
        break;
      default:
        say("not support subcommand");
    }
  });

  app.action(
    /* eslint-disable @typescript-eslint/camelcase */
    { callback_id: "setting" },
    /* eslint-enable @typescript-eslint/camelcase */
    async ({
      ack,
      respond,
      payload
    }: SlackActionMiddlewareArgs<DialogSubmitAction>) => {
      ack();
      console.log(JSON.stringify(payload));

      const userIDs = payload.submission.user_ids
        .split("\n")
        .map(userID => userID.trim())
        .filter(userID => userID !== "");
      const questions = payload.submission.questions
        .split("\n")
        .map(question => question.trim())
        .filter(question => question !== "");

      await saveSetting({
        teamID: payload.team.id,
        channelID: payload.channel.id,
        userIDs: userIDs,
        questions: questions,
        scheduleExpression: payload.submission.schedule_expression
      } as setting);

      /* eslint-disable @typescript-eslint/camelcase */
      respond({ text: "settings succeeded", response_type: "in_channel" });
      /* eslint-enable @typescript-eslint/camelcase */
    }
  );

  app.error(error => {
    console.error(error);
  });

  return app;
};
