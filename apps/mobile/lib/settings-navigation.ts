import type { Href } from "expo-router";

export const SETTINGS_REFRESH_PARAM = "connectionsRefresh";

export function settingsRefreshHref(refreshId = Date.now().toString()): Href {
  return {
    pathname: "/settings",
    params: {
      [SETTINGS_REFRESH_PARAM]: refreshId,
    },
  } as Href;
}
