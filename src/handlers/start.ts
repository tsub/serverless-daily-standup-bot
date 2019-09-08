import { SQSHandler } from "aws-lambda";
import { Setting } from "../setting";
import { Standup, saveStandup, getStandup } from "../standup";
import { getWorkspace } from "../workspace";
import { WebClient } from "@slack/web-api";
import * as moment from "moment-timezone";
import * as WebApi from "seratch-slack-types/web-api";

export const handler: SQSHandler = async (event, _, callback) => {
  console.log(JSON.stringify(event));

  const promises = [];
  for (const record of event.Records) {
    const setting = JSON.parse(record.body) as Setting;

    for (const userID of setting.userIDs) {
      const workspace = await getWorkspace(setting.teamID, userID);
      const slackClient = new WebClient(workspace.userAccessToken);

      const usersInfoResponse: WebApi.UsersInfoResponse = await slackClient.users.info(
        { user: userID }
      );

      const currentDate = moment()
        .tz(usersInfoResponse.user.tz)
        .format("YYYY-MM-DD");

      const existStandup = await getStandup(
        setting.teamID,
        userID,
        currentDate
      );

      if (existStandup !== undefined) {
        return;
      }

      const questions = setting.questions.map(question => ({
        text: question
      }));

      const standup = {
        teamID: setting.teamID,
        targetChannelID: setting.channelID,
        userID: userID,
        questions: questions,
        answers: [],
        date: currentDate
      } as Standup;

      promises.push(saveStandup(standup));
    }
  }
  await Promise.all(promises);

  return callback(null);
};
