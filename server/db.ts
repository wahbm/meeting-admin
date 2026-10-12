import "dotenv/config";
import { PrismaClient } from "@prisma/client";
process.env.DATABASE_URL ||= "file:./meeting.db";
export const db = new PrismaClient();
