const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token?.trim() || !/^[0-9a-f]{32}$/i.test(account ?? "")) {
  process.stderr.write("Set CLOUDFLARE_API_TOKEN securely and provide CLOUDFLARE_ACCOUNT_ID.\n");
  process.exit(2);
}

const root = `https://api.cloudflare.com/client/v4/accounts/${account}/`;
const inventory = { d1: [], r2: [], workers: [], errors: [] };
const resourceBindings = new Set(["d1", "r2_bucket", "service", "kv_namespace", "durable_object_namespace", "queue"]);

async function listOrRead(path, query = {}, jurisdiction) {
  const url = new URL(path, root);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const headers = { Authorization: `Bearer ${token}` };
  if (jurisdiction) headers["cf-r2-jurisdiction"] = jurisdiction;
  try {
    const response = await fetch(url, {
      method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json();
    if (response.ok && payload.success === true) return payload;
    inventory.errors.push({
      path, jurisdiction, status: response.status,
      codes: (payload.errors ?? []).map(error => error.code).filter(Number.isInteger),
    });
  } catch {
    inventory.errors.push({ path, jurisdiction, transport: "request or response failed" });
  }
  return null;
}

async function* pages(path) {
  for (let page = 1; ; page++) {
    const response = await listOrRead(path, { page });
    if (!response) return;
    yield* response.result;
    if (page >= (response.result_info?.total_pages ?? 1)) return;
  }
}

for await (const database of pages("d1/database")) {
  inventory.d1.push({ id: database.uuid, name: database.name, jurisdiction: database.jurisdiction });
}

const jurisdictions = process.argv.slice(2);
if (jurisdictions.some(value => !["eu", "fedramp"].includes(value))) {
  process.stderr.write("Optional R2 jurisdiction arguments are eu and fedramp.\n");
  process.exit(2);
}
for (const jurisdiction of new Set([undefined, ...jurisdictions])) {
  let cursor;
  const seen = new Set();
  do {
    const response = await listOrRead("r2/buckets", cursor ? { cursor } : {}, jurisdiction);
    if (!response) break;
    for (const bucket of response.result.buckets) {
      const path = "r2/buckets/" + encodeURIComponent(bucket.name) + "/domains/";
      const managed = await listOrRead(path + "managed", {}, jurisdiction);
      const custom = await listOrRead(path + "custom", {}, jurisdiction);
      inventory.r2.push({
        name: bucket.name,
        jurisdiction: bucket.jurisdiction ?? jurisdiction,
        location: bucket.location,
        managedPublicDomainEnabled: managed?.result?.enabled,
        customDomains: custom?.result?.domains?.map(({ domain, enabled }) => ({ domain, enabled })),
      });
    }
    cursor = response.result_info?.cursor ?? response.result?.cursor;
    if (cursor && seen.has(cursor)) {
      inventory.errors.push({ path: "r2/buckets", jurisdiction, pagination: "repeated cursor" });
      break;
    }
    seen.add(cursor);
  } while (cursor);
}

for await (const worker of pages("workers/scripts")) {
  const settings = await listOrRead("workers/scripts/" + encodeURIComponent(worker.id) + "/settings");
  const bindings = settings?.result?.bindings?.filter(binding => resourceBindings.has(binding.type))
    .map(({ name, type, id, bucket_name, service, environment, script_name, namespace_id, queue_name }) =>
      ({ name, type, id, bucket_name, service, environment, script_name, namespace_id, queue_name }));
  inventory.workers.push({ name: worker.id, bindings });
}

process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");
process.exitCode = inventory.errors.length ? 1 : 0;
