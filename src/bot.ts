import {
  App,
  ExpressReceiver,
  AuthorizeResult,
  AuthorizeSourceData,
  SlackActionMiddlewareArgs,
  DialogSubmitAction,
  directMention
} from "@slack/bolt";
import * as WebApi from "seratch-slack-types/web-api";
import * as cron from "cron-parser";
import * as moment from "moment-timezone";
import { getWorkspace } from "./workspace";
import { slackSigningSecret, appName } from "./env";
import { Setting, getSetting, saveSetting } from "./setting";
import { Answer, getStandup, saveStandup } from "./standup";

const authorize: (
  _: AuthorizeSourceData
) => Promise<AuthorizeResult> = async function(source) {
  console.log(JSON.stringify(source));

  try {
    const workspace = await getWorkspace(source.teamId, source.userId);
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
  app.message("hi", directMention(), ({ message, say }) => {
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
                  hint: "Cron expression",
                  label: "Execution schedule",
                  name: "cron_expression",
                  placeholder: "0 1 * * MON-FRI",
                  value: setting && setting.cronExpression
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

      if (payload.type !== "dialog_submission") {
        return;
      }

      console.log(JSON.stringify(payload));

      const userIDs = payload.submission.user_ids
        .split("\n")
        .map(userID => userID.trim())
        .filter(userID => userID !== "");
      const questions = payload.submission.questions
        .split("\n")
        .map(question => question.trim())
        .filter(question => question !== "");
      const cronExpression = payload.submission.cron_expression;
      const schedule = cron.parseExpression(cronExpression, { utc: true });
      const date = schedule.next().toDate();
      const nextExecutionDate = moment(date).format("YYYY-MM-DD");
      const nextExecutionTimestamp = moment(date)
        .unix()
        .toString();

      await saveSetting({
        teamID: payload.team.id,
        channelID: payload.channel.id,
        userIDs: userIDs,
        questions: questions,
        cronExpression: cronExpression,
        nextExecutionDate: nextExecutionDate,
        nextExecutionTimestamp: nextExecutionTimestamp
      } as Setting);

      /* eslint-disable @typescript-eslint/camelcase */
      respond({ text: "settings succeeded", response_type: "in_channel" });
      /* eslint-enable @typescript-eslint/camelcase */
    }
  );

  app.event("message", async ({ payload, context }) => {
    if (payload.channel_type !== "im") {
      return;
    }
    console.log(JSON.stringify(payload));

    let user, team: string;
    let answer: Answer;
    switch (payload.subtype) {
      case undefined: // new message
        user = payload.user;
        team = payload.team;
        answer = {
          text: payload.text,
          postedAt: payload.ts
        } as Answer;

        break;
      case "message_changed":
        user = payload.message.user;
        team = payload.message.team;
        answer = {
          text: payload.message.text,
          postedAt: payload.message.ts
        } as Answer;

        break;
      default:
        console.log(`unsupported message subtype: ${payload.subtype}`);
        return;
    }

    console.log(`user: ${user}`);
    console.log(`team: ${team}`);
    console.log(`answer: ${JSON.stringify(answer)}`);

    const usersInfoResponse: WebApi.UsersInfoResponse = await app.client.users.info(
      {
        token: context.userToken,
        user: user
      }
    );
    const currentDate = moment()
      .tz(usersInfoResponse.user.tz)
      .format("YYYY-MM-DD");

    const standup = await getStandup(team, user, currentDate);
    console.log(JSON.stringify(standup));

    switch (payload.subtype) {
      case undefined: // new message
        if (standup.answers.length >= standup.questions.length) {
          // Skip if already finished
          return;
        }

        standup.answers.push(answer);
        await saveStandup(standup);

        break;
      case "message_changed":
        standup.answers.forEach((_, i) => {
          if (standup.answers[i].postedAt === answer.postedAt) {
            standup.answers[i].text = answer.text;
          }
        });
        await saveStandup(standup);

        break;
      default:
        console.log(`unsupported message subtype: ${payload.subtype}`);
        return;
    }
  });

  app.error(error => {
    console.error(error);
  });

  return app;
};