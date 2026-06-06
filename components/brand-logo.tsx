"use client";

import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  frameClassName?: string;
  imageClassName?: string;
  priority?: boolean;
  showWordmark?: boolean;
  wordmarkClassName?: string;
};

export function BrandLogo({
  className = "",
  frameClassName = "",
  imageClassName = "",
  priority = false,
  showWordmark = true,
  wordmarkClassName = "",
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className={`relative h-8 w-[124px] ${frameClassName}`}
      >
        <Image
          src="/brand/notava-logo.png"
          alt="notava"
          fill
          priority={priority}
          sizes="124px"
          className={`object-contain object-left ${imageClassName}`}
        />
      </div>
      {showWordmark ? (
        <span className={`sr-only ${wordmarkClassName}`}>notava</span>
      ) : null}
    </div>
  );
}
