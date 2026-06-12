import { describe, expect, it } from "vitest"

import { createGestureScreenSize } from "./screen-metrics"

describe("routine action executor gateway", () => {
  it("uses physical pixels for native gesture coordinates", () => {
    expect(
      createGestureScreenSize({
        platform: "native",
        pixelRatio: 3.5,
        screen: {
          width: 384,
          height: 792,
        },
      })
    ).toEqual({
      width: 1344,
      height: 2772,
    })
  })

  it("keeps web gesture coordinates in layout pixels", () => {
    expect(
      createGestureScreenSize({
        platform: "web",
        pixelRatio: 3.5,
        screen: {
          width: 1024,
          height: 768,
        },
      })
    ).toEqual({
      width: 1024,
      height: 768,
    })
  })
})
