import { eq } from "drizzle-orm";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { phoneNumbers } from "../db/schema.js";
import { hashPassword } from "../auth/passwords.js";
import { createUser, findUserByEmail, type StoredUser } from "../repositories/users.js";

export async function seedDemo(input: { db: Database; config: Pick<AppConfig, "DEMO_EMAIL" | "DEMO_PASSWORD" | "TWILIO_PHONE_NUMBER"> }): Promise<StoredUser> {
  const existing = await findUserByEmail(input.db, input.config.DEMO_EMAIL);
  const user = existing ?? await createUser({
    db: input.db,
    email: input.config.DEMO_EMAIL,
    passwordHash: await hashPassword(input.config.DEMO_PASSWORD),
    displayName: "Demo Owner"
  });
  const existingNumber = await input.db.select({ id: phoneNumbers.id })
    .from(phoneNumbers)
    .where(eq(phoneNumbers.ownerId, user.id))
    .limit(1);
  if (existingNumber[0] === undefined) {
    await input.db.insert(phoneNumbers).values({
      ownerId: user.id,
      twilioSid: `demo-${user.id}`,
      phoneNumber: input.config.TWILIO_PHONE_NUMBER,
      isActive: true
    });
  }
  return user;
}
