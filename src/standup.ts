import { standupDynamoDBTable, dynamoDBEndpoint } from "./env";
import * as AWS from "aws-sdk";

const dynamoDBClient: AWS.DynamoDB = new AWS.DynamoDB({
  endpoint: dynamoDBEndpoint
});

type question = {
  text: string;
  postedAt?: string;
};

type answer = {
  text: string;
  postedAt: string;
};

export type Standup = {
  identifier: string;
  date: string;
  questions: Array<question>;
  answers?: Array<answer>;
  finishedAt?: string;
  teamID: string;
  channelID: string;
  userID: string;
};

export const initialStandup: (
  _: Standup
) => Promise<AWS.DynamoDB.PutItemOutput> = standup => {
  const questions = standup.questions.map(question => ({
    M: {
      text: { S: question.text }
    }
  }));

  return dynamoDBClient
    .putItem({
      Item: {
        identifier: {
          S: `${standup.teamID}.${standup.channelID}.${standup.userID}`
        },
        date: { S: standup.date },
        questions: { L: questions },
        answers: { L: [] }
      },
      TableName: standupDynamoDBTable
    })
    .promise();
};

export const getStandup: (
  teamID: string,
  channelID: string,
  userID: string,
  currentDate: string
) => Promise<Standup> = async (teamID, channelID, userID, currentDate) => {
  const getItemResponse = await dynamoDBClient
    .getItem({
      Key: {
        identifier: { S: `${teamID}.${channelID}.${userID}` },
        date: { S: currentDate }
      },
      TableName: standupDynamoDBTable
    })
    .promise();

  if (getItemResponse.Item === undefined) {
    return;
  }

  const questions = getItemResponse.Item.questions.L.map(question => ({
    text: question.M.text.S,
    postedAt: question.M.postedAt && question.M.postedAt.S
  }));
  const answers = getItemResponse.Item.answers.L.map(answer => ({
    text: answer.M.text.S,
    postedAt: answer.M.postedAt && answer.M.postedAt.S
  }));

  return {
    identifier: getItemResponse.Item.identifier.S,
    questions: questions,
    answers: answers,
    finishedAt:
      getItemResponse.Item.finishedAt && getItemResponse.Item.finishedAt.S,
    channelID: channelID,
    teamID: teamID,
    userID: userID
  } as Standup;
};
