import { buildDailyDigest } from "../src/pipeline.js";
import * as fx from "../test/fixtures.js";
import type { InboundEmail } from "../src/types.js";

function isEmail(value: unknown): value is InboundEmail {
  return typeof value === "object" && value !== null && "fromAddress" in value;
}

const all = Object.values(fx).filter(isEmail);

buildDailyDigest(all).then((digest) => {
  console.log(digest);
});
