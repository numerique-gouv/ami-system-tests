class NotificationsInboxPage {
  async openFromHome(): Promise<void> {
    await withWebView(async () => {
      const bell = await tl().getByRole('link', { name: /notifications/i })
      await bell.click()
      // fallback iOS : WKWebView ne navigue pas toujours via WKRDP
      await driver.execute(() => { window.location.hash = '/notifications' })
    })
  }

  async pullToRefresh(): Promise<void> {
    await withWebView(async () => {
      await driver.execute(() => { window.location.reload() })
    })
  }

  async waitForNotification(title: string): Promise<void> {
    await withWebView(async () => {
      await tl().findByText(title, {}, { timeout: 20000 })
    })
  }
}
