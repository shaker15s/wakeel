import type { Metadata } from "next";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
export const metadata: Metadata = {
  title: "وكيل — موظفك المالي",
  description:
    "ابدأ بطلبك. جلسات عمل تفهم الهدف، تراجع المستندات، تخطط وتستخدم أدوات الحساب وOdoo تحت إشرافك.",
};
export default function Home() {
  return <FinanceWorkspace />;
}
