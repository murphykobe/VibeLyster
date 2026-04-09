import { describe, expect, it } from "vitest";
import {
  getSizeSystemsForCategory,
  getValuesForSystem,
  parseStructuredSize,
  toDisplaySize,
} from "../sizes";

describe("sizes helpers", () => {
  it("returns allowed size systems for a category group", () => {
    expect(getSizeSystemsForCategory("footwear.boots")).toContain("US_MENS_SHOE");
    expect(getSizeSystemsForCategory("tops.t_shirt")).toContain("CLOTHING_LETTER");
  });

  it("parses a JSON string structured size", () => {
    expect(parseStructuredSize('{"system":"CLOTHING_LETTER","value":"M"}')).toEqual({
      system: "CLOTHING_LETTER",
      value: "M",
    });
  });

  it("returns null for invalid JSON size payloads", () => {
    expect(parseStructuredSize('{"system":1}')).toBeNull();
    expect(parseStructuredSize("not-json")).toBeNull();
  });

  it("formats a structured size for marketplace display", () => {
    expect(toDisplaySize({ system: "ONE_SIZE", value: "ONE SIZE" })).toBe("one size");
    expect(toDisplaySize({ system: "US_MENS_SHOE", value: "10.5" })).toBe("10.5");
  });

  it("passes through legacy string sizes for display", () => {
    expect(toDisplaySize("XL")).toBe("XL");
  });

  it("exposes suggested values for picker UIs", () => {
    expect(getValuesForSystem("CLOTHING_LETTER")).toContain("M");
  });
});
