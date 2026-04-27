import type { Metadata } from "next";
import ShareCreateClient from "@/components/ShareCreateClient";

export const metadata: Metadata = {
  title: "Share session",
  description: "Create a consent-based live location sharing invite.",
};

export default function ShareCreatePage() {
  return <ShareCreateClient />;
}
