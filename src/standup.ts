import { standupDynamoDBTable, dynamoDBEndpoint } from "./env";
import * as AWS from "aws-sdk";

const dynamoDBClient: AWS.DynamoDB = new AWS.DynamoDB({
  endpoint: dynamoDBEndpoint
});

export type Question = {
  text: string;
  postedAt?: string;
};

export type Answer = {
  text: string;
  postedAt?: string;
};

export type Standup = {
  identifier: string;
  date: string;
  questions: Array<Question>;
  answers: Array<Answer>;
  finishedAt?: string;
  teamID: string;
  targetChannelID: string;
  userID: string;
};

export const saveStandup: (
  _: Standup
) => Promise<AWS.DynamoDB.PutItemOutput> = standup => {
  const questions = standup.questions.map(question => ({
    M: {
      text: { S: question.text },
      postedAt: question.postedAt && { S: question.postedAt }
    }
  }));
  const answers = standup.answers.map(answer => ({
    M: {
      text: { S: answer.text },
      postedAt: answer.postedAt && { S: answer.postedAt }
    }
  }));

  return dynamoDBClient
    .putItem({
      Item: {
        identifier: {
          S: `${standup.teamID}.${standup.userID}`
        },
        date: { S: standup.date },
        questions: { L: questions },
        answers: { L: answers },
        finishedAt: standup.finishedAt && { S: standup.finishedAt },
        targetChannelID: { S: standup.targetChannelID }
      },
      TableName: standupDynamoDBTable
    })
    .promise();
};

export const getStandup: (
  teamID: string,
  userID: string,
  currentDate: string
) => Promise<Standup> = async (teamID, userID, currentDate) => {
  const getItemResponse = await dynamoDBClient
    .getItem({
      Key: {
        identifier: { S: `${teamID}.${userID}` },
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
    date: getItemResponse.Item.date.S,
    questions: questions,
    answers: answers,
    finishedAt:
      getItemResponse.Item.finishedAt && getItemResponse.Item.finishedAt.S,
    targetChannelID: getItemResponse.Item.targetChannelID.S,
    teamID: teamID,
    userID: userID
  } as Standup;
};
