import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O client do Prisma é gerado em src/generated/prisma e usa o driver "pg".
  // sharp (imagens) e jsdom (limpeza de SVG) têm binários/arquivos próprios: ficam fora do bundle.
  serverExternalPackages: ["pg", "sharp", "jsdom"],
};

export default nextConfig;
