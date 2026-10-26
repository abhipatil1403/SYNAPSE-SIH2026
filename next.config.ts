import type { NextConfig } from "next";
import { assertWebEnvironment } from "./lib/web-environment";
assertWebEnvironment(process.env);
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
};
export default config;
