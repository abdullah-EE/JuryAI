export type TrialEventDraft = {
  type: string;
  role?: string;
  evidenceIds?: string[];
  status?: string;
  summary?: string;
  risk?: string;
  confidence?: number;
  mode?: "live" | "fallback";
  details?: Record<string, string | number | boolean | string[]>;
};

export type TrialObserver = (event: TrialEventDraft) => void | Promise<void>;
