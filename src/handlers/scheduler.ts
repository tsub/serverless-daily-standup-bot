import { sqsStartQueue, sqsEndpoint } from "../env";
import { ScheduledHandler } from "aws-lambda";
import {
  getSettingsByNextExecutionTimestamp,
  updateNextExecutionTimestamp
} from "../setting";
import * as AWS from "aws-sdk";
import * as moment from "moment-timezone";

export const handler: ScheduledHandler = async (_event, _context, callback) => {
  const today = moment();
  const currentDate = today.format("YYYY-MM-DD");
  const currentTimestamp = today.unix().toString();

  const yesterday = today.subtract(1, "day");
  const previousDate = yesterday.format("YYYY-MM-DD");

  const currentDateSettings = await getSettingsByNextExecutionTimestamp(
    currentDate,
    currentTimestamp
  );
  const previousDateSettings = await getSettingsByNextExecutionTimestamp(
    previousDate,
    currentTimestamp
  );
  const settings = [].concat(...[previousDateSettings, currentDateSettings]);

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
