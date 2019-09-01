import { expressReceiver } from "./bot";
import { routes } from "./server";
import { sqsStartQueue, sqsEndpoint } from "./env";
import serverless = require("serverless-http");
import {
  ScheduledHandler,
  SQSHandler,
  DynamoDBStreamHandler
} from "aws-lambda";
import {
  Setting,
  getSettingsByNextExecutionTimestamp,
  updateNextExecutionTimestamp
} from "./setting";
import { Standup, saveStandup, getStandup } from "./standup";
import * as moment from "moment-timezone";
import * as AWS from "aws-sdk";
import { getWorkspace } from "./workspace";
import { WebClient } from "@slack/web-api";
import * as WebApi from "seratch-slack-types/web-api";

export const app = serverless(routes(expressReceiver.app));

export const scheduler: ScheduledHandler = async (
  _event,
  _context,
  callback
) => {
  const date = moment();
  const currentDate = date.format("YYYY-MM-DD");
  const currentTimestamp = date.unix().toString();
  const settings = await getSettingsByNextExecutionTimestamp(
    currentDate,
    currentTimestamp
  );
  const sts = new AWS.STS();
  const sqs = new AWS.SQS({ endpoint: sqsEndpoint });
  const getCallerIdentityResponse = await sts.getCallerIdentity().promise();
  const queueUrlResponse = await sqs
    .getQueueUrl({
      QueueName: sqsStartQueue,
      QueueOwnerAWSAccountId: getCallerIdentityResponse.Account
    })
    .promise();

  const promises = settings.map(setting => {
    console.log(JSON.stringify(setting));

    const sendMessagePromise = sqs
      .sendMessage({
        MessageBody: JSON.stringify(setting),
        QueueUrl: queueUrlResponse.QueueUrl
      })
      .promise();

    const updateNextExecutionTimestampPromise = updateNextExecutionTimestamp(
      setting
    );

    return [sendMessagePromise, updateNextExecutionTimestampPromise];
  });

  try {
    const responses = await Promise.all([].concat(...promises));
    console.log(JSON.stringify(responses));
    return callback(null);
  } catch (err) {
    return callback(err);
  }
};

export const start: SQSHandler = async (event, _, callback) => {
  console.log(JSON.stringify(event));

  const promises = [];
  for (const record of event.Records) {
    const setting = JSON.parse(record.body) as Setting;

    for (const userID of setting.userIDs) {
      const workspace = await getWorkspace(setting.teamID, userID);
      const slackClient = new WebClient(workspace.userAccessToken);

      const usersInfoResponse: WebApi.UsersInfoResponse = await slackClient.users.info(
        { user: userID }
      );

      const currentDate = moment()
        .tz(usersInfoResponse.user.tz)
        .format("YYYY-MM-DD");

      const existStandup = await getStandup(
        setting.teamID,
        userID,
        currentDate
      );

      if (existStandup !== undefined) {
        return;
      }

      const questions = setting.questions.map(question => ({
        text: question
      }));

      const standup = {
        teamID: setting.teamID,
        targetChannelID: setting.channelID,
        userID: userID,
        questions: questions,
        answers: [],
        date: currentDate
      } as Standup;

      promises.push(saveStandup(standup));
    }
  }
  await Promise.all(promises);

  return callback(null);
};

