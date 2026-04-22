import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Company Skills flow.
 *
 * Covers:
 *   1. Create a company (via API for setup)
 *   2. Navigate to Skills page via UI
 *   3. Create skills via UI
 *   4. Delete skills via UI
 *   5. Test delete → re-create lifecycle with same slug (bug fix verification)
 */

const TEST_SUFFIX = Date.now();
const COMPANY_NAME = `E2E Skills ${TEST_SUFFIX}`;
const SKILL_NAME = `E2E Test Skill ${TEST_SUFFIX}`;
const SKILL_SLUG = `e2e-test-skill-${TEST_SUFFIX}`;
const SKILL_DESCRIPTION = `A test skill created by E2E automation ${TEST_SUFFIX}`;
const IMPORTED_SKILL_SLUG = "doc-maintenance";
const IMPORTED_SKILL_SOURCE =
  "https://github.com/zesthq/bizbox/tree/master/.agents/skills/doc-maintenance";

type Company = {
  id: string;
  prefix: string;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Company Skills", () => {
  let company!: Company;
  let companyIdForCleanup: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Navigate to root to initialize page context, then create company via API
    await page.goto("/");

    const createRes = await page.request.post("/api/companies", {
      data: { name: COMPANY_NAME },
    });

    if (!createRes.ok()) {
      const errText = await createRes.text();
      throw new Error(`Failed to create company (${createRes.status()}): ${errText}`);
    }

    const companyData = await createRes.json();
    company = {
      id: companyData.id,
      prefix: companyData.issuePrefix ?? companyData.id,
    };
    companyIdForCleanup = company.id;

    // The UI company list is loaded before this out-of-band API setup runs.
    // Reload so route-prefix resolution and company-scoped queries target the
    // newly created company instead of stale client state.
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async ({ page }) => {
    if (!companyIdForCleanup) {
      return;
    }

    await page.request.delete(`/api/companies/${companyIdForCleanup}`);
    companyIdForCleanup = null;
  });

  test("supports skill delete → re-import lifecycle with same slug", async ({ page }) => {
    // This test verifies the fix for the duplicate key constraint bug
    // that occurred when re-importing a skill with the same slug after deletion.

    // Navigate to Skills page
    await page.goto(`/${company.prefix}/skills`);
    await page.waitForLoadState("networkidle");

    const mainContent = page.locator("#main-content");
    const skillsSidebar = mainContent.locator("aside");

    await expect(
      skillsSidebar.getByRole("heading", { name: "Skills", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Step 1: Import skill via UI
    // The import UI has an input field with placeholder "Paste path, GitHub URL, or skills.sh command"
    // and an "Add" button next to it
    const sourceInput = skillsSidebar.getByPlaceholder(/Paste path, GitHub URL, or skills\.sh command/i);
    await expect(sourceInput).toBeVisible({ timeout: 5_000 });
    await expect(sourceInput).toBeEditable({ timeout: 5_000 });
    await sourceInput.fill(IMPORTED_SKILL_SOURCE);

    const addButton = skillsSidebar.getByRole("button", { name: "Add" });
    await expect(addButton).toBeVisible({ timeout: 5_000 });
    await expect(addButton).toBeEnabled({ timeout: 5_000 });
    const detailUrlBeforeImport = page.url();
    await addButton.click();

    // The page may already be on another skill detail route before import.
    // Wait for the imported skill title and a URL change before capturing the id.
    await expect(
      mainContent.getByRole("heading", { level: 1, name: IMPORTED_SKILL_SLUG, exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => page.url(), { timeout: 15_000 }).not.toBe(detailUrlBeforeImport);
    await expect(page).toHaveURL(new RegExp(`/${company.prefix}/skills/[0-9a-f-]+$`), {
      timeout: 15_000,
    });

    // Extract skill ID from URL
    const skillUrl1 = page.url();
    const skillId1 = skillUrl1.split("/").pop();

    // Step 2: Delete the imported skill via UI
    const removeButton = mainContent.locator('button:has-text("Remove")');
    await expect(removeButton).toBeVisible({ timeout: 5_000 });
    await expect(removeButton).toBeEnabled({ timeout: 5_000 });
    await removeButton.click();

    // Confirm deletion in the dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const confirmButton = dialog.locator('button:has-text("Remove skill")');
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });
    await confirmButton.click();

    // Wait for dialog to close and deletion to complete
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Wait for network to settle after deletion
    await page.waitForLoadState('networkidle');

    // Navigate back to skills list
    await page.goto(`/${company.prefix}/skills`);
    await page.waitForLoadState("networkidle");

    // Ensure the skills sidebar is loaded before proceeding
    await expect(
      skillsSidebar.getByRole("heading", { name: "Skills", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    
    // Verify via API that the skill was actually deleted
    const skillsAfterDelete = await page.request.get(
      `/api/companies/${company.id}/skills`
    );
    expect(skillsAfterDelete.ok()).toBe(true);
    const skillsListAfterDelete = await skillsAfterDelete.json();
    const deletedSkillExists = skillsListAfterDelete.some(
      (s: { id: string }) => s.id === skillId1
    );
    expect(deletedSkillExists).toBe(false);

    // Step 3: Re-import the same skill source via UI
    // This would previously fail with duplicate key error
    // Ensure the input is ready, then fill it (fill() automatically clears first)
    await expect(sourceInput).toBeVisible({ timeout: 5_000 });
    await expect(sourceInput).toBeEditable({ timeout: 5_000 });
    await sourceInput.fill(IMPORTED_SKILL_SOURCE);

    await expect(addButton).toBeVisible({ timeout: 5_000 });
    await expect(addButton).toBeEnabled({ timeout: 5_000 });
    const detailUrlBeforeReimport = page.url();
    await addButton.click();
    
    await expect(
      mainContent.getByRole("heading", { level: 1, name: IMPORTED_SKILL_SLUG, exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => page.url(), { timeout: 15_000 }).not.toBe(detailUrlBeforeReimport);
    await expect(page).toHaveURL(new RegExp(`/${company.prefix}/skills/[0-9a-f-]+$`), {
      timeout: 15_000,
    });
    
    const skillUrl2 = page.url();
    const skillId2 = skillUrl2.split("/").pop();
    
    // Verify different skill ID (new import creates new record)
    expect(skillId2).not.toBe(skillId1);

    // Verify the imported skill exists and is the new one
    const allSkillsRes = await page.request.get(
      `/api/companies/${company.id}/skills`
    );
    expect(allSkillsRes.ok()).toBe(true);
    const allSkills = await allSkillsRes.json();
    const importedSkills = allSkills.filter(
      (s: { slug: string }) => s.slug === IMPORTED_SKILL_SLUG
    );
    expect(importedSkills.length).toBe(1);
    expect(importedSkills[0].id).toBe(skillId2);
  });

  test("creates a new skill via the form", async ({ page }) => {
    await page.goto(`/${company.prefix}/skills`);
    await page.waitForLoadState("networkidle");

    const mainContent = page.locator("#main-content");
    const skillsSidebar = mainContent.locator("aside");

    await expect(
      skillsSidebar.getByRole("heading", { name: "Skills", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await skillsSidebar.locator("button:has(svg.lucide-plus)").click();

    const nameInput = skillsSidebar.getByPlaceholder("Skill name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(SKILL_NAME);

    const slugInput = skillsSidebar.getByPlaceholder("optional-shortname");
    await slugInput.fill(SKILL_SLUG);

    const descriptionInput = skillsSidebar.getByPlaceholder("Short description");
    await descriptionInput.fill(SKILL_DESCRIPTION);

    await skillsSidebar.getByRole("button", { name: "Create skill" }).click();

    await expect(page).toHaveURL(new RegExp(`/${company.prefix}/skills/[0-9a-f-]+$`), {
      timeout: 10_000,
    });

    await expect(
      mainContent.getByRole("button", { name: "Edit" })
    ).toBeVisible();
    await expect(
      mainContent.getByText("SKILL.md", { exact: true }).first()
    ).toBeVisible();

    const skillsRes = await page.request.get(`/api/companies/${company.id}/skills`);
    expect(skillsRes.ok()).toBe(true);
    const skills = await skillsRes.json();

    const createdSkill = skills.find(
      (skill: { name: string }) => skill.name === SKILL_NAME
    );
    expect(createdSkill).toBeTruthy();
    expect(createdSkill.slug).toBe(SKILL_SLUG);
    expect(createdSkill.description).toBe(SKILL_DESCRIPTION);
    expect(createdSkill.editable).toBe(true);
    expect(createdSkill.sourceType).toBe("local_path");

    const detailRes = await page.request.get(
      `/api/companies/${company.id}/skills/${createdSkill.id}`
    );
    expect(detailRes.ok()).toBe(true);
    const detail = await detailRes.json();

    expect(detail.name).toBe(SKILL_NAME);
    expect(detail.slug).toBe(SKILL_SLUG);
    expect(detail.description).toBe(SKILL_DESCRIPTION);
    expect(detail.editable).toBe(true);
    expect(detail.sourceType).toBe("local_path");
    expect(detail.sourceLocator).toBeTruthy();

    const fileRes = await page.request.get(
      `/api/companies/${company.id}/skills/${createdSkill.id}/files?path=${encodeURIComponent("SKILL.md")}`
    );
    expect(fileRes.ok()).toBe(true);
    const file = await fileRes.json();

    expect(file.path).toBe("SKILL.md");
    expect(file.markdown).toBe(true);
    expect(file.editable).toBe(true);
    expect(file.content).toContain(`name: ${SKILL_NAME}`);
    expect(file.content).toContain(`description: ${SKILL_DESCRIPTION}`);
    expect(file.content).toContain(`# ${SKILL_NAME}`);
  });
});
