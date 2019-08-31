import { expressReceiver } from "./bot";
import { routes } from "./server";
import { sqsStartQueue, sqsEndpoint } from "./env";
import serverless = require("serverless-http");
import { ScheduledHandler, SQSHandler } from "aws-lambda";
import {
  getSettingsByNextExecutionTimestamp,
  updateNextExecutionTimestamp
} from "./setting";
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

export const start: SQSHandler = (event, _, callback) => {
  console.log(JSON.stringify(event));

  return callback(null);
};
