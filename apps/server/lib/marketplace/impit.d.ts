declare module "impit" {
  export class Impit {
    constructor(options: { browser: "chrome" | "firefox" | "safari" });
    fetch(url: string, options?: RequestInit): Promise<Response>;
  }
}
