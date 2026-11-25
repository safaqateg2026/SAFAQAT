import { createApprovedActivities, isApprovedBusinessActivity } from "./businessActivities.mjs";
import approvedRecords from "../app/src/app/safaqatApprovedAreaRecords.json" with { type: "json" };
import governorates from "../app/src/app/egyptRegistrationCatalog.json" with { type: "json" };

import { getEgyptToday } from "../shared/registrationRules.mjs";

export function createApprovedDistricts() {
  const districts = new Map();
  const identifiers = new Set();

  for (const governorate of governorates) {
    const code = governorate.code;
    const records = approvedRecords[code];

    if (
      typeof code !== "string" ||
      districts.has(code) ||
      !Array.isArray(records) ||
      !records.length
    ) {
      throw new Error("Invalid approved governorate catalog");
    }

    const areas = new Set();

    for (const record of records) {
      if (
        typeof record.id !== "string" ||
        !record.id.trim() ||
        areas.has(record.id)
      ) {
        throw new Error("Invalid approved area identifier");
      }

      areas.add(record.id);
      identifiers.add(JSON.stringify([code, record.id]));
    }

    districts.set(code, areas);
  }

  if (
    districts.size !== 27 ||
    identifiers.size !== 936 ||
    Object.keys(approvedRecords).length !== 27
  ) {
    throw new Error("Approved catalog count mismatch");
  }

  return districts;
}

export function createRegistrationCatalogs({
  activities,
  policyVersions,
  now
}) {
  if (
    !(activities instanceof Set) ||
    !activities.size ||
    !(policyVersions instanceof Map) ||
    !policyVersions.size ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    throw new Error("Registration catalogs are not ready");
  }

  return {
    today: getEgyptToday(new Date(now * 1000)),
    districts: createApprovedDistricts(),
    activities: new Set(
      [...activities].filter(id => createApprovedActivities().has(id))
    ),
    isApprovedBusinessActivity,
    policyVersions: new Map(policyVersions)
  };
}
