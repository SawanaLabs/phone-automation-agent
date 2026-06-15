import type { CompletionSignalNotifier } from "./completion-signal";
import type {
  CustomerActionResult,
  CustomerScreenState,
  CustomerTaskEvent,
} from "./customer-session";

export type RelativePoint = [number, number];

export interface ScreenSize {
  height: number;
  width: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export type RoutineAction =
  | {
      _metadata: "do";
      action: "Launch";
      app: string;
    }
  | {
      _metadata: "do";
      action: "Tap";
      element: RelativePoint;
      message?: string;
    }
  | {
      _metadata: "do";
      action: "Double Tap";
      element: RelativePoint;
    }
  | {
      _metadata: "do";
      action: "Long Press";
      element: RelativePoint;
    }
  | {
      _metadata: "do";
      action: "Swipe";
      start: RelativePoint;
      end: RelativePoint;
    }
  | {
      _metadata: "do";
      action: "Back";
    }
  | {
      _metadata: "do";
      action: "Home";
    }
  | {
      _metadata: "do";
      action: "Wait";
      duration?: string;
    }
  | {
      _metadata: "do";
      action: "Type" | "Type_Name";
      text: string;
    }
  | {
      _metadata: "do";
      action: "Take_over";
      message: string;
    }
  | {
      _metadata: "do";
      action: "Interact";
      message?: string;
    }
  | {
      _metadata: "do";
      action: "Note";
      message: string;
    }
  | {
      _metadata: "do";
      action: "Call_API";
      instruction: string;
    }
  | {
      _metadata: "finish";
      message: string;
    }
  | {
      _metadata: "failed";
      message: string;
    };

export type ExecutableRoutineAction = Extract<
  RoutineAction,
  { _metadata: "do" }
>;

export interface RoutineActionExecutor {
  back: () => Promise<void>;
  doubleTap: (point: PixelPoint) => Promise<void>;
  home: () => Promise<void>;
  launchApp: (app: string) => Promise<void>;
  longPress: (point: PixelPoint) => Promise<void>;
  screen: ScreenSize;
  swipe: (start: PixelPoint, end: PixelPoint) => Promise<void>;
  tap: (point: PixelPoint) => Promise<void>;
  typeText: (text: string) => Promise<void>;
  wait: (durationMs: number) => Promise<void>;
}

export interface RoutineActionScriptInput {
  actions: RoutineAction[];
  executor: RoutineActionExecutor;
  instruction: string;
  onEvent?: (event: CustomerTaskEvent) => void;
  shouldStop?: () => boolean;
  taskId: string;
}

export interface ScreenStateCollector {
  capture: () => Promise<CustomerScreenState>;
}

export interface HostedRoutineActionLoopInput {
  completionSignalNotifier?: CompletionSignalNotifier;
  executor: RoutineActionExecutor;
  fetchImpl?: typeof fetch;
  initialEvents?: CustomerTaskEvent[];
  initialLastActionResult?: CustomerActionResult | null;
  initialStepNumber?: number;
  instruction: string;
  maxSteps?: number;
  onEvent?: (event: CustomerTaskEvent) => void;
  runtimeAccessToken: string;
  runtimeUrl: string;
  screenStateCollector: ScreenStateCollector;
  shouldStop?: () => boolean;
  taskId: string;
}
