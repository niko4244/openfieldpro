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

export function nativeLoginRequestAllowed(
  origin: unknown,
  secFetchSite: unknown,
  client: unknown,
) {
  // Browser fetch/XHR requests carry Origin and/or Sec-Fetch-Site. Requiring an
  // explicit native client marker also prevents generic API clients from using
  // the bearer-token exchange accidentally.
  return (origin === undefined || origin === null) &&
    (secFetchSite === undefined || secFetchSite === null) &&
    client === "native";
}
