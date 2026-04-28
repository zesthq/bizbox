import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * E2E: Otto Agent adapter configuration.
 *
 * Tests that the "Adapter Configuration" section appears for non-local
 * adapters (otto_agent) and shows Gateway URL + API Key fields.
 */

const BASE = process.env.PAPERCLIP_E2E_BASE_URL ?? "http://127.0.0.1:3104";

async function createCompany(
  request: APIRequestContext,
  name: string
): Promise<{ companyId: string; prefix: string }> {
  const createRes = await request.post(`${BASE}/api/companies`, {
    data: { name },
  });

  if (!createRes.ok()) {
    const errText = await createRes.text();
    throw new Error(
      `Failed to create company (${createRes.status()}): ${errText}`
    );
  }

  const company = await createRes.json();
  return {
    companyId: company.id,
    prefix: company.issuePrefix ?? company.id,
  };
}

test.describe("Otto Agent Configuration UI", () => {
  let companyId: string;

  test.beforeAll(async ({ request }) => {
    const result = await createCompany(
      request,
      `Otto-E2E-${Date.now()}`
    );
    companyId = result.companyId;
  });

  test("shows Adapter Configuration section for otto_agent", async ({ page }) => {
    // Navigate to new agent page with company context
    await page.goto(`${BASE}/agents/new?companyId=${companyId}`);

    // Wait for page to load
    await expect(page.locator("h1", { hasText: "New Agent" })).toBeVisible({
      timeout: 10_000,
    });

    // Fill in agent name
    const nameInput = page.locator('input[placeholder="Agent name"]');
    await nameInput.fill("Test Otto Agent");

    // Find and click adapter type dropdown
    // The AgentConfigForm has an adapter type selector
    const adapterTypeButton = page.locator("button").filter({ hasText: /Adapter Type|Claude Code/i }).first();
    await adapterTypeButton.click({ timeout: 5_000 });

    // Select Otto Agent from dropdown
    const ottoOption = page.locator("button, [role=option]").filter({ hasText: "Otto Agent" });
    await ottoOption.click({ timeout: 5_000 });

    // Wait for adapter configuration section to appear
    await expect(
      page.locator("h3, div").filter({ hasText: "Adapter Configuration" }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify Gateway URL field exists
    const gatewayInput = page.locator('input').filter({
      hasText: /(gateway|https:\/\/)/i
    }).or(
      page.locator('input[placeholder*="gateway"]')
    ).or(
      page.locator('input[placeholder*="https://"]')
    ).first();

    await expect(gatewayInput).toBeVisible({ timeout: 5_000 });

    // Verify API Key field exists (password input)
    const apiKeyInput = page.locator('input[type="password"]').first();
    await expect(apiKeyInput).toBeVisible({ timeout: 5_000 });

    // Take screenshot for verification
    await page.screenshot({
      path: "artifacts/otto-agent-adapter-config.png",
      fullPage: true
    });
  });

  test("does not show Adapter Configuration for local adapters", async ({ page }) => {
    // Navigate to new agent page
    await page.goto(`${BASE}/agents/new?companyId=${companyId}`);

    await expect(page.locator("h1", { hasText: "New Agent" })).toBeVisible({
      timeout: 10_000,
    });

    // Fill in agent name
    const nameInput = page.locator('input[placeholder="Agent name"]');
    await nameInput.fill("Test Local Agent");

    // The default adapter (claude_local / Claude Code) should be selected
    // Wait for form to stabilize
    await page.waitForTimeout(1000);

    // Verify "Adapter Configuration" section does NOT appear
    const adapterConfigHeading = page.locator("h3, div").filter({
      hasText: /^Adapter Configuration$/
    });
    await expect(adapterConfigHeading).not.toBeVisible();

    // Instead, "Permissions & Configuration" should appear for local adapters
    const permissionsHeading = page.locator("h3, div").filter({
      hasText: /Permissions.*Configuration/
    }).first();
    await expect(permissionsHeading).toBeVisible({ timeout: 5_000 });

    // Take screenshot for comparison
    await page.screenshot({
      path: "artifacts/local-adapter-permissions-config.png",
      fullPage: true
    });
  });
});
