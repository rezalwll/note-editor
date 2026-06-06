"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CirclePlus,
  Download,
  FileText,
  Menu,
  NotebookTabs,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createPageInlineAction } from "@/app/actions";
import { BrandLogo } from "@/components/brand-logo";
import { EditorToolbar } from "@/components/editor-toolbar";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { formatDate } from "@/lib/utils";

type MobileNotebook = {
  id: string;
  name: string;
  pages: Array<{
    id: string;
    title: string;
    updatedAt: Date;
  }>;
};

type MobileShellProps = {
  notebooks: MobileNotebook[];
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

export function MobileShell({ notebooks }: MobileShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeNotebook = useMemo(() => {
    const notebookMatch = pathname.match(/^\/notebooks\/([^/]+)/);
    if (notebookMatch) {
      return notebooks.find((notebook) => notebook.id === notebookMatch[1]) ?? notebooks[0];
    }

    const pageMatch = pathname.match(/^\/pages\/([^/]+)/);
    if (pageMatch) {
      return (
        notebooks.find((notebook) =>
          notebook.pages.some((page) => page.id === pageMatch[1]),
        ) ?? notebooks[0]
      );
    }

    return notebooks[0];
  }, [notebooks, pathname]);

  const activeTheme = activeNotebook
    ? getNotebookTheme(activeNotebook.id)
    : getNotebookTheme(notebooks[0]?.id ?? "default");

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isCreating]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function submitCreate() {
    const nextTitle = draftTitle.trim();

    if (!nextTitle || !activeNotebook) {
      setDraftTitle("");
      setIsCreating(false);
      return;
    }

    startTransition(async () => {
      const result = await createPageInlineAction(activeNotebook.id, nextTitle);

      if ("id" in result && result.id) {
        setDraftTitle("");
        setIsCreating(false);
        setPagesOpen(false);
        router.push(`/pages/${result.id}`);
        router.refresh();
      }
    });
  }

  async function handleInstall() {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    setInstallEvent(null);
  }

  function closeAll() {
    setSectionsOpen(false);
    setPagesOpen(false);
    setProfileOpen(false);
  }

  return (
    <div className="xl:hidden">
      <div className="sticky top-0 z-40 border-b border-[#d6dee8] bg-[#e8edf5]/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setSectionsOpen((current) => !current);
              setPagesOpen(false);
              setProfileOpen(false);
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d6dee8] bg-white text-[#3b556e] shadow-[0_3px_10px_rgba(15,23,42,0.08)]"
            aria-label="Open sections"
          >
            <Menu className="h-5 w-5" />
          </button>

          <BrandLogo
            frameClassName="h-7 w-[100px]"
            showWordmark={false}
          />

          <button
            type="button"
            onClick={() => {
              setProfileOpen((current) => !current);
              setSectionsOpen(false);
              setPagesOpen(false);
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d6dee8] bg-white text-[#3b556e] shadow-[0_3px_10px_rgba(15,23,42,0.08)]"
            aria-label="Open profile"
          >
            <UserRound className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-x-auto px-3 pb-2">
          <div className="min-w-max">
            <EditorToolbar />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d6dee8] bg-white/96 backdrop-blur">
        <div className="grid grid-cols-3 gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setSectionsOpen((current) => !current);
              setPagesOpen(false);
              setProfileOpen(false);
            }}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs text-[#44586b]"
          >
            <NotebookTabs className="h-5 w-5" />
            Sections
          </button>
          <button
            type="button"
            onClick={() => {
              setPagesOpen((current) => !current);
              setSectionsOpen(false);
              setProfileOpen(false);
            }}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs text-[#44586b]"
          >
            <FileText className="h-5 w-5" />
            Pages
          </button>
          <button
            type="button"
            onClick={() => {
              setProfileOpen((current) => !current);
              setSectionsOpen(false);
              setPagesOpen(false);
            }}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs text-[#44586b]"
          >
            <UserRound className="h-5 w-5" />
            Profile
          </button>
        </div>
      </div>

      {sectionsOpen ? (
        <div className="fixed inset-0 z-50 bg-black/20" onClick={closeAll}>
          <div
            className="absolute inset-x-0 top-0 max-h-[72vh] overflow-hidden rounded-b-[28px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e3e8ee] px-4 py-3">
              <div className="text-sm font-semibold text-[#213245]">Sections</div>
              <button type="button" onClick={closeAll} className="text-[#5b6b79]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-2 p-4">
              {notebooks.map((notebook) => {
                const theme = getNotebookTheme(notebook.id);
                return (
                  <Link
                    key={notebook.id}
                    href={`/notebooks/${notebook.id}`}
                    onClick={closeAll}
                    className="rounded-2xl border px-4 py-3 text-right text-sm shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
                    style={{
                      backgroundColor: theme.accentSoft,
                      borderColor: theme.editorBorder,
                      color: theme.sidebarText,
                    }}
                  >
                    {notebook.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {pagesOpen ? (
        <div className="fixed inset-0 z-50 bg-black/20" onClick={closeAll}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-[28px] shadow-[0_-24px_80px_rgba(15,23,42,0.22)]"
            style={{ backgroundColor: activeTheme.sidebarBg }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{
                borderColor: activeTheme.sidebarBorder,
                backgroundColor: activeTheme.sidebarHeaderBg,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setDraftTitle("");
                  setIsCreating(true);
                }}
                className="inline-flex items-center gap-2 text-sm"
                style={{ color: activeTheme.sidebarText }}
              >
                <CirclePlus className="h-4 w-4" />
                Add Page
              </button>
              <button type="button" onClick={closeAll} className="text-[#5b6b79]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {isCreating ? (
              <div className="border-b bg-white px-4 py-3" style={{ borderColor: activeTheme.sidebarBorder }}>
                <input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={submitCreate}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitCreate();
                    }
                  }}
                  disabled={isPending}
                  placeholder="Untitled Page"
                  className="w-full border-none bg-transparent text-right text-sm outline-none"
                  dir="rtl"
                />
              </div>
            ) : null}

            <div className="max-h-[58vh] overflow-y-auto">
              {activeNotebook?.pages.map((page) => {
                const isActive = pathname === `/pages/${page.id}`;

                return (
                  <Link
                    key={page.id}
                    href={`/pages/${page.id}`}
                    onClick={closeAll}
                    className="block border-b px-4 py-3 text-right"
                    style={{
                      borderColor: activeTheme.sidebarBorder,
                      backgroundColor: isActive ? activeTheme.sidebarActive : "transparent",
                    }}
                    dir="rtl"
                  >
                    <div className="text-sm" style={{ color: activeTheme.sidebarText }}>
                      {page.title}
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: activeTheme.sidebarMuted }}>
                      {formatDate(new Date(page.updatedAt))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="fixed inset-0 z-50 bg-black/20" onClick={closeAll}>
          <div
            className="absolute right-3 top-16 w-[260px] rounded-3xl border border-[#d9e1eb] bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1098c5] text-white">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[#1f2a37]">Mohammadreza Aziz</div>
                <div className="text-[11px] text-[#708090]">Personal notebook</div>
              </div>
            </div>

            {installEvent ? (
              <button
                type="button"
                onClick={handleInstall}
                className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#d6dee8] bg-[#f4f8fc] px-3 py-2 text-sm text-[#36506a]"
              >
                <Download className="h-4 w-4" />
                Install app
              </button>
            ) : null}

            <Link
              href="/settings/security"
              onClick={closeAll}
              className="mb-2 block rounded-2xl border border-[#d6dee8] px-3 py-2 text-center text-sm text-[#36506a]"
            >
              Security settings
            </Link>

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="block w-full rounded-2xl border border-[#d6dee8] px-3 py-2 text-sm text-[#36506a]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
