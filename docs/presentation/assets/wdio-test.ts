import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import NotificationsInboxPage from '../pages/notifications.page'
import { publishNotification } from '../helpers/notifications-api'

describe('Notifications', () => {
  it("reçoit une notification dans l'inbox in-app", async () => {
    await LoginPage.tapFranceConnect()
    await FranceConnectPage.loginWithSandbox()
    await OnboardingNotificationsPage.dismiss()
    await HomePage.waitForSpaReady()

    await NotificationsInboxPage.openFromHome()
    const oldTop = await NotificationsInboxPage.getTopNotificationTitle()

    const title = `AMI-vanilla-${Date.now()}`
    await publishNotification({ title, body: "push non autorisé" })

    await NotificationsInboxPage.pullToRefresh()
    await NotificationsInboxPage.waitForNotification(title)
    expect(oldTop).not.toEqual(title)
  })
})
