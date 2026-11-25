import worker from "../../../backend/cloud/worker.mjs";

export async function onRequest(context) {
  return worker.fetch(context.request, context.env);
}
