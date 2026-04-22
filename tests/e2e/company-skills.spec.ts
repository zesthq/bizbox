import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * E2E: Company Skills flow.
 *
 * Covers:
 *   1. Create an isolated company for the test
 *   2. Open the company Skills page
 *   3. Create a local editable skill from the sidebar form
 *   4. Verify the detail pane opens for the new skill
 *   5. Verify the skill exists through the company skills API
 *   6. Verify the generated SKILL.md content
 */

const STORAGE_KEY = "paperclip.selectedCompanyId";
const TEST_SUFFIX = Date.now();
const COMPANY_NAME = `E2E Skills ${TEST_SUFFIX}`;
const SKILL_NAME = `E2E Test Skill ${TEST_SUFFIX}`;
const SKILL_SLUG = `e2e-test-skill-${TEST_SUFFIX}`;
const SKILL_DESCRIPTION = `A test skill created by E2E automation ${TEST_SUFFIX}`;

type CreatedCompany = {
  id: string;
  issuePrefix: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createCompany(
  request: APIRequestContext,
  name: string
): Promise<CreatedCompany> {
  const companyRes = await request.post("/api/companies", {
    data: { name },
  });
  if (!companyRes.ok()) {
    const errText = await companyRes.text();
    throw new Error(
      `Failed to create company (${companyRes.status()}): ${errText}`
    );
  }

  const company = await companyRes.json();
  return {
    id: company.id,
    issuePrefix: company.issuePrefix,
  };
}

async function selectCompany(page: Page, companyId: string): Promise<void> {
  await page.addInitScript(
    ([storageKey, selectedCompanyId]) => {
      window.localStorage.setItem(storageKey, selectedCompanyId);
    },
    [STORAGE_KEY, companyId]
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Company Skills", () => {
  test("creates a new skill via the form", async ({ page }) => {
    const company = await createCompany(page.request, COMPANY_NAME);
    await selectCompany(page, company.id);

    await page.goto(`/${company.issuePrefix}/skills`);

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

    await expect(page).toHaveURL(new RegExp(`/${company.issuePrefix}/skills/[0-9a-f-]+$`), {
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
