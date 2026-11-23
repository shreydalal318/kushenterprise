import { hash, verify } from '@node-rs/argon2';

// OWASP-recommended argon2id parameters (19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);

export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}

// Used when the user does not exist so response timing doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(pw: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-0');
  await verifyPassword(await dummyHash, pw);
}
