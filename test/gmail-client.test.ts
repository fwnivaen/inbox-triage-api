import { describe, expect, it } from "vitest";
import { parseFromHeader } from "../src/gmail/client.js";

describe("parseFromHeader", () => {
  it("splits a display name and address", () => {
    expect(parseFromHeader('"Jordan Ellis" <jordan@example.com>')).toEqual({
      name: "Jordan Ellis",
      address: "jordan@example.com",
    });
  });

  it("splits a display name without surrounding quotes", () => {
    expect(parseFromHeader("Jordan Ellis <jordan@example.com>")).toEqual({
      name: "Jordan Ellis",
      address: "jordan@example.com",
    });
  });

  it("falls back to the bare address when there's no display name", () => {
    expect(parseFromHeader("no-reply@example.com")).toEqual({ name: "", address: "no-reply@example.com" });
  });
});
