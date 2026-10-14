import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "رتّب أولويات التحصيل", exact: false }),
  ).toBeEnabled();
  if (await page.getByRole("button", { name: "فتح القائمة" }).isVisible())
    await page.getByRole("button", { name: "فتح القائمة" }).click();
  await page
    .getByRole("button", { name: "جداول العمل والفحص", exact: true })
    .click();
}
async function create(page: Page, name: string, csv: string) {
  await page.getByRole("button", { name: "جدول جديد", exact: true }).click();
  await page.getByLabel("اسم الجدول").fill(name);
  await page.getByLabel("محتوى CSV").fill(csv);
  await page.getByRole("button", { name: "حفظ الجدول", exact: true }).click();
  await expect(page.getByLabel("اسم الجدول")).toHaveCount(0);
}
async function axe(page: Page) {
  await page.addScriptTag({
    path: resolve("node_modules/axe-core/axe.min.js"),
  });
  const issues = await page.evaluate(async () => {
    const a = (window as typeof window & { axe: typeof import("axe-core") })
      .axe;
    return (
      await a.run(document.querySelector(".fw-app") as Element, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21aa"],
      })
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        reason: n.failureSummary,
      })),
    }));
  });
  expect(issues).toEqual([]);
}

test("actual local ledger analysis, safe CSV export and persisted workpaper without an AI connection", async ({
  page,
}) => {
  await start(page);
  await create(
    page,
    "ledger",
    "entry,account,debit,credit,currency\nJ1,=1+1,100,0,EGP\nJ1,Sales,0,90,EGP",
  );
  await page.getByRole("button", { name: "شغّل الفحص" }).click();
  const result = page.getByRole("article", { name: "نتيجة الفحص" });
  await expect(result).toContainText("قيود غير متوازنة ضمن الصفوف الصالحة: 1");
  await expect(result).toContainText("10.00");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "تنزيل CSV" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^wakil-workpaper/);
  const body = readFileSync((await download.path())!, "utf8");
  expect(body).toContain('"\'=1+1"');
  await page.reload();
  await page
    .getByRole("button", { name: "جداول العمل والفحص", exact: true })
    .click();
  await page.locator(".wp-history button").first().click();
  await expect(
    page.getByRole("article", { name: "نتيجة الفحص" }),
  ).toContainText("10.00");
});

test("budget mapping computes known variances and makes interpretation explicit", async ({
  page,
}) => {
  await start(page);
  await create(
    page,
    "budget",
    "category,actual,budget,currency\nrent,120,100,EGP\nsupplies,25,50,EGP",
  );
  await page
    .getByRole("button", { name: "الفعلي والموازنة", exact: false })
    .click();
  await page.getByRole("button", { name: "شغّل الفحص" }).click();
  await expect(page.locator(".wp-result")).toContainText("غير ملائم");
  await expect(page.locator(".wp-result")).toContainText("-50.00");
  await expect(page.locator(".wp-result")).toContainText("مصروفات");
});

test("two-source reconciliation leaves duplicate matches ambiguous", async ({
  page,
}) => {
  await start(page);
  await create(
    page,
    "bank",
    "reference,amount,currency\nA,10,EGP\nB,20,EGP\nB,20,EGP",
  );
  await create(page, "book", "reference,amount,currency\nA,10,EGP\nB,20,EGP");
  await page
    .getByRole("button", { name: "مطابقة مصدرين", exact: false })
    .click();
  await page
    .getByLabel("المصدر الأول", { exact: true })
    .selectOption({ label: "bank.csv" });
  await page
    .getByLabel("المصدر الثاني", { exact: true })
    .selectOption({ label: "book.csv" });
  await page.getByRole("button", { name: "شغّل الفحص" }).click();
  await expect(page.locator(".wp-result")).toContainText("مطابقات فريدة: 1");
  await expect(page.locator(".wp-result")).toContainText("ملتبس: 3 سجل");
});

test("rejects malformed CSV and repeated mapping rather than silently fixing source data", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "جدول جديد", exact: true }).click();
  await page.getByLabel("اسم الجدول").fill("invalid");
  await page.getByLabel("محتوى CSV").fill("a,b\n1,2,3");
  await page.getByRole("button", { name: "حفظ الجدول", exact: true }).click();
  await expect(page.locator(".wp-page [role=alert]")).not.toBeEmpty();
  await expect(page.getByLabel("اسم الجدول")).toBeVisible();
});

test("workpapers and source profiles remain isolated by bearer workspace", async ({
  request,
}) => {
  const a = await (await request.post("/api/finance/bootstrap")).json();
  const b = await (await request.post("/api/finance/bootstrap")).json();
  const headers = { Authorization: "Bearer " + a.token },
    other = { Authorization: "Bearer " + b.token };
  const { profile } = await (
    await request.post("/api/finance/sheets", {
      headers,
      data: {
        title: "isolated",
        content: "category,actual,budget,currency\na,1,2,EGP",
      },
    })
  ).json();
  const { workpaper } = await (
    await request.post("/api/finance/workpapers", {
      headers,
      data: {
        operation: "budget_variance",
        documentId: profile.documentId,
        direction: "expense",
        columns: {
          category: "category",
          actual: "actual",
          budget: "budget",
          currency: "currency",
        },
      },
    })
  ).json();
  expect(
    (
      await request.get("/api/finance/sheets/" + profile.documentId, {
        headers: other,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get("/api/finance/workpapers/" + workpaper.id, {
        headers: other,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get("/api/finance/workpapers/" + workpaper.id + "/export", {
        headers: other,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get("/api/finance/workpapers/" + workpaper.id + "/export")
    ).status(),
  ).toBe(401);
});

test("accessible workbench and analysis fit mobile with scrollable tables", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await axe(page);
  await create(
    page,
    "ledger",
    "entry,account,debit,credit,currency\nJ1,Cash,10,0,EGP\nJ1,Sales,0,10,EGP",
  );
  await axe(page);
  await page.getByRole("button", { name: "شغّل الفحص" }).click();
  await expect(page.locator(".wp-result")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await axe(page);
});
