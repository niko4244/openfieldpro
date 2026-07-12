export interface PublicAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthenticatedIdentity {
  token: string;
  user: PublicAuthUser;
  orgId: string;
}

export function browserAuthResponse(identity: AuthenticatedIdentity) {
  return {
    user: identity.user,
    orgId: identity.orgId,
  };
}

export function nativeAuthResponse(identity: AuthenticatedIdentity) {
  return identity;
}

export function nativeLoginRequestAllowed(origin: unknown) {
  // Browser fetch/XHR POST requests carry Origin. The native endpoint is kept
  // outside the browser credential surface so an injected web script cannot
  // exchange a password for a readable bearer token.
  return origin === undefined || origin === null || origin === "";
}
