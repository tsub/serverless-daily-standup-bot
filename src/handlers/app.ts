import { routes } from "../server";
import { receiver } from "../bot";
import serverless = require("serverless-http");

export const handler = serverless(routes(receiver.app));
