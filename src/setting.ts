import * as AWS from "aws-sdk";
import { settingDynamoDBTable, dynamoDBEndpoint } from "./env";

export type setting = {
  identifier: string;
  teamID: string;
  channelID: string;
  userIDs: Array<string>;
  questions: Array<string>;
  scheduleExpression: string;
};

export const dynamoDBClient: AWS.DynamoDB = new AWS.DynamoDB({
  endpoint: dynamoDBEndpoint
});

export const saveSetting: (
  _: setting
) => Promise<AWS.DynamoDB.PutItemOutput> = async setting => {
  return dynamoDBClient
    .putItem({
      Item: {
        identifier: { S: `${setting.teamID}.${setting.channelID}` },
        userIDs: { SS: setting.userIDs },
        questions: { SS: setting.questions },
        scheduleExpression: { S: setting.scheduleExpression }
      },
      TableName: settingDynamoDBTable
    })
    .promise();
};

export const getSetting: (
  teamID: string,
  channelID: string
) => Promise<setting> = async (teamID, channelID) => {
  const getItemResult = await dynamoDBClient
    .getItem({
      Key: {
        identifier: { S: `${teamID}.${channelID}` }
      },
      TableName: settingDynamoDBTable
    })
    .promise();

  if (getItemResult.Item === undefined) {
    return;
  }

  return {
    identifier: getItemResult.Item.identifier.S,
    userIDs: getItemResult.Item.userIDs.SS,
    questions: getItemResult.Item.questions.SS,
    scheduleExpression: getItemResult.Item.scheduleExpression.S,
    channelID: channelID,
    teamID: teamID
  } as setting;
};
