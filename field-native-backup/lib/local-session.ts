import type { UserPayload } from './types'

/** Stored in SecureStore — never sent to the server. */
export const LOCAL_SESSION_TOKEN = '__local_field_admin_v1__'

const LOCAL_USER_ID = 'local-offline-admin'

export const LOCAL_ADMIN_USERNAME = 'admin.local'
export const LOCAL_ADMIN_PASSWORD = 'S3cr3t1009'

export function isLocalSessionToken(token: string | null | undefined): boolean {
  return Boolean(token && token === LOCAL_SESSION_TOKEN)
}

export function createLocalOfflineUser(): UserPayload {
  return {
    id: LOCAL_USER_ID,
    username: LOCAL_ADMIN_USERNAME,
    portalId: 'field',
    onboardingComplete: true,
    passwordMustChange: false,
    profile: {
      name: 'Local administrator',
      serviceNumber: null,
      phone: null,
      pictureDataUrl: null,
      livenessVerified: false,
      livenessCheckedAt: null,
    },
  }
}
