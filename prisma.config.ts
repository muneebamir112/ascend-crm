import { defineConfig } from "@prisma/config";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL || "mysql://root:password@localhost:3306/ASCEND",
  },
});
