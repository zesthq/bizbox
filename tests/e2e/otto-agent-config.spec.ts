import { test, expect } from "@playwright/test";

/**
 * E2E: Otto Agent adapter configuration.
 *
 * Tests the otto_agent adapter configuration UI:
 *   - Adapter Configuration section appears for non-local adapters
 *   - Gateway URL and API Key fields are visible and functional
 *   - Configuration persists after save
 *   - Edit mode displays saved values correctly
 */

const AGENT_NAME = `Otto-Test-${Date.now()}`;
const GATEWAY_URL = "https://test-gateway.example.com/api/paperclip";
const API_KEY = "test-api-key-12345";

test.describe("Otto Agent Configuration", () => {
  test("shows adapter configuration fields for otto_agent", async ({ page }) => {
    // Navigate to agent creation page
    await page.goto("/agents/new");

    // Wait for page to load
    await expect(page.locator("h1", { hasText: /Create Agent|New Agent/i })).toBeVisible({
      timeout: 10_000,
    });

    // Fill in agent name
    const agentNameInput = page.locator('input[placeholder*="Agent name"]').or(
      page.locator('input[name="name"]')
    );
    await agentNameInput.fill(AGENT_NAME);

    // Select otto_agent adapter type
    // Look for adapter type dropdown or button
    const adapterDropdown = page.locator('[data-testid="adapter-type-select"]').or(
      page.locator('select').filter({ hasText: /Adapter|Type/i })
    ).or(
      page.getByLabel(/Adapter Type/i)
    );

    // If it's a dropdown/select
    if (await adapterDropdown.count() > 0) {
      await adapterDropdown.click();
      await page.locator('option', { hasText: "Otto Agent" }).or(
        page.getByRole('option', { name: /Otto Agent/i })
      ).click();
    } else {
      // If it's buttons (like in onboarding)
      await page.getByRole("button", { name: /Otto Agent/i }).click();
    }

    // Wait for adapter configuration section to appear
    await expect(
      page.locator("h3", { hasText: "Adapter Configuration" }).or(
        page.locator('[data-testid="adapter-config-section"]')
      )
    ).toBeVisible({ timeout: 5_000 });

    // Verify Gateway URL field is visible
    const gatewayUrlInput = page.locator('input[placeholder*="gateway"]').or(
      page.locator('input[placeholder*="https://"]')
    ).first();
    await expect(gatewayUrlInput).toBeVisible();

    // Verify API Key field is visible (password field with show/hide toggle)
    const apiKeyInput = page.locator('input[type="password"]').or(
      page.locator('input[placeholder*="secret"]')
    ).or(
      page.locator('input[placeholder*="API"]')
    ).first();
    await expect(apiKeyInput).toBeVisible();

    // Fill in Gateway URL
    await gatewayUrlInput.fill(GATEWAY_URL);

    // Fill in API Key
    await apiKeyInput.fill(API_KEY);

    // Verify show/hide password toggle exists
    const toggleButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    if (await toggleButton.count() > 0) {
      // Click to show password
      await toggleButton.click();
      // Verify input type changed to text
      const inputType = await apiKeyInput.getAttribute("type");
      expect(inputType).toBe("text");

      // Click to hide again
      await toggleButton.click();
      const hiddenType = await apiKeyInput.getAttribute("type");
      expect(hiddenType).toBe("password");
    }

    // Save the agent
    const saveButton = page.getByRole("button", { name: /Create|Save/i });
    await saveButton.click();

    // Wait for save to complete (redirect or success message)
    await page.waitForURL(/\/agents\/.*/, { timeout: 10_000 }).catch(() => {
      // If no redirect, look for success message
      return expect(
        page.locator('[data-testid="success-message"]').or(
          page.locator('text=/created|saved/i')
        )
      ).toBeVisible({ timeout: 5_000 });
    });

    // Take screenshot of created agent
    await page.screenshot({ path: "artifacts/otto-agent-created.png" });
  });

  test("displays saved configuration in edit mode", async ({ page, context }) => {
    // First, create an agent with configuration
    await page.goto("/agents/new");

    const agentNameInput = page.locator('input[placeholder*="Agent name"]').or(
      page.locator('input[name="name"]')
    );
    await agentNameInput.fill(AGENT_NAME + "-edit");

    // Select otto_agent
    const adapterDropdown = page.locator('[data-testid="adapter-type-select"]').or(
      page.getByLabel(/Adapter Type/i)
    );
    if (await adapterDropdown.count() > 0) {
      await adapterDropdown.click();
      await page.locator('option', { hasText: "Otto Agent" }).click();
    } else {
      await page.getByRole("button", { name: /Otto Agent/i }).click();
    }

    // Fill in configuration
    const gatewayUrlInput = page.locator('input[placeholder*="gateway"]').first();
    await gatewayUrlInput.fill(GATEWAY_URL);

    const apiKeyInput = page.locator('input[type="password"]').first();
    await apiKeyInput.fill(API_KEY);

    // Save
    await page.getByRole("button", { name: /Create|Save/i }).click();
    await page.waitForURL(/\/agents\/.*/, { timeout: 10_000 });

    // Extract agent ID from URL
    const url = page.url();
    const agentId = url.match(/\/agents\/([^\/]+)/)?.[1];

    if (!agentId) {
      test.fail(true, "Could not extract agent ID from URL");
      return;
    }

    // Navigate to edit page
    await page.goto(`/agents/${agentId}/edit`);

    // Wait for edit form to load
    await expect(
      page.locator("h1", { hasText: /Edit Agent/i }).or(
        page.locator('[data-testid="agent-edit-form"]')
      )
    ).toBeVisible({ timeout: 10_000 });

    // Verify Adapter Configuration section is visible
    await expect(
      page.locator("h3", { hasText: "Adapter Configuration" })
    ).toBeVisible();

    // Verify Gateway URL is populated
    const savedGatewayUrl = page.locator('input[placeholder*="gateway"]').first();
    await expect(savedGatewayUrl).toHaveValue(GATEWAY_URL);

    // Verify API Key is populated (will be password field)
    const savedApiKey = page.locator('input[type="password"]').first();
    await expect(savedApiKey).toHaveValue(API_KEY);

    // Take screenshot of edit mode
    await page.screenshot({ path: "artifacts/otto-agent-edit.png" });
  });

  test("does not show Adapter Configuration for local adapters", async ({ page }) => {
    await page.goto("/agents/new");

    const agentNameInput = page.locator('input[placeholder*="Agent name"]').or(
      page.locator('input[name="name"]')
    );
    await agentNameInput.fill("Local-Test-Agent");

    // Select a local adapter (e.g., Claude Code / claude_local)
    const adapterDropdown = page.locator('[data-testid="adapter-type-select"]').or(
      page.getByLabel(/Adapter Type/i)
    );

    if (await adapterDropdown.count() > 0) {
      await adapterDropdown.click();
      await page.locator('option', { hasText: /Claude.*Local|Claude Code/i }).first().click();
    } else {
      await page.getByRole("button", { name: /Claude.*Local|Claude Code/i }).first().click();
    }

    // Wait a moment for UI to update
    await page.waitForTimeout(1000);

    // Verify "Adapter Configuration" section does NOT appear
    const adapterConfigSection = page.locator("h3", { hasText: "Adapter Configuration" });
    await expect(adapterConfigSection).not.toBeVisible();

    // Instead, "Permissions & Configuration" should be visible for local adapters
    const permissionsSection = page.locator("h3", { hasText: "Permissions & Configuration" }).or(
      page.locator("div", { hasText: "Permissions & Configuration" })
    );
    await expect(permissionsSection).toBeVisible();

    // Take screenshot for comparison
    await page.screenshot({ path: "artifacts/local-adapter-config.png" });
  });

  test("validates required fields", async ({ page }) => {
    await page.goto("/agents/new");

    const agentNameInput = page.locator('input[placeholder*="Agent name"]').or(
      page.locator('input[name="name"]')
    );
    await agentNameInput.fill("Validation-Test-Agent");

    // Select otto_agent
    const adapterDropdown = page.locator('[data-testid="adapter-type-select"]').or(
      page.getByLabel(/Adapter Type/i)
    );
    if (await adapterDropdown.count() > 0) {
      await adapterDropdown.click();
      await page.locator('option', { hasText: "Otto Agent" }).click();
    } else {
      await page.getByRole("button", { name: /Otto Agent/i }).click();
    }

    // Try to save without filling in configuration
    const saveButton = page.getByRole("button", { name: /Create|Save/i });
    await saveButton.click();

    // Should show validation error or prevent save
    // Either URL changes back or error message appears
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const stillOnNewPage = currentUrl.includes("/agents/new") || currentUrl.includes("/new");

    if (stillOnNewPage) {
      // Good - validation prevented save
      expect(stillOnNewPage).toBe(true);
    } else {
      // Check for error message
      const errorMessage = page.locator('[role="alert"]').or(
        page.locator('text=/required|error/i')
      );
      await expect(errorMessage).toBeVisible({ timeout: 2000 });
    }

    await page.screenshot({ path: "artifacts/otto-agent-validation.png" });
  });
});
