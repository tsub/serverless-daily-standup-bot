import { expressReceiver } from "./bot";
import { routes } from "./server";
import serverless = require("serverless-http");

export const app = serverless(routes(expressReceiver.app));
