import * as Crypto from 'expo-crypto';
import { systemClock, uuidv7, type RandomBytes } from '@manatee/core';
import {
  createAlarmRepository,
  createRepository,
  migrate,
  type AlarmRepository,
  type Repository,
} from '@manatee/db';
import { createExpoDriver } from './expo-driver';

const randomBytes: RandomBytes = (length) => Crypto.getRandomBytes(length);

const clock = systemClock();

let repository: Repository | undefined;
let alarms: AlarmRepository | undefined;
let sharedDriver: ReturnType<typeof createExpoDriver> | undefined;

/** The one database handle. Opened and migrated on first use. */
function driver() {
  if (!sharedDriver) {
    sharedDriver = createExpoDriver();
    migrate(sharedDriver);
  }
  return sharedDriver;
}

/** Opens and migrates the database once, on first use. */
export function getRepository(): Repository {
  if (!repository) repository = createRepository(driver(), () => clock.nowUtc());
  return repository;
}

/** The alarm audit trail, sharing one driver with the tracker's repository. */
export function alarmRepository(): AlarmRepository {
  if (!alarms) alarms = createAlarmRepository(driver(), () => clock.nowUtc());
  return alarms;
}

export function newId(): string {
  return uuidv7(randomBytes, Date.now());
}

export { clock };
