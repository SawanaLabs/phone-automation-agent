import type { ScreenSize } from "./routine-actions"

export type GestureScreenSizeInput = {
  platform: "native" | "web"
  pixelRatio: number
  screen: ScreenSize
}

export function createGestureScreenSize({
  platform,
  pixelRatio,
  screen,
}: GestureScreenSizeInput): ScreenSize {
  if (platform === "web") {
    return screen
  }

  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error(`Invalid pixel ratio for native gestures: ${pixelRatio}`)
  }

  return {
    width: Math.round(screen.width * pixelRatio),
    height: Math.round(screen.height * pixelRatio),
  }
}
