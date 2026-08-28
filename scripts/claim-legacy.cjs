/**
 * One-time migration: create the owner Account and claim every legacy
 * operator (User rows with accountId = null) on its behalf, so pre-auth
 * demo data stays visible under a real login.
 *
 * Usage: node scripts/claim-legacy.cjs [email] [password]
 * Defaults: owner@wakeel.app / Wakeel-2025!
 */
const { PrismaClient } = require("@prisma/client");
const { scrypt, randomBytes, timingSafeEqual } = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1, keylen = 64;
  const derived = await scryptAsync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

(async () => {
  const email = (process.argv[2] || "owner@wakeel.app").toLowerCase().trim();
  const password = process.argv[3] || "Wakeel-2025!";
  const db = new PrismaClient();
  try {
    let account = await db.account.findUnique({ where: { email } });
    if (!account) {
      account = await db.account.create({
        data: { email, name: "Owner", passwordHash: await hashPassword(password) },
      });
      console.log(`[claim-legacy] created account ${email}`);
    } else {
      console.log(`[claim-legacy] account ${email} already exists — claiming onto it`);
    }
    const orphans = await db.user.updateMany({
      where: { accountId: null },
      data: { accountId: account.id },
    });
    console.log(`[claim-legacy] claimed ${orphans.count} legacy operator(s)`);
  } finally {
    await db.$disconnect();
  }
})();
