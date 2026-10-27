import type { NextConfig } from "next";
import { assertWebEnvironment } from "./lib/web-environment";
assertWebEnvironment(process.env);
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Auth callback URLs can contain single-use codes. Never log request URLs or
  // server-action arguments in the development terminal.
  logging: { incomingRequests: false, serverFunctions: false, browserToTerminal: false },
};
export default config;
