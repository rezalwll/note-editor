"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from "@/lib/support";
import { sendSupportReplyEmail } from "@/lib/support-email";

export type SupportActionState = {
  error?: string;
  success?: string;
};

const ticketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(5000),
});

const replySchema = z.string().trim().min(2).max(5000);

export async function createSupportTicketAction(
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const user = await requireUser();
  const parsed = ticketSchema.safeParse({
    category: formData.get("category"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return {
      error: "موضوع، دسته‌بندی و توضیح حداقل ده‌حرفی را کامل وارد کنید.",
    };
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      category: parsed.data.category,
      subject: parsed.data.subject,
      messages: {
        create: {
          authorId: user.id,
          body: parsed.data.message,
          isStaff: false,
        },
      },
    },
    select: { id: true },
  });

  revalidatePath("/support");
  redirect(`/support/${ticket.id}`);
}

export async function addSupportReplyAction(
  ticketId: string,
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const user = await requireUser();
  const parsed = replySchema.safeParse(formData.get("message"));
  if (!parsed.success) {
    return { error: "پاسخ باید حداقل دو حرف داشته باشد." };
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId: user.id },
    select: { id: true },
  });
  if (!ticket) {
    return { error: "این درخواست پیدا نشد." };
  }

  await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorId: user.id,
        body: parsed.data,
        isStaff: false,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: "OPEN",
        lastMessageAt: new Date(),
      },
    }),
  ]);

  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  revalidatePath("/admin/support");
  return { success: "پاسخ شما ارسال شد." };
}

export async function resolveOwnSupportTicketAction(ticketId: string) {
  const user = await requireUser();
  await prisma.supportTicket.updateMany({
    where: { id: ticketId, userId: user.id },
    data: { status: "RESOLVED" },
  });
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
}

export async function addAdminSupportReplyAction(
  ticketId: string,
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const admin = await requireAdmin();
  const parsed = replySchema.safeParse(formData.get("message"));
  if (!parsed.success) {
    return { error: "متن پاسخ باید حداقل دو حرف داشته باشد." };
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: {
        select: { email: true, displayName: true },
      },
    },
  });
  if (!ticket) {
    return { error: "درخواست پیدا نشد." };
  }

  await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorId: admin.id,
        body: parsed.data,
        isStaff: true,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: "WAITING_ON_USER",
        lastMessageAt: new Date(),
      },
    }),
  ]);

  if (ticket.user.email) {
    try {
      await sendSupportReplyEmail({
        email: ticket.user.email,
        displayName: ticket.user.displayName,
        ticketId,
        subject: ticket.subject,
        reply: parsed.data,
      });
    } catch {
      // The reply is persisted even if optional email notification fails.
    }
  }

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/support/${ticketId}`);
  return { success: "پاسخ مدیر ثبت شد." };
}

export async function updateSupportTicketAction(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({
      ticketId: z.string().cuid(),
      status: z.enum(SUPPORT_STATUSES),
      priority: z.enum(SUPPORT_PRIORITIES),
    })
    .safeParse({
      ticketId: formData.get("ticketId"),
      status: formData.get("status"),
      priority: formData.get("priority"),
    });
  if (!parsed.success) {
    return;
  }

  await prisma.supportTicket.update({
    where: { id: parsed.data.ticketId },
    data: {
      status: parsed.data.status,
      priority: parsed.data.priority,
    },
  });
  revalidatePath(`/admin/support/${parsed.data.ticketId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/support/${parsed.data.ticketId}`);
}
