import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function createExample(page: Page) {
  await page.goto("/lab");
  await page.getByRole("button", { name: "جرّب مثال جاهز" }).click();
  await page.getByRole("button", { name: "راجع وأنشئ المهمة" }).click();
  await expect(
    page.getByRole("heading", { name: "راجع التفاصيل. أنت صاحب القرار." }),
  ).toBeVisible();
}
async function checkAccessibility(page: Page, selector: string) {
  await page.addScriptTag({
    path: resolve(process.cwd(), "node_modules/axe-core/axe.min.js"),
  });
  const violations = await page.evaluate(async (selector) => {
    const axe = (window as typeof window & { axe: typeof import("axe-core") })
      .axe;
    const result = await axe.run(document.querySelector(selector) as Element, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21aa"],
    });
    return result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    }));
  }, selector);
  expect(violations).toEqual([]);
}

test("intake → human approval → verified result → receipt → reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createExample(page);
  await expect(
    page.getByRole("button", { name: "أوافق، أنشئ المسودة" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "أوافق، أنشئ المسودة" }).click();
  await expect(
    page.getByRole("heading", { name: "تم الإنشاء، واتحققنا من النتيجة." }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "تنزيل إيصال JSON" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^wakeel-receipt-.*\.json$/,
  );
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.reload();
  await expect(page.locator(".wk-task-row")).toHaveCount(1);
  await expect(page.locator(".wk-task-row")).toContainText("مكتملة ومتحققة");
  await page.getByRole("button", { name: "مهامي", exact: true }).click();
  await page.getByRole("textbox", { name: "ابحث في المهام" }).fill("no-match");
  await expect(page.locator(".wk-task-row")).toHaveCount(0);
  await page.getByRole("textbox", { name: "ابحث في المهام" }).fill("");
  await expect(page.locator(".wk-task-row")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("rejecting a pending action never displays a success", async ({
  page,
}) => {
  await createExample(page);
  await page.getByRole("button", { name: "رفض الإجراء" }).click();
  await expect(page.locator(".wk-result")).toBeVisible();
  await expect(page.locator(".wk-result")).not.toHaveClass(/success/);
  await expect(
    page.getByRole("button", { name: "أوافق، أنشئ المسودة" }),
  ).toHaveCount(0);
});

test("cancel removes the pending approval", async ({ page }) => {
  await createExample(page);
  await page.getByRole("button", { name: "إلغاء المهمة", exact: true }).click();
  await expect(page.locator(".wk-result")).toContainText("ملغاة");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("unknown request is explicit, not silently converted to a fake success", async ({
  page,
}) => {
  await page.goto("/lab");
  await page
    .getByRole("textbox", { name: "اطلب من وكيل" })
    .fill("ابعت إيميل لكل العملاء");
  await page.getByRole("button", { name: "ابدأ المهمة", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "طلبك محتاج مهارة مش متصلة لسه." }),
  ).toBeVisible();
  await expect(page.locator(".wk-task-row")).toHaveCount(0);
});

test("RTL mobile layout, navigation and intake have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await page.getByRole("button", { name: "المهارات", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "لكل شغل، مهارة." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "جرّب المهارة" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await checkAccessibility(page, ".wk-dialog");
});

test("WCAG automated checks: workspace sections and form", async ({ page }) => {
  await page.goto("/lab");
  await checkAccessibility(page, ".wk-app");
  for (const label of [
    "مهامي",
    "الموافقات",
    "المهارات",
    "التطبيقات",
    "التفضيلات",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await checkAccessibility(page, ".wk-app");
  }
  await page.getByRole("button", { name: "مساحة العمل", exact: true }).click();
  await page.getByRole("button", { name: "جرّب مثال جاهز" }).click();
  await checkAccessibility(page, ".wk-dialog");
});

test("WCAG automated checks: approval and verified result", async ({
  page,
}) => {
  await createExample(page);
  await checkAccessibility(page, ".wk-dialog");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "أوافق، أنشئ المسودة" }).click();
  await expect(
    page.getByRole("heading", { name: "تم الإنشاء، واتحققنا من النتيجة." }),
  ).toBeVisible();
  await checkAccessibility(page, ".wk-dialog");
});

test("HTTP intake retries are idempotent, parameter changes conflict, and tenant reads are isolated", async ({
  request,
}) => {
  const tenant = crypto.randomUUID();
  const key = crypto.randomUUID();
  const headers = { "x-demo-tenant-id": tenant, "x-idempotency-key": key };
  const data = {
    customerId: "API-TEST",
    lines: [{ description: "Fixture", quantity: 1, unitPrice: 25 }],
  };
  const first = await request.post("/api/demo/invoice-task", { headers, data });
  expect(first.status()).toBe(201);
  const { task } = await first.json();
  const repeated = await request.post("/api/demo/invoice-task", {
    headers,
    data,
  });
  expect(repeated.status()).toBe(200);
  expect((await repeated.json()).task.id).toBe(task.id);
  const conflict = await request.post("/api/demo/invoice-task", {
    headers,
    data: { ...data, customerId: "CHANGED" },
  });
  expect(conflict.status()).toBe(409);
  const other = await request.get(`/api/demo/invoice-task/${task.id}`, {
    headers: { "x-demo-tenant-id": crypto.randomUUID() },
  });
  expect(other.status()).toBe(404);
  const list = await request.get("/api/demo/invoice-task", { headers });
  expect((await list.json()).tasks).toHaveLength(1);
});
