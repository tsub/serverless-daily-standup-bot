import { expressReceiver } from "./bot";
import { routes } from "./server";
import { sqsStartQueue, sqsEndpoint } from "./env";
import serverless = require("serverless-http");
import { ScheduledHandler, SQSHandler } from "aws-lambda";
import {
  Setting,
  getSettingsByNextExecutionTimestamp,
  updateNextExecutionTimestamp
} from "./setting";
import { Standup, initialStandup, getStandup } from "./standup";
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
        setting.channelID,
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
        channelID: setting.channelID,
        userID: userID,
        questions: questions,
        date: currentDate
      } as Standup;

      promises.push(initialStandup(standup));
    }
  }
  await Promise.all(promises);

  return callback(null);
};
