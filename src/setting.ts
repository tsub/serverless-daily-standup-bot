import * as AWS from "aws-sdk";
import * as cron from "cron-parser";
import * as moment from "moment";
import { settingDynamoDBTable, dynamoDBEndpoint } from "./env";

export type Setting = {
  teamID: string;
  channelID: string;
  userIDs: Array<string>;
  questions: Array<string>;
  cronExpression: string;
  nextExecutionDate: string;
  nextExecutionTimestamp: string;
};

export const dynamoDBClient: AWS.DynamoDB = new AWS.DynamoDB({
  endpoint: dynamoDBEndpoint
});

export const saveSetting: (
  _: Setting
) => Promise<AWS.DynamoDB.PutItemOutput> = setting => {
  const userIDs = setting.userIDs.map(userID => ({ S: userID }));
  const questions = setting.questions.map(question => ({ S: question }));

  return dynamoDBClient
    .putItem({
      Item: {
        teamID: { S: setting.teamID },
        channelID: { S: setting.channelID },
        userIDs: { L: userIDs },
        questions: { L: questions },
        cronExpression: { S: setting.cronExpression },
        nextExecutionDate: { S: setting.nextExecutionDate },
        nextExecutionTimestamp: { N: setting.nextExecutionTimestamp }
      },
      TableName: settingDynamoDBTable
    })
    .promise();
};

export const getSetting: (
  teamID: string,
  channelID: string
) => Promise<Setting> = async (teamID, channelID) => {
  const getItemResult = await dynamoDBClient
    .getItem({
      Key: {
        teamID: { S: teamID },
        channelID: { S: channelID }
      },
      TableName: settingDynamoDBTable
    })
    .promise();

  if (getItemResult.Item === undefined) {
    return;
  }

  const userIDs = getItemResult.Item.userIDs.L.map(userID => userID.S);
  const questions = getItemResult.Item.questions.L.map(question => question.S);

  return {
    teamID: teamID,
    channelID: channelID,
    userIDs: userIDs,
    questions: questions,
    cronExpression: getItemResult.Item.cronExpression.S,
    nextExecutionDate: getItemResult.Item.nextExecutionDate.S,
    nextExecutionTimestamp: getItemResult.Item.nextExecutionTimestamp.N
  } as Setting;
};

export const getSettingsByTeamID: (
  _: string
) => Promise<Array<Setting>> = async teamID => {
  const queryResult = await dynamoDBClient
    .query({
      ExpressionAttributeValues: {
        ":teamID": { S: teamID }
      },
      KeyConditionExpression: "teamID = :teamID",
      TableName: settingDynamoDBTable
    })
    .promise();

  if (queryResult.Items.length === 0) {
    return [];
  }

  return queryResult.Items.map(item => {
    const userIDs = item.userIDs.L.map(userID => userID.S);
    const questions = item.questions.L.map(question => question.S);

    return {
      teamID: item.teamID.S,
      channelID: item.channelID.S,
      userIDs: userIDs,
      questions: questions,
      cronExpression: item.cronExpression.S,
      nextExecutionDate: item.nextExecutionDate.S,
      nextExecutionTimestamp: item.nextExecutionTimestamp.N
    } as Setting;
  });
};

export const getSettingsByNextExecutionTimestamp: (
  currentDate: string,
  currentTimestamp: string
) => Promise<Array<Setting>> = async (currentDate, currentTimestamp) => {
  const queryResult = await dynamoDBClient
    .query({
      ExpressionAttributeValues: {
        ":nextExecutionDate": { S: currentDate },
        ":nextExecutionTimestamp": { N: currentTimestamp }
      },
      KeyConditionExpression:
        "nextExecutionDate = :nextExecutionDate AND nextExecutionTimestamp <= :nextExecutionTimestamp",
      IndexName: "nextExecutionDate",
      TableName: settingDynamoDBTable
    })
    .promise();

  return queryResult.Items.map(item => {
    const userIDs = item.userIDs.L.map(userID => userID.S);
    const questions = item.questions.L.map(question => question.S);

    return {
      teamID: item.teamID.S,
      channelID: item.channelID.S,
      userIDs: userIDs,
      questions: questions,
      cronExpression: item.cronExpression.S,
      nextExecutionDate: item.nextExecutionDate.S,
      nextExecutionTimestamp: item.nextExecutionTimestamp.N
    } as Setting;
  });
};

export const updateNextExecutionTimestamp: (
  _: Setting
) => Promise<AWS.DynamoDB.PutItemOutput> = async setting => {
  const schedule = cron.parseExpression(setting.cronExpression, { utc: true });
  const date = schedule.next().toDate();
  const nextExecutionDate = moment(date).format("YYYY-MM-DD");
  const nextExecutionTimestamp = moment(date)
    .unix()
    .toString();

  setting.nextExecutionDate = nextExecutionDate;
  setting.nextExecutionTimestamp = nextExecutionTimestamp;

  return saveSetting(setting);
};
