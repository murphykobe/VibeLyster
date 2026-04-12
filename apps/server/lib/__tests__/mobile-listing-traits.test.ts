import { describe, expect, it } from "vitest";
import {
  filterSelectableTraitOptions,
  formatPublishFeedbackMessage,
  getSelectableTraitLabel,
  normalizeEditableTraits,
} from "../../../mobile/lib/listing-traits";

describe("mobile listing trait helpers", () => {
  it("normalizes known selectable trait values for editing", () => {
    expect(normalizeEditableTraits({
      color: "Black",
      country_of_origin: "US",
      material: "Cotton",
    })).toEqual({
      color: "black",
      country_of_origin: "United States",
      material: "Cotton",
    });
  });

  it("filters selectable country options by search query", () => {
    const options = filterSelectableTraitOptions("country_of_origin", "ital");
    expect(options.some((option) => option.value === "Italy")).toBe(true);
  });

  it("returns display labels for selectable trait values", () => {
    expect(getSelectableTraitLabel("color", "grey")).toBe("Grey");
    expect(getSelectableTraitLabel("country_of_origin", "United States")).toBe("United States");
  });

  it("formats publish feedback messages with the platform name", () => {
    expect(formatPublishFeedbackMessage("grailed", "Grailed size is invalid for outerwear.")).toBe(
      "Grailed: Grailed size is invalid for outerwear."
    );
  });
});
