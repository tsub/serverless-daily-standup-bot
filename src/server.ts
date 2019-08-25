import { Request, Response, Application } from "express";
import { Passport } from "passport";
import * as OAuth2Strategy from "passport-oauth2";
import * as session from "express-session";
import * as connectDynamoDB from "connect-dynamodb";
import { dynamoDBClient, saveWorkspace } from "./workspace";
import { botApp, handleEvents } from "./bot";
import {
  sessionDynamoDBTable,
  sessionSecret,
  slackClientID,
  slackClientSecret,
  slackRedirectURI
} from "./env";
import {
  slackAuthorizationURL,
  slackTokenURL,
  slackAuthorizationScope
} from "./config";

const verify: OAuth2Strategy.VerifyFunction = async (
  _accessToken,
  _refreshToken,
  results,
  _profile,
  cb
) => {
  console.log(results);

  try {
    await saveWorkspace(results);

    return cb(null, {});
  } catch (err) {
    return cb(err, {});
  }
};

export const routes: (_: Application) => Application = app => {
  handleEvents(botApp);

  const DynamoDBStore = connectDynamoDB({ session });
  const DynamoDBStoreOptions = {
    table: sessionDynamoDBTable,
    client: dynamoDBClient
  };
  const passport = new Passport();

  app.use(
    session({
      store: new DynamoDBStore(DynamoDBStoreOptions),
      secret: sessionSecret
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  const oauth2Strategy = new OAuth2Strategy(
    {
      authorizationURL: slackAuthorizationURL,
      tokenURL: slackTokenURL,
      clientID: slackClientID,
      clientSecret: slackClientSecret,
      callbackURL: slackRedirectURI,
      scope: slackAuthorizationScope,
      state: true
    },
    verify
  );

  passport.use(oauth2Strategy);

  app.get("/slack/oauth", passport.authenticate("oauth2"));

  app.get(
    "/slack/oauth/callback",
    passport.authenticate("oauth2", { session: false }),
    (_req: Request, res: Response) => {
      res.status(200).send("login succeeded");
    }
  );

  return app;
};
