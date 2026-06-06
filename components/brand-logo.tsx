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
        className={`relative h-11 w-[138px] overflow-hidden ${frameClassName}`}
      >
        <Image
          src="/brand/notava-logo.png"
          alt="notava"
          fill
          priority={priority}
          className={`object-cover object-center scale-[1.72] ${imageClassName}`}
        />
      </div>
      {showWordmark ? (
        <span className={`sr-only ${wordmarkClassName}`}>notava</span>
      ) : null}
    </div>
  );
}
