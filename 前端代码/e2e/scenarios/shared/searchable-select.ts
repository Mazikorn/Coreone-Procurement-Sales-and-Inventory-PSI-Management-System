import { Page } from '@playwright/test'

/**
 * Interact with a SearchableSelect component by its data-testid.
 * Opens the dropdown, optionally searches, and selects an option by label text.
 */
export async function selectSearchableOption(
  page: Page,
  testId: string,
  optionLabel: string
) {
  const container = page.locator(`[data-testid="${testId}"]`)
  // Click to open dropdown
  await container.click()
  // Wait for dropdown options to appear (scoped to container)
  const dropdown = container.locator('ul')
  await dropdown.waitFor({ state: 'visible', timeout: 5000 })
  // Click the option with matching label (scoped to dropdown)
  const option = dropdown.locator(`li:has-text("${optionLabel}")`)
  await option.first().click()
}

/**
 * Interact with a SearchableSelect by selecting the first available option.
 */
export async function selectFirstSearchableOption(
  page: Page,
  testId: string
) {
  const container = page.locator(`[data-testid="${testId}"]`)
  await container.click()
  // Wait for dropdown options to appear (scoped to container)
  const dropdown = container.locator('ul')
  await dropdown.waitFor({ state: 'visible', timeout: 5000 })
  // Select first option (scoped to container's dropdown)
  const firstOption = dropdown.locator('li').first()
  await firstOption.click()
}
