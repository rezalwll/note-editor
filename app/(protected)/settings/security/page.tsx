import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSectionDocumentTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("امنیت"),
};

export default function SecurityPage() {
  redirect("/settings");
}
