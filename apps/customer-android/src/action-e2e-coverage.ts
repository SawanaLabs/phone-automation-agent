export type ActionE2eCoverageGroup =
  | "routine"
  | "pause"
  | "runtime-local"
  | "finish";

export interface OpenAutoGlmActionCoverageEntry {
  action: string;
  group: ActionE2eCoverageGroup;
}

export const OPEN_AUTOGLM_ACTION_E2E_COVERAGE: OpenAutoGlmActionCoverageEntry[] =
  [
    { action: "Launch", group: "routine" },
    { action: "Tap", group: "routine" },
    { action: "Type", group: "routine" },
    { action: "Type_Name", group: "routine" },
    { action: "Swipe", group: "routine" },
    { action: "Back", group: "routine" },
    { action: "Home", group: "routine" },
    { action: "Wait", group: "routine" },
    { action: "Double Tap", group: "routine" },
    { action: "Long Press", group: "routine" },
    { action: "Take_over", group: "pause" },
    { action: "Interact", group: "pause" },
    { action: "Note", group: "runtime-local" },
    { action: "Call_API", group: "runtime-local" },
    { action: "finish", group: "finish" },
  ];

export const SENSITIVE_TAP_E2E_COVERAGE = {
  action: "Tap",
  variant: "message",
  group: "pause",
} as const;
