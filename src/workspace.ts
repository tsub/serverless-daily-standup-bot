import { AuthorizeSourceData } from "@slack/bolt";
import * as WebApi from "seratch-slack-types/web-api";
import * as AWS from "aws-sdk";
import { workspaceDynamoDBTable, dynamoDBEndpoint } from "./env";

type workspace = {
  teamID: string;
  userID: string;
  userAccessToken: string;
  botAccessToken: string;
  botUserID: string;
};

export const dynamoDBClient: AWS.DynamoDB = new AWS.DynamoDB({
  endpoint: dynamoDBEndpoint
});

export const saveWorkspace: (
  _: WebApi.OauthAccessResponse
) => Promise<AWS.DynamoDB.PutItemOutput> = async results => {
  return dynamoDBClient
    .putItem({
      Item: {
        team_id: { S: results.team_id },
        user_id: { S: results.user_id },
        user_access_token: { S: results.access_token },
        bot_access_token: { S: results.bot.bot_access_token },
        bot_user_id: { S: results.bot.bot_user_id }
      },
      TableName: workspaceDynamoDBTable
    })
    .promise();
};

export const getWorkspace: (
  _: AuthorizeSourceData
) => Promise<workspace> = async source => {
  let item: AWS.DynamoDB.AttributeMap;

  if (source.userId) {
    const getItemResult = await dynamoDBClient
      .getItem({
        Key: {
          team_id: { S: source.teamId },
          user_id: { S: source.userId }
        },
        TableName: workspaceDynamoDBTable
      })
      .promise();

    item = getItemResult.Item;
  } else {
    const queryResult = await dynamoDBClient
      .query({
        ExpressionAttributeValues: {
          ":team_id": { S: source.teamId }
        },
        KeyConditionExpression: "team_id = :team_id",
        TableName: workspaceDynamoDBTable
      })
      .promise();

    item = queryResult.Items[0];
  }

  return {
    teamID: item["team_id"].S,
    userID: item["user_id"].S,
    userAccessToken: item["user_access_token"].S,
    botAccessToken: item["bot_access_token"].S,
    botUserID: item["bot_user_id"].S
  } as workspace;
};
