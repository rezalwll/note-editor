"use client";

import type { RefObject } from "react";

import { useContextMenu } from "@/components/context-menu";

type NoteEditorHeaderProps = {
  accentColor: string;
  dateLabel: string;
  timeLabel: string;
  title: string;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  onCopyTitle: (text: string) => void | Promise<void>;
  onPasteTitle: (selectionStart: number, selectionEnd: number) => void;
};

export function NoteEditorHeader({
  accentColor,
  dateLabel,
  timeLabel,
  title,
  titleInputRef,
  onTitleChange,
  onTitleBlur,
  onCopyTitle,
  onPasteTitle,
}: NoteEditorHeaderProps) {
  const { openMenu } = useContextMenu();

  return (
    <div className="px-5 pt-7 text-right md:px-[48px] md:pt-6" dir="rtl">
      <div
        className="w-full border-b align-top"
        style={{ borderColor: accentColor }}
      >
        <input
          ref={titleInputRef}
          data-testid="page-title-input"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={onTitleBlur}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const selectionStart = event.currentTarget.selectionStart ?? 0;
            const selectionEnd =
              event.currentTarget.selectionEnd ?? selectionStart;
            const selectedText =
              selectionStart !== selectionEnd
                ? title.slice(selectionStart, selectionEnd)
                : title;

            openMenu(event, {
              title: "عنوان صفحه",
              items: [
                {
                  id: "copy-title",
                  label: "کپی",
                  disabled: !selectedText,
                  onSelect: () => onCopyTitle(selectedText),
                },
                {
                  id: "paste-title",
                  label: "پیست",
                  onSelect: () => onPasteTitle(selectionStart, selectionEnd),
                },
              ],
            });
          }}
          placeholder="صفحه بدون عنوان"
          className="mb-3 w-full border-none bg-transparent text-[30px] font-bold tracking-[-0.02em] text-[#23324d] outline-none placeholder:text-[#9b9faf] md:text-[22px] md:font-normal"
          dir="rtl"
          aria-label="عنوان صفحه"
        />
        <div className="flex flex-row-reverse gap-5 pb-2 text-[12px] text-[#8b92a3]">
          <span>{timeLabel}</span>
          <span>{dateLabel}</span>
        </div>
      </div>
    </div>
  );
}
