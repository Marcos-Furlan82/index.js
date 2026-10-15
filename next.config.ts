import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O client do Prisma é gerado em src/generated/prisma e usa o driver "pg".
  serverExternalPackages: ["pg"],
};

export default nextConfig;
