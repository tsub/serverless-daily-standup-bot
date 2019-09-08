import { expressApp, routes } from "../server";
import serverless = require("serverless-http");

export const handler = serverless(routes(expressApp));
