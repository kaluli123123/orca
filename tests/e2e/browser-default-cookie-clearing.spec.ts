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

    const clearButton = cookiesSection.locator('button').last()
    // Why: wait for the localized completion toast, not a hardcoded locale-specific string.
    const toasts = orcaPage.locator('[data-sonner-toast]')

    await expect(clearButton).toBeEnabled()
    await clearButton.click()
    await expect(toasts).toHaveCount(1, { timeout: 10_000 })
    await expect(clearButton).toBeEnabled()

    // Why: the regression left the button disabled after a successful clear
    // (#14678) — a single click can't catch that, so clear again.
    const toastCountBeforeSecondClick = await toasts.count()
    await clearButton.click()
    await expect
      .poll(() => toasts.count(), { timeout: 10_000 })
      .toBeGreaterThan(toastCountBeforeSecondClick)
    await expect(clearButton).toBeEnabled()
  })
})
