import { describe, expect, it } from "vitest";

import { SETTINGS_REFRESH_PARAM, settingsRefreshHref } from "./settings-navigation";

describe("settingsRefreshHref", () => {
  it("returns the settings route with a connection refresh marker", () => {
    expect(settingsRefreshHref("refresh-1")).toEqual({
      pathname: "/settings",
      params: {
        [SETTINGS_REFRESH_PARAM]: "refresh-1",
      },
    });
  });
});
