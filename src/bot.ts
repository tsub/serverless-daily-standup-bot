import {
  App,
  ExpressReceiver,
  AuthorizeResult,
  AuthorizeSourceData,
  SlackActionMiddlewareArgs,
  DialogSubmitAction,
  directMention,
  Context
} from "@slack/bolt";
import * as WebApi from "seratch-slack-types/web-api";
import * as cron from "cron-parser";
import * as moment from "moment-timezone";
import { getWorkspace } from "./workspace";
import { slackSigningSecret, appName } from "./env";
import {
  Setting,
  getSetting,
  saveSetting,
  getSettingsByTeamID
} from "./setting";
import { Answer, getStandup, saveStandup } from "./standup";

const authorize: (
  _: AuthorizeSourceData
) => Promise<AuthorizeResult> = async function(source) {
  console.log(JSON.stringify(source));

  try {
    const workspace = await getWorkspace(source.teamId, source.userId);
    const usersInfoResponse: WebApi.UsersInfoResponse = await this.client.users.info(
      {
        token: workspace.botAccessToken,
        user: workspace.botUserID
      }
    );
    console.log(JSON.stringify(usersInfoResponse));

    return {
      botToken: workspace.botAccessToken,
      botId: usersInfoResponse.user.profile.bot_id,
      botUserId: workspace.botUserID,
      userToken: workspace.userAccessToken
    };
  } catch (err) {
    throw new Error(err);
  }
};

export const receiver: ExpressReceiver = new ExpressReceiver({
  signingSecret: slackSigningSecret,
  processBeforeResponse: true
});

export const botApp: App = new App({
  receiver: receiver,
  authorize: authorize,
  ignoreSelf: true
});

export const handleEvents: (_: App) => App = app => {
  app.message("hi", directMention(), async ({ message, say }) => {
    await say(`Hello, <@${message.user}>`);
  });

  app.command(`/${appName}`, async ({ payload, ack, say, context }) => {
    await ack();
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
                  hint:
                    "Please type multiple user IDs (not username) in multiple lines",
                  label: "Members",
                  name: "user_ids",
                  placeholder: `W012A3CDE
W034B4FGH`,
                  value: setting && setting.userIDs.join("\n")
                },
                {
                  type: "textarea",
                  hint: "Please type multiple questions in multiple lines",
                  label: "Questions",
                  name: "questions",
                  placeholder: `What did you do yesterday?
What will you do today?
Anything blocking your progress?`,
                  value: setting && setting.questions.join("\n")
                },
                {
                  type: "text",
                  hint: "Please type cron expression to start daily stand-up",
                  label: "Daily stand-up schedule",
                  name: "cron_expression",
                  placeholder: "0 1 * * MON-FRI",
                  value: setting && setting.cronExpression
                }
              ]
            }
            /* eslint-enable @typescript-eslint/camelcase */
          }
        );
        console.log(JSON.stringify(response));

        if (response.ok) {
          break;
        }

        console.error(response.error);
        break;
      default:
        await say("not support subcommand");
    }
  });

  app.action(
    /* eslint-disable @typescript-eslint/camelcase */
    { callback_id: "setting" },
    /* eslint-enable @typescript-eslint/camelcase */
    async ({
      ack,
      respond,
      payload,
      context
    }: SlackActionMiddlewareArgs<DialogSubmitAction> & {
      context: Context;
    }) => {
      if (payload.type !== "dialog_submission") {
        await ack();
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
      const teamID = payload.team.id;
      const channelID = payload.channel.id;

      const errors = [];

      let nextExecutionDate, nextExecutionTimestamp;
      try {
        const schedule = cron.parseExpression(cronExpression, { utc: true });
        const date = schedule.next().toDate();
        nextExecutionDate = moment(date).format("YYYY-MM-DD");
        nextExecutionTimestamp = moment(date)
          .unix()
          .toString();
      } catch (err) {
        errors.push({
          name: "cron_expression",
          error: "Invalid cron expression."
        });
      }

      const existSettings = await getSettingsByTeamID(teamID);
      const isNotSelf: (_: Setting) => boolean = setting =>
        setting.channelID !== channelID;

      for (const userID of userIDs) {
        try {
          await app.client.users.info({
            token: context.botToken,
            user: userID
          });
        } catch (err) {
          console.log(err);
          errors.push({
            name: "user_ids",
            error: `${userID} not exists in your workspace.`
          });
          continue;
        }

        const includeUserID: (_: Setting) => boolean = setting =>
          setting.userIDs.includes(userID);

        if (existSettings.filter(isNotSelf).some(includeUserID)) {
          errors.push({
            name: "user_ids",
            error: `${userID} is already joined in ${channelID} meeting.`
          });
          continue;
        }
      }

      if (errors.length > 0) {
        await ack({ errors });
        return;
      }

      await saveSetting({
        teamID: teamID,
        channelID: channelID,
        userIDs: userIDs,
        questions: questions,
        cronExpression: cronExpression,
        nextExecutionDate: nextExecutionDate,
        nextExecutionTimestamp: nextExecutionTimestamp
      } as Setting);

      await ack();
      /* eslint-disable @typescript-eslint/camelcase */
      await respond({
        text: "settings succeeded",
        response_type: "in_channel"
      });
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

        if (answer.text === "cancel") {
          standup.answers = standup.questions.map(
            () => ({ text: "none" } as Answer)
          );
        } else {
          standup.answers.push(answer);
        }
        await saveStandup(standup);

        break;
      case "message_changed":
        if (standup.answers.every(answer => answer.text === "none")) {
          break;
        }

        standup.answers.forEach((_, i) => {
          if (
            standup.answers[i].postedAt &&
            standup.answers[i].postedAt === answer.postedAt
          ) {
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

  app.error(async error => {
    console.error(error);
  });

  return app;
};
