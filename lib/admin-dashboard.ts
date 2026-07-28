import { prisma } from "@/lib/prisma";

export async function getAdminDashboardData() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    userCount,
    newUsersSevenDays,
    activeUsersSevenDays,
    usageTotals,
    openTickets,
    dailyUsage,
    popularRoutes,
    recentTickets,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { lastSeenAt: { gte: sevenDaysAgo } } }),
    prisma.user.aggregate({
      _sum: { totalPageViews: true, totalActiveSeconds: true },
    }),
    prisma.supportTicket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"] } },
    }),
    prisma.userUsageDaily.groupBy({
      by: ["day"],
      where: { day: { gte: thirtyDaysAgo } },
      _sum: { pageViews: true, activeSeconds: true },
      _count: { userId: true },
      orderBy: { day: "asc" },
    }),
    prisma.routeUsageDaily.groupBy({
      by: ["path"],
      where: { day: { gte: thirtyDaysAgo } },
      _sum: { pageViews: true },
      orderBy: { _sum: { pageViews: "desc" } },
      take: 8,
    }),
    prisma.supportTicket.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      include: {
        user: { select: { displayName: true, username: true } },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  return {
    userCount,
    newUsersSevenDays,
    activeUsersSevenDays,
    totalPageViews: usageTotals._sum.totalPageViews ?? 0,
    totalActiveSeconds: usageTotals._sum.totalActiveSeconds ?? 0,
    openTickets,
    dailyUsage,
    popularRoutes,
    recentTickets,
  };
}