export const standup: DynamoDBStreamHandler = async (event, _, callback) => {
  console.log(JSON.stringify(event));

  for (const record of event.Records) {
    if (record.eventName === "REMOVE") {
      continue;
    }

    const questions = record.dynamodb.NewImage.questions.L.map(question => ({
      text: question.M.text.S,
      postedAt: question.M.postedAt && question.M.postedAt.S
    }));
    const answers = record.dynamodb.NewImage.answers.L.map(answer => ({
      text: answer.M.text.S,
      postedAt: answer.M.postedAt && answer.M.postedAt.S
    }));
    const identifier = record.dynamodb.Keys.identifier.S;
    const [teamID, userID] = identifier.split(".");
    const standup = {
      identifier: identifier,
      date: record.dynamodb.Keys.date.S,
      questions: questions,
      answers: answers,
      finishedAt:
        record.dynamodb.NewImage.finishedAt &&
        record.dynamodb.NewImage.finishedAt.S,
      teamID: teamID,
      targetChannelID: record.dynamodb.NewImage.targetChannelID.S,
      userID: userID
    } as Standup;

    const workspace = await getWorkspace(teamID, userID);
    const slackClient = new WebClient();

    if (questions.length - answers.length > 0) {
      // Send a next question if haven't answered all questions yet
      const nextQuestionIndex = answers.length;
      const nextQuestion = questions[nextQuestionIndex];

      console.log(nextQuestion);

      if (nextQuestion.postedAt !== undefined) {
        // Skip if already send a next question
        continue;
      }

      const postMessageResponse: WebApi.ChatPostMessageResponse = await slackClient.chat.postMessage(
        /* eslint-disable @typescript-eslint/camelcase */
        {
          token: workspace.botAccessToken,
          channel: userID,
          text: nextQuestion.text,
          as_user: true
        }
        /* eslint-enable @typescript-eslint/camelcase */
      );
      console.log(JSON.stringify(postMessageResponse));

      standup.questions[nextQuestionIndex].postedAt = postMessageResponse.ts;
      await saveStandup(standup);

      continue;
    }

    if (answers.length !== questions.length) {
      // Skip if unintended state
      console.log(`unintended state in user: ${userID}`);
      continue;
    }

    const usersProfileResponse: WebApi.UsersProfileGetResponse = await slackClient.users.profile.get(
      {
        token: workspace.userAccessToken,
        user: standup.userID
      }
    );
    console.log(JSON.stringify(usersProfileResponse));

    const botUsersProfileResponse: WebApi.UsersProfileGetResponse = await slackClient.users.profile.get(
      {
        token: workspace.userAccessToken,
        user: workspace.botUserID
      }
    );
    console.log(JSON.stringify(botUsersProfileResponse));

    const contextBlock = {
      type: "context",
      elements: [
        /* eslint-disable @typescript-eslint/camelcase */
        {
          type: "image",
          image_url: botUsersProfileResponse.profile.image_72,
          alt_text: "bot_icon"
        },
        /* eslint-enable @typescript-eslint/camelcase */
        {
          type: "mrkdwn",
          text: `Sent by ${botUsersProfileResponse.profile.real_name}`
        }
      ]
    };

    const standupBlocks = standup.questions
      .map((_, i) => {
        if (standup.answers[i].text === "none") {
          return;
        }

        return {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${standup.questions[i].text}*`
          },
          fields: [
            {
              type: "mrkdwn",
              text: standup.answers[i].text
            }
          ]
        };
      })
      .filter(standupBlock => standupBlock !== undefined);

    const blocks = [].concat(...[contextBlock, standupBlocks]);

    if (standup.finishedAt === undefined) {
      console.log(`finished user: ${userID}`);

      if (standup.answers.every(answer => answer.text === "none")) {
        const postMessageResponse: WebApi.ChatPostMessageResponse = await slackClient.chat.postMessage(
          /* eslint-disable @typescript-eslint/camelcase */
          {
            token: workspace.botAccessToken,
            channel: standup.userID,
            text: "Stand-up canceled.",
            as_user: true
          }
          /* eslint-enable @typescript-eslint/camelcase */
        );
        console.log(JSON.stringify(postMessageResponse));

        continue;
      }

      const postMessageResponse: WebApi.ChatPostMessageResponse = await slackClient.chat.postMessage(
        /* eslint-disable @typescript-eslint/camelcase */
        {
          token: workspace.botAccessToken,
          channel: standup.targetChannelID,
          blocks: blocks,
          text: "", // Workaround
          icon_url: usersProfileResponse.profile.image_72,
          username:
            usersProfileResponse.profile.display_name ||
            usersProfileResponse.profile.real_name
        }
        /* eslint-enable @typescript-eslint/camelcase */
      );
      console.log(JSON.stringify(postMessageResponse));

      standup.finishedAt = postMessageResponse.message.ts;
      await saveStandup(standup);
    } else {
      if (standup.answers.every(answer => answer.text === "none")) {
        const deleteResponse: WebApi.ChatDeleteResponse = await slackClient.chat.delete(
          {
            token: workspace.botAccessToken,
            channel: standup.targetChannelID,
            ts: standup.finishedAt
          }
        );
        console.log(JSON.stringify(deleteResponse));

        delete standup.finishedAt;
        await saveStandup(standup);

        continue;
      }

      const updateResponse: WebApi.ChatUpdateResponse = await slackClient.chat.update(
        /* eslint-disable @typescript-eslint/camelcase */
        {
          token: workspace.botAccessToken,
          channel: standup.targetChannelID,
          blocks: blocks,
          text: "", // Workaround
          icon_url: usersProfileResponse.profile.image_72,
          username:
            usersProfileResponse.profile.display_name ||
            usersProfileResponse.profile.real_name,
          ts: standup.finishedAt
        }
        /* eslint-enable @typescript-eslint/camelcase */
      );
      console.log(JSON.stringify(updateResponse));
    }
  }

  return callback(null);
};
