import { describe, expect, it } from "vitest";
import { productLocationIdentity } from "../entrypoints/item.content/lifecycle";

describe("product location identity", () => {
  it.each([
    ["https://booth.pm/en/items/123", "https://booth.pm/en/items/123"],
    ["https://booth.pm/ja/items/456/?ref=cart#images", "https://booth.pm/ja/items/456"],
    ["https://shop.booth.pm/items/123", "https://shop.booth.pm/items/123"],
    ["http://shop.booth.pm/items/456/", "http://shop.booth.pm/items/456"],
  ])("identifies BOOTH product URL %s", (value, expected) => {
    expect(productLocationIdentity(new URL(value))).toBe(expected);
  });

  it.each([
    "https://booth.pm/en/search",
    "https://booth.pm/en/items/",
    "https://shop.booth.pm/",
    "https://notbooth.pm/items/123",
    "https://booth.pm.example.com/en/items/123",
    "https://booth.pm/en/items/123/other",
  ])("does not mount stale product UI on %s", (value) => {
    expect(productLocationIdentity(new URL(value))).toBeNull();
  });
});
