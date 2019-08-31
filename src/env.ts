const getEnv: (_: string) => string = key => {
  const value = process.env[key];

  // Workaround: `value !== 'undefined'` for serverless framework
  if (
    value !== null &&
    value !== undefined &&
    value !== "undefined" &&
    value.length > 0
  ) {
    return value;
  }

  throw new Error(`Please export $${key}`);
};

export const appName = getEnv("APP_NAME");
export const workspaceDynamoDBTable = getEnv("WORKSPACE_DYNAMODB_TABLE");
export const settingDynamoDBTable = getEnv("SETTING_DYNAMODB_TABLE");
export const sessionDynamoDBTable = getEnv("SESSION_DYNAMODB_TABLE");
export const sessionSecret = getEnv("SESSION_SECRET");
export const slackSigningSecret = getEnv("SLACK_SIGNING_SECRET");
export const slackClientID = getEnv("SLACK_CLIENT_ID");
export const slackClientSecret = getEnv("SLACK_CLIENT_SECRET");
export const slackRedirectURI = getEnv("SLACK_REDIRECT_URI");
export const sqsStartQueue = getEnv("SQS_START_QUEUE");
export const dynamoDBEndpoint = process.env.DYNAMODB_ENDPOINT;
export const sqsEndpoint = process.env.SQS_ENDPOINT;
