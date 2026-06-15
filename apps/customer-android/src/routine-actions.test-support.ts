import type { RoutineActionExecutor } from "./routine-actions";

export function createRecordingExecutor(): RoutineActionExecutor & {
  calls: string[];
} {
  return {
    calls: [],
    screen: {
      width: 1080,
      height: 2400,
    },
    tap(point) {
      this.calls.push(`tap:${point.x},${point.y}`);
      return Promise.resolve();
    },
    doubleTap(point) {
      this.calls.push(`double-tap:${point.x},${point.y}`);
      return Promise.resolve();
    },
    longPress(point) {
      this.calls.push(`long-press:${point.x},${point.y}`);
      return Promise.resolve();
    },
    swipe(start, end) {
      this.calls.push(`swipe:${start.x},${start.y}->${end.x},${end.y}`);
      return Promise.resolve();
    },
    back() {
      this.calls.push("back");
      return Promise.resolve();
    },
    home() {
      this.calls.push("home");
      return Promise.resolve();
    },
    launchApp(app) {
      this.calls.push(`launch:${app}`);
      return Promise.resolve();
    },
    typeText(text) {
      this.calls.push(`type:${text}`);
      return Promise.resolve();
    },
    wait(durationMs) {
      this.calls.push(`wait:${durationMs}`);
      return Promise.resolve();
    },
  };
}
