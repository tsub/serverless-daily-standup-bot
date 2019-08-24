import { Request, Response, Application } from 'express';
import { App, ExpressReceiver, AuthorizeResult, AuthorizeSourceData } from '@slack/bolt';
import { Passport } from 'passport';
import * as OAuth2Strategy from 'passport-oauth2';
import * as session from 'express-session';
import * as connectDynamoDB from 'connect-dynamodb';
import * as AWS from 'aws-sdk';
import {
  workspaceDynamoDBTable,
  sessionDynamoDBTable,
  sessionSecret,
  slackSigningSecret,
  slackClientID,
  slackClientSecret,
  slackRedirectURI,
  dynamoDBEndpoint,
} from './env';

const DynamoDBClient = new AWS.DynamoDB({
  endpoint: dynamoDBEndpoint,
});

const expressReceiver = new ExpressReceiver({
  signingSecret: slackSigningSecret,
});
export const expressApp: Application = expressReceiver.app;

const app: App = new App({
  receiver: expressReceiver,
  authorize: async function(source: AuthorizeSourceData): Promise<AuthorizeResult> {
    console.log(source);

    try {
      let item;

      if (source.userId) {
        const getItemResult = await DynamoDBClient.getItem({
          Key: {
            "team_id": { S: source.teamId },
            "user_id": { S: source.userId },
          },
          TableName: workspaceDynamoDBTable,
        }).promise();

        item = getItemResult.Item;
      } else {
        const queryResult = await DynamoDBClient.query({
          ExpressionAttributeValues: {
            ":team_id": { S: source.teamId },
          },
          KeyConditionExpression: "team_id = :team_id",
          TableName: workspaceDynamoDBTable,
        }).promise();

        item = queryResult.Items[0];
      }

      const authTestResult = await this.client.auth.test({ token: item["bot_access_token"].S });

      console.log(authTestResult);

      return {
        botToken: item["bot_access_token"].S,
        botId: authTestResult.user_id,
        botUserId: item["bot_user_id"].S,
        userToken: item["user_access_token"].S,
      };
    } catch (err) {
      throw new Error(err);
    }
  },
});

app.message('hi', async ({ message, say}) => {
  say(`Hello, <@${message.user}>`);
});

// Check the details of the error to handle cases where you should retry sending a message or stop the app
app.error((error) => {
  console.error(error);
});

// ------------------------------------------------------
// OAuth flow

const DynamoDBStore = connectDynamoDB({ session });
const DynamoDBStoreOptions = {
  table: sessionDynamoDBTable,
  client: DynamoDBClient,
};
const passport = new Passport();

expressApp.use(session({ store: new DynamoDBStore(DynamoDBStoreOptions), secret: sessionSecret }))
expressApp.use(passport.initialize());
expressApp.use(passport.session());

passport.use(new OAuth2Strategy({
    authorizationURL: 'https://slack.com/oauth/authorize',
    tokenURL: 'https://slack.com/api/oauth.access',
    clientID: slackClientID,
    clientSecret: slackClientSecret,
    callbackURL: slackRedirectURI,
    scope: 'bot,chat:write:bot',
    scopeSeparator: ',',
    state: true,
  },
  async (_accessToken: string, _refreshToken: string, results: any, _profile: any, cb: OAuth2Strategy.VerifyCallback): Promise<void> => {
    console.log(results)

    try {
      await DynamoDBClient.putItem({
        Item: {
          "team_id": { S: results.team_id },
          "user_id": { S: results.user_id },
          "user_access_token": { S: results.access_token },
          "bot_access_token": { S: results.bot.bot_access_token },
          "bot_user_id": { S: results.bot.bot_user_id },
        },
        TableName: workspaceDynamoDBTable,
      }).promise();

      return cb(null, {});
    } catch (err) {
      return cb(err, {})
    }
  },
));

expressApp.get('/slack/oauth',
  passport.authenticate('oauth2'));

expressApp.get('/slack/oauth/callback',
  passport.authenticate('oauth2', { session: false }),
  (_req: Request, res: Response) => {
    res.status(200).send('login succeeded');
  });
