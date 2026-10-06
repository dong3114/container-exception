import { CANDIDATE_LABEL, type CandidateFacts, type CandidateState, candidateState } from "./lifecycle";

const TONE: Record<CandidateState, string> = {
  AI_SUGGESTION: "b-cyan b-dashed",
  PROVISIONAL: "b-amber b-dashed",
  NEEDS_HUMAN_REVIEW: "b-orange b-dashed",
  HUMAN_CONFIRMED: "b-green",
  REJECTED: "b-slate",
};

/** Marks a value as candidate vs confirmed so an AI or extracted value never looks like a confirmed fact. */
export function CandidateBadge({ facts }: { facts: CandidateFacts }) {
  const state = candidateState(facts);
  return (
    <span className={`badge ${TONE[state]}`} data-testid="candidate-badge" data-state={state}>
      {CANDIDATE_LABEL[state]}
    </span>
  );
}
