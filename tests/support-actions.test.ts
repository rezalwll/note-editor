import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  ticketCreate: vi.fn(),
  ticketFindFirst: vi.fn(),
  ticketFindUnique: vi.fn(),
  ticketUpdate: vi.fn(),
  ticketUpdateMany: vi.fn(),
  messageCreate: vi.fn(),
  transaction: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/support-email", () => ({
  sendSupportReplyEmail: mocks.sendEmail,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: {
      create: mocks.ticketCreate,
      findFirst: mocks.ticketFindFirst,
      findUnique: mocks.ticketFindUnique,
      update: mocks.ticketUpdate,
      updateMany: mocks.ticketUpdateMany,
    },
    supportTicketMessage: {
      create: mocks.messageCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  addAdminSupportReplyAction,
  addSupportReplyAction,
  createSupportTicketAction,
  resolveOwnSupportTicketAction,
  updateSupportTicketAction,
} from "@/app/actions/support-actions";

const ticketId = "cm0000000000000000000001";

function ticketForm(overrides?: Record<string, string>) {
  const form = new FormData();
  form.set("category", overrides?.category ?? "BUG");
  form.set("subject", overrides?.subject ?? "مشکل در ویرایشگر");
  form.set(
    "message",
    overrides?.message ?? "شرح کامل و قابل بررسی مشکل کاربر",
  );
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1" });
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.ticketCreate.mockResolvedValue({ id: ticketId });
  mocks.ticketFindFirst.mockResolvedValue({ id: ticketId });
  mocks.ticketFindUnique.mockResolvedValue({
    id: ticketId,
    subject: "مشکل",
    user: { email: "user@example.com", displayName: "کاربر" },
  });
  mocks.ticketUpdate.mockResolvedValue({ id: ticketId });
  mocks.ticketUpdateMany.mockResolvedValue({ count: 1 });
  mocks.messageCreate.mockResolvedValue({ id: "message-1" });
  mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
    Promise.all(operations),
  );
  mocks.sendEmail.mockResolvedValue({ ok: true });
});

describe("support actions", () => {
  it("validates and creates a ticket with its first message", async () => {
    const invalid = ticketForm({ subject: "x", message: "کوتاه" });
    await expect(createSupportTicketAction({}, invalid)).resolves.toHaveProperty(
      "error",
    );
    expect(mocks.ticketCreate).not.toHaveBeenCalled();

    await createSupportTicketAction({}, ticketForm());
    expect(mocks.ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          category: "BUG",
          messages: {
            create: expect.objectContaining({
              authorId: "user-1",
              isStaff: false,
            }),
          },
        }),
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(`/support/${ticketId}`);
  });

  it("only lets the owner reply and reopens the request", async () => {
    const form = new FormData();
    form.set("message", "توضیح تکمیلی کاربر");

    mocks.ticketFindFirst.mockResolvedValueOnce(null);
    await expect(addSupportReplyAction(ticketId, {}, form)).resolves.toHaveProperty(
      "error",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.ticketFindFirst.mockResolvedValueOnce({ id: ticketId });
    await expect(addSupportReplyAction(ticketId, {}, form)).resolves.toHaveProperty(
      "success",
    );
    expect(mocks.ticketFindFirst).toHaveBeenLastCalledWith({
      where: { id: ticketId, userId: "user-1" },
      select: { id: true },
    });
    expect(mocks.ticketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "OPEN" }),
      }),
    );
  });

  it("allows the owner to mark a request as resolved", async () => {
    await resolveOwnSupportTicketAction(ticketId);
    expect(mocks.ticketUpdateMany).toHaveBeenCalledWith({
      where: { id: ticketId, userId: "user-1" },
      data: { status: "RESOLVED" },
    });
  });

  it("records an admin reply and sends an optional email notification", async () => {
    const form = new FormData();
    form.set("message", "پاسخ کامل تیم پشتیبانی");

    await expect(
      addAdminSupportReplyAction(ticketId, {}, form),
    ).resolves.toHaveProperty("success");
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: {
        ticketId,
        authorId: "admin-1",
        body: "پاسخ کامل تیم پشتیبانی",
        isStaff: true,
      },
    });
    expect(mocks.ticketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "WAITING_ON_USER" }),
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        ticketId,
      }),
    );
  });

  it("keeps a persisted admin reply when email delivery fails", async () => {
    const form = new FormData();
    form.set("message", "پاسخ ثبت‌شده مدیر");
    mocks.sendEmail.mockRejectedValueOnce(new Error("mail unavailable"));

    await expect(
      addAdminSupportReplyAction(ticketId, {}, form),
    ).resolves.toHaveProperty("success");
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("updates status and priority only with valid admin input", async () => {
    const invalid = new FormData();
    invalid.set("ticketId", "bad-id");
    invalid.set("status", "UNKNOWN");
    invalid.set("priority", "NORMAL");
    await updateSupportTicketAction(invalid);
    expect(mocks.ticketUpdate).not.toHaveBeenCalled();

    const valid = new FormData();
    valid.set("ticketId", ticketId);
    valid.set("status", "IN_PROGRESS");
    valid.set("priority", "HIGH");
    await updateSupportTicketAction(valid);
    expect(mocks.ticketUpdate).toHaveBeenCalledWith({
      where: { id: ticketId },
      data: { status: "IN_PROGRESS", priority: "HIGH" },
    });
  });
});
