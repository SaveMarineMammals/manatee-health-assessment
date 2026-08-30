import * as Crypto from 'expo-crypto';
import { systemClock, uuidv7, type RandomBytes } from '@manatee/core';
import { createRepository, migrate, type Repository } from '@manatee/db';
import { createExpoDriver } from './expo-driver';

const randomBytes: RandomBytes = (length) => Crypto.getRandomBytes(length);

const clock = systemClock();

let repository: Repository | undefined;

/** Opens and migrates the database once, on first use. */
export function getRepository(): Repository {
  if (!repository) {
    const driver = createExpoDriver();
    migrate(driver);
    repository = createRepository(driver, () => clock.nowUtc());
  }
  return repository;
}

export function newId(): string {
  return uuidv7(randomBytes, Date.now());
}

export { clock };
