import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test.describe('default browser cookie clearing', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
  })

  test('remains available after clearing the default profile cookies', async ({ orcaPage }) => {
    await orcaPage.evaluate(() => {
      const state = window.__store!.getState()
      state.openSettingsTarget({ pane: 'browser', repoId: null })
      state.openSettingsPage()
    })

    const cookiesSection = orcaPage.locator('#browser-session-cookies')
    await expect(cookiesSection).toBeVisible({ timeout: 10_000 })

    const clearButton = cookiesSection.locator('[data-testid="clear-default-cookies-button"]')
    // Why: data-type="success" is locale-independent and specific to the success path.
    const successToasts = orcaPage.locator('[data-sonner-toast][data-type="success"]')

    await expect(clearButton).toBeEnabled()
    await clearButton.click()
    await expect(successToasts).toHaveCount(1, { timeout: 10_000 })
    await expect(clearButton).toBeEnabled()

    // Why: the regression left the button disabled after a successful clear
    // (#14678) — a single click can't catch that, so clear again. Compare
    // against the pre-click count rather than a fixed value, since the first
    // toast may have already auto-dismissed by the time this one appears.
    const successCountBeforeSecondClick = await successToasts.count()
    await clearButton.click()
    await expect
      .poll(() => successToasts.count(), { timeout: 10_000 })
      .toBeGreaterThan(successCountBeforeSecondClick)
    await expect(clearButton).toBeEnabled()
  })
})
