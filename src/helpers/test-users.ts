import { credentials } from './test-users.local'

export type FcLogin = keyof typeof credentials

export interface TestUser {
  login: FcLogin
  password: string
  fcHash: string
}

export function getUser(login: FcLogin): TestUser {
  return { login, ...credentials[login] }
}
