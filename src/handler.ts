'use strict';

import { expressApp } from "./app";
import serverless = require("serverless-http");

export const app = serverless(expressApp);
