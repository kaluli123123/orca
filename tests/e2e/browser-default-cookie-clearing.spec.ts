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
    await expect(clearButton).toBeEnabled()
    await clearButton.click()
    // Why: the success toast text is localized (BrowserProfileRow only calls
    // toast.success on this path, never toast.error), so waiting for any toast
    // proves the async clear settled without asserting a locale-specific string.
    await expect(orcaPage.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10_000 })
    await expect(clearButton).toBeEnabled()
  })
})
