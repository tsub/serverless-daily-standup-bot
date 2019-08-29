import { expressReceiver } from "./bot";
import { routes } from "./server";
import serverless = require("serverless-http");
import { ScheduledHandler } from "aws-lambda";
import {
  getSettingsByNextExecutionTimestamp,
  updateNextExecutionTimestamp
} from "./setting";
import * as moment from "moment";

export const app = serverless(routes(expressReceiver.app));
export const scheduler: ScheduledHandler = async () => {
  const date = moment();
  const currentDate = date.format("YYYY-MM-DD");
  const currentTimestamp = date.unix().toString();
  const settings = await getSettingsByNextExecutionTimestamp(
    currentDate,
    currentTimestamp
  );

  const promises = settings.map(async setting => {
    // TODO: Enqueue to SQS
    return updateNextExecutionTimestamp(setting);
  });

  await Promise.all(promises);
};
