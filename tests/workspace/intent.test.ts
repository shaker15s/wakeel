import { describe, expect, it } from "vitest";
import {
  classifyWorkspaceIntent,
  normalizeDigits,
} from "@/lib/workspace-intent";
describe("explicit local intent routing", () => {
  it.each(["اعمل فاتورة", "جهز الفواتير", "Create an INVOICE"])(
    "recognizes bounded invoice intake: %s",
    (text) => expect(classifyWorkspaceIntent(text)).toBe("invoice"),
  );
  it("does not claim arbitrary work is executable", () =>
    expect(classifyWorkspaceIntent("ابعت إيميل لكل العملاء")).toBe(
      "unsupported",
    ));
  it("routes summary and capability requests", () => {
    expect(classifyWorkspaceIntent("لخص مهامي")).toBe("summary");
    expect(classifyWorkspaceIntent("تقدر تعمل ايه")).toBe("capabilities");
  });
  it("normalizes Arabic and Persian digits", () =>
    expect(normalizeDigits("١٢٫۳")).toBe("12.3"));
});
