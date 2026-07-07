import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TRASH_GROUP_SYSTEM_KEY } from "@/lib/trash";

export type SearchResultType = "page" | "notebook" | "group" | "attachment";
export type SearchMatchedField = "title" | "bodyText" | "tags" | "name" | "fileName";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  matchedField: SearchMatchedField;
};

export type SearchResultsPayload = {
  query: string;
  results: Record<SearchResultType, SearchResult[]>;
};

const RESULTS_PER_TYPE = 5;

const NON_TRASH_GROUP_FILTER: Prisma.NotebookGroupWhereInput = {
  OR: [
    { systemKey: null },
    { systemKey: { not: TRASH_GROUP_SYSTEM_KEY } },
  ],
};

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function getMatchStrength(value: string | null | undefined, query: string) {
  const normalizedValue = value?.trim().toLocaleLowerCase();

  if (!normalizedValue || !query) {
    return 0;
  }

  if (normalizedValue === query) {
    return 3;
  }

  if (normalizedValue.startsWith(query)) {
    return 2;
  }

  if (normalizedValue.includes(query)) {
    return 1;
  }

  return 0;
}

function getMatchedFieldScore(field: SearchMatchedField, strength: number) {
  if (strength <= 0) {
    return 0;
  }

  const baseScores: Record<SearchMatchedField, number> = {
    title: 400,
    name: 400,
    tags: 250,
    bodyText: 200,
    fileName: 180,
  };

  return baseScores[field] + strength * 10;
}

function getBestPageMatch(
  query: string,
  page: {
    title: string;
    bodyText: string;
    tags: Array<{ value: string }>;
  },
) {
  const candidates: Array<{ field: SearchMatchedField; score: number }> = [
    {
      field: "title",
      score: getMatchedFieldScore("title", getMatchStrength(page.title, query)),
    },
    {
      field: "bodyText",
      score: getMatchedFieldScore("bodyText", getMatchStrength(page.bodyText, query)),
    },
    ...page.tags.map((tag) => ({
      field: "tags" as const,
      score: getMatchedFieldScore("tags", getMatchStrength(tag.value, query)),
    })),
  ];

  return candidates.reduce<{ field: SearchMatchedField; score: number } | null>(
    (best, current) => {
      if (current.score <= 0) {
        return best;
      }

      if (!best || current.score > best.score) {
        return current;
      }

      return best;
    },
    null,
  );
}

function getPageSubtitle(page: {
  notebook: { name: string; group: { name: string } | null };
}) {
  const parts = [page.notebook.group?.name, page.notebook.name].filter(Boolean);
  return parts.join(" / ");
}

export async function searchWorkspace(
  userId: string,
  rawQuery: string,
): Promise<SearchResultsPayload> {
  const query = normalizeQuery(rawQuery);

  if (!query) {
    return {
      query: "",
      results: {
        page: [],
        notebook: [],
        group: [],
        attachment: [],
      },
    };
  }

  const [pages, notebooks, groups, attachments] = await Promise.all([
    prisma.page.findMany({
      where: {
        userId,
        archived: false,
        deletedAt: null,
        notebook: {
          archived: false,
          deletedAt: null,
          group: NON_TRASH_GROUP_FILTER,
        },
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { bodyText: { contains: query, mode: "insensitive" } },
          { tags: { some: { value: { contains: query, mode: "insensitive" } } } },
        ],
      },
      select: {
        id: true,
        title: true,
        bodyText: true,
        updatedAt: true,
        tags: { select: { value: true } },
        notebook: {
          select: {
            name: true,
            group: { select: { name: true } },
          },
        },
      },
      take: 25,
    }),
    prisma.notebook.findMany({
      where: {
        userId,
        archived: false,
        deletedAt: null,
        name: { contains: query, mode: "insensitive" },
        group: NON_TRASH_GROUP_FILTER,
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        group: {
          select: {
            name: true,
          },
        },
      },
      take: 25,
    }),
    prisma.notebookGroup.findMany({
      where: {
        userId,
        ...NON_TRASH_GROUP_FILTER,
        name: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        notebooks: {
          where: {
            archived: false,
            deletedAt: null,
            userId,
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            pages: {
              where: {
                archived: false,
                deletedAt: null,
                userId,
              },
              orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
              select: { id: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
      take: 25,
    }),
    prisma.attachment.findMany({
      where: {
        userId,
        fileName: { contains: query, mode: "insensitive" },
        page: {
          userId,
          archived: false,
          deletedAt: null,
          notebook: {
            archived: false,
            deletedAt: null,
            group: NON_TRASH_GROUP_FILTER,
          },
        },
      },
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        page: {
          select: {
            id: true,
            title: true,
            notebook: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      take: 25,
    }),
  ]);

  const pageResults = pages
    .map((page) => {
      const match = getBestPageMatch(query, page);

      if (!match) {
        return null;
      }

      return {
        result: {
          type: "page" as const,
          id: page.id,
          title: page.title,
          subtitle: getPageSubtitle(page),
          href: `/pages/${page.id}`,
          matchedField: match.field,
        },
        score: match.score,
        updatedAt: page.updatedAt.getTime(),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
    .slice(0, RESULTS_PER_TYPE)
    .map((entry) => entry.result);

  const notebookResults = notebooks
    .map((notebook) => ({
      result: {
        type: "notebook" as const,
        id: notebook.id,
        title: notebook.name,
        subtitle: notebook.group?.name ?? "بدون مجموعه",
        href: `/notebooks/${notebook.id}`,
        matchedField: "name" as const,
      },
      score: getMatchedFieldScore("name", getMatchStrength(notebook.name, query)),
      updatedAt: notebook.updatedAt.getTime(),
    }))
    .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
    .slice(0, RESULTS_PER_TYPE)
    .map((entry) => entry.result);

  const groupResults = groups
    .map((group) => {
      const targetNotebook = group.notebooks[0];
      const targetPage = targetNotebook?.pages[0];

      return {
        result: {
          type: "group" as const,
          id: group.id,
          title: group.name,
          subtitle: targetNotebook
            ? targetPage
              ? "اولین نتیجه در صفحه‌های این مجموعه باز می‌شود"
              : "اولین زیرمجموعه این مجموعه باز می‌شود"
            : "این مجموعه هنوز زیرمجموعه‌ای ندارد",
          href: targetPage
            ? `/pages/${targetPage.id}`
            : targetNotebook
              ? `/notebooks/${targetNotebook.id}`
              : "/",
          matchedField: "name" as const,
        },
        score: getMatchedFieldScore("name", getMatchStrength(group.name, query)),
        updatedAt: group.updatedAt.getTime(),
      };
    })
    .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
    .slice(0, RESULTS_PER_TYPE)
    .map((entry) => entry.result);

  const attachmentResults = attachments
    .map((attachment) => ({
      result: {
        type: "attachment" as const,
        id: attachment.id,
        title: attachment.fileName,
        subtitle: `${attachment.page.title} / ${attachment.page.notebook.name}`,
        href: `/pages/${attachment.page.id}`,
        matchedField: "fileName" as const,
      },
      score: getMatchedFieldScore(
        "fileName",
        getMatchStrength(attachment.fileName, query),
      ),
      createdAt: attachment.createdAt.getTime(),
    }))
    .sort((left, right) => right.score - left.score || right.createdAt - left.createdAt)
    .slice(0, RESULTS_PER_TYPE)
    .map((entry) => entry.result);

  return {
    query,
    results: {
      page: pageResults,
      notebook: notebookResults,
      group: groupResults,
      attachment: attachmentResults,
    },
  };
}
