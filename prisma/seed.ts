import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/notebook",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const password = process.env.BOOTSTRAP_PASSWORD || "reza1071377";
  const existingUser = await prisma.user.findFirst();

  if (!existingUser) {
    await prisma.user.create({
      data: {
        passwordHash: await argon2.hash(password),
        mustChangePassword: true,
      },
    });
  }

  const notebook = await prisma.notebook.findFirst({
    where: { name: "Quick Notes" },
  });

  if (!notebook) {
    await prisma.notebook.create({
      data: {
        name: "Quick Notes",
        description: "Personal space for thoughts, plans, and study notes.",
        pages: {
          create: {
            title: "Welcome",
            bodyHtml:
              "<h1>Welcome</h1><p>Your notebook is ready. Change the default password from Security settings first.</p>",
            bodyText:
              "Welcome Your notebook is ready. Change the default password from Security settings first.",
          },
        },
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
