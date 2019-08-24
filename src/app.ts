// ------------------------------------------------------
// Type definitions in TypeScript
import * as WebApi from 'seratch-slack-types/web-api';
import { Request, Response, Application } from 'express';

// ------------------------------------------------------
// Bot app
// https://slack.dev/bolt/
import { App, ExpressReceiver } from '@slack/bolt';

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});
export const expressApp: Application = expressReceiver.app;

const app: App = new App({
  receiver: expressReceiver
});


// Check the details of the error to handle cases where you should retry sending a message or stop the app
app.error((error) => {
  console.error(error);
});

// ------------------------------------------------------
// OAuth flow
expressApp.get('/slack/installation', (_req: Request, res: Response) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const scopesCsv = 'commands,users:read,users:read.email,team:read'; // TODO: modify
  const state = 'randomly-generated-string'; // TODO: implement the logic
  const url = `https://slack.com/oauth/authorize?client_id=${clientId}&scope=${scopesCsv}&state=${state}`;
  res.redirect(url);
});

expressApp.get('/slack/oauth', (req: Request, res: Response) => {
  // TODO: make sure if req.query.state is valid
  app.client.oauth.access({
    code: req.query.code,
    client_id: process.env.SLACK_CLIENT_ID,
    client_secret: process.env.SLACK_CLIENT_SECRET,
    redirect_uri: process.env.SLACK_REDIRECT_URI
  })
    .then((apiRes: WebApi.OauthAccessResponse) => {
      if (apiRes.ok) {
        console.log(`Succeeded! ${JSON.stringify(apiRes)}`)
        // TODO: show a complete webpage here
        res.status(200).send(`Thanks!`);
      } else {
        console.error(`Failed because of ${apiRes.error}`)
        // TODO: show a complete webpage here
        res.status(500).send(`Something went wrong! error: ${apiRes.error}`);
      }
    }).catch(reason => {
      console.error(`Failed because ${reason}`)
      // TODO: show a complete webpage here
      res.status(500).send(`Something went wrong! reason: ${reason}`);
    });
});
