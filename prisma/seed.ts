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
  let ownerId = existingUser?.id;

  if (!existingUser) {
    const user = await prisma.user.create({
      data: {
        username: "owner",
        displayName: "Owner",
        passwordHash: await argon2.hash(password),
        mustChangePassword: true,
      },
    });

    ownerId = user.id;
  }

  const notebook = await prisma.notebook.findFirst({
    where: ownerId
      ? {
          userId: ownerId,
          name: "Quick Notes",
        }
      : {
          name: "Quick Notes",
        },
  });

  let defaultGroupId =
    ownerId
      ? (
          await prisma.notebookGroup.findFirst({
            where: {
              userId: ownerId,
              systemKey: null,
            },
            select: { id: true },
          })
        )?.id
      : null;

  if (!defaultGroupId && ownerId) {
    const group = await prisma.notebookGroup.create({
      data: {
        userId: ownerId,
        name: "General",
      },
    });

    defaultGroupId = group.id;
  }

  if (!notebook && ownerId && defaultGroupId) {
    const createdNotebook = await prisma.notebook.create({
      data: {
        userId: ownerId,
        groupId: defaultGroupId,
        name: "Quick Notes",
        description: "Personal space for thoughts, plans, and study notes.",
      },
    });

    await prisma.page.create({
      data: {
        userId: ownerId,
        notebookId: createdNotebook.id,
        title: "Welcome",
        bodyHtml:
          "<h1>Welcome</h1><p>Your notebook is ready. Change the default password from Security settings first.</p>",
        bodyText:
          "Welcome Your notebook is ready. Change the default password from Security settings first.",
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
