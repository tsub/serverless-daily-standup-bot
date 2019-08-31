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
import * as moment from "moment";
import * as AWS from "aws-sdk";

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

  const currentDate = moment().format("YYYY-MM-DD");

  const getStandupPromises = [];
  event.Records.forEach(record => {
    const setting = JSON.parse(record.body) as Setting;

    setting.userIDs.forEach(userID => {
      const getStandupPromise = getStandup(
        setting.teamID,
        setting.channelID,
        userID,
        currentDate
      );

      getStandupPromises.push(getStandupPromise);
    });
  });
  const standups = await Promise.all(getStandupPromises);

  const initialStandupPromises = [];
  event.Records.forEach(record => {
    const setting = JSON.parse(record.body) as Setting;

    setting.userIDs.forEach(userID => {
      if (standups.some(standup => standup.userID === userID)) {
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

      initialStandupPromises.push(initialStandup(standup));
    });
  });
  await Promise.all(initialStandupPromises);

  return callback(null);
};
