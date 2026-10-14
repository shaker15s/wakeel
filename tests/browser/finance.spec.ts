import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "رتّب أولويات التحصيل", exact: false }),
  ).toBeEnabled();
}
async function axe(page: Page, selector = ".fw-app") {
  await page.addScriptTag({
    path: resolve(process.cwd(), "node_modules/axe-core/axe.min.js"),
  });
  const issues = await page.evaluate(async (selector) => {
    const a = (window as typeof window & { axe: typeof import("axe-core") })
      .axe;
    return (
      await a.run(document.querySelector(selector) as Element, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21aa"],
      })
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    }));
  }, selector);
  expect(issues).toEqual([]);
}

test("home starts a free-form session, not an invoice form; missing model blocks honestly and request survives reload", async ({
  page,
}) => {
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "أهلًا بيك. نشتغل على إيه النهارده؟" }),
  ).toBeVisible();
  const request =
    "راجع حسابات العملاء، واقرأ سياسة التحصيل، وقسم المطلوب لمهام صغيرة مع الحسابات.";
  await page.getByRole("textbox", { name: "رسالتك لوكيل" }).fill(request);
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page).toHaveURL(/\?session=/);
  await expect(page.locator(".fw-user-message")).toContainText(request);
  await expect(page.locator(".fw-answer")).toContainText(
    "اربط نموذج الذكاء الاصطناعي",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".fw-user-message")).toContainText(request);
  await expect(page.locator(".fw-answer")).toContainText("حفظت طلبك");
  await page
    .getByRole("button", { name: "فعّل محرك الذكاء وكمّل نفس الطلب" })
    .click();
  await expect(
    page.getByRole("heading", { name: "وصّل السياق بالقدرة." }),
  ).toBeVisible();
  await expect(page.locator('input[name="apiKey"]').first()).toHaveAttribute(
    "type",
    "password",
  );
});

test("saved policy can be reviewed and is available across sessions", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "الذاكرة والمستندات", exact: true })
    .click();
  await page.getByRole("button", { name: "حفظ معلومة" }).click();
  await page.getByLabel("عنوان المعلومة").fill("سياسة التحصيل");
  await page
    .getByLabel("المحتوى")
    .fill("تُراجع المديونيات أسبوعيًا. أي شطب يحتاج موافقة المدير المالي.");
  await page.getByRole("button", { name: "احفظ في الذاكرة" }).click();
  await expect(page.locator(".fw-doc-list")).toContainText("سياسة التحصيل");
  await page.getByRole("button", { name: /سياسة التحصيل سياسة/ }).click();
  await expect(page.getByRole("dialog")).toContainText("أي شطب يحتاج موافقة");
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page
    .getByRole("button", { name: "جلسة جديدة", exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "رسالتك لوكيل" })
    .fill("راجع سياسة التحصيل");
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.locator(".fw-source-chips")).toContainText("سياسة التحصيل");
});

test("uploads CSV to persistent memory and attaches it to the next conversation", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "expenses.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("category,amount,currency\nrent,100,EGP"),
    });
  await expect(page.locator(".fw-attachments")).toContainText("expenses.csv");
  await page
    .getByRole("textbox", { name: "رسالتك لوكيل" })
    .fill("حلل الملف المرفق");
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.locator(".fw-source-chips")).toContainText("expenses.csv");
});

test("new workspace tokens cannot read other sessions or documents", async ({
  request,
}) => {
  const a = await (await request.post("/api/finance/bootstrap")).json();
  const b = await (await request.post("/api/finance/bootstrap")).json();
  const authA = { Authorization: `Bearer ${a.token}` },
    authB = { Authorization: `Bearer ${b.token}` };
  const { session } = await (
    await request.post("/api/finance/sessions", {
      headers: authA,
      data: { title: "private" },
    })
  ).json();
  expect(
    (
      await request.get("/api/finance/sessions/" + session.id, {
        headers: authB,
      })
    ).status(),
  ).toBe(404);
  const { document } = await (
    await request.post("/api/finance/documents", {
      headers: authA,
      data: { title: "policy", content: "private", kind: "policy" },
    })
  ).json();
  expect(
    (
      await request.get("/api/finance/documents/" + document.id, {
        headers: authB,
      })
    ).status(),
  ).toBe(404);
  expect((await request.get("/api/finance/status")).status()).toBe(401);
});

test("mobile greeting, session and connections fit the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "رتّب أولويات التحصيل", exact: false })
    .click();
  await expect(page.locator(".fw-answer")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await page.getByRole("button", { name: "الاتصالات", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "وصّل السياق بالقدرة." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("accessible home, memory, connections, session and knowledge dialog", async ({
  page,
}) => {
  await ready(page);
  await axe(page);
  await page
    .getByRole("button", { name: "الذاكرة والمستندات", exact: true })
    .click();
  await axe(page);
  await page.getByRole("button", { name: "حفظ معلومة" }).click();
  await axe(page, ".fw-modal");
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByRole("button", { name: "الاتصالات", exact: true }).click();
  await axe(page);
  await page
    .getByRole("button", { name: "جلسة جديدة", exact: false })
    .first()
    .click();
  await page.getByRole("textbox", { name: "رسالتك لوكيل" }).fill("حلل حساباتي");
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.locator(".fw-answer")).toBeVisible();
  await axe(page);
});
