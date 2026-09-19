export type DemoProgress = {
  trialStarted: boolean;
  witnessesStarted: boolean;
  counterfactualReady: boolean;
  clerkStarted: boolean;
  humanReviewReady: boolean;
  decisionRecorded: boolean;
};

export function getUnlockedChapter(progress: DemoProgress): number {
  if (progress.decisionRecorded) return 7;
  if (progress.humanReviewReady) return 6;
  if (progress.clerkStarted) return 5;
  if (progress.counterfactualReady) return 4;
  if (progress.witnessesStarted) return 3;
  return progress.trialStarted ? 2 : 1;
}

export function canNavigateTo(chapter: number, unlockedChapter: number): boolean {
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= Math.min(7, unlockedChapter);
}
