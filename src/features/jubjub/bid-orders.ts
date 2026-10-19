import type { JubjubBidIntent, JubjubMe } from '@/services/platform/jubjub';

type BidJob = JubjubMe['jobs'][number];
const resumableJobStates = new Set([
  'prepared',
  'queued',
  'pending',
  'submitted',
  'confirming',
  'processing',
  'accepted',
  'confirmed',
]);
const failedStates = new Set(['reverted', 'failed', 'rejected']);
const transactionHash = /^0x[0-9a-f]{64}$/i;

export function describeBidOrder(intent: JubjubBidIntent, allJobs: readonly BidJob[]) {
  const jobs = allJobs
    .filter(
      (job) => job.purpose === 'bid' && job.intentId?.toLowerCase() === intent.id.toLowerCase(),
    )
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
  const errors = [...new Set(jobs.flatMap((job) => (job.error ? [job.error] : [])))];
  const txHashes = [
    ...new Set(
      jobs.flatMap((job) =>
        job.txHash && transactionHash.test(job.txHash) ? [job.txHash.toLowerCase()] : [],
      ),
    ),
  ];
  const base = { jobs, errors, txHashes };
  // A sponsor receipt or transaction hash alone does not prove campaign acceptance.
  if (intent.status === 'funded')
    return {
      ...base,
      label: 'Confirmed',
      tone: 'green',
      detail: 'This increase has been accepted by the campaign.',
      canResume: false,
    };
  if (failedStates.has(intent.status) || jobs.some((job) => failedStates.has(job.status)))
    return {
      ...base,
      label: 'Failed',
      tone: 'red',
      detail: 'The bid or its payment was rejected. Refresh to check its saved status.',
      canResume: false,
    };
  if (errors.length)
    return {
      ...base,
      label: 'Needs attention',
      tone: 'amber',
      detail:
        'The sponsor reported an issue. This increase has not been confirmed by the campaign.',
      canResume: false,
    };
  if (intent.status !== 'prepared')
    return {
      ...base,
      label: intent.status,
      tone: 'gray',
      detail: `Campaign status: ${intent.status}. Refresh to check for an update.`,
      canResume: false,
    };
  const unfamiliar = jobs.find((job) => !resumableJobStates.has(job.status));
  if (unfamiliar)
    return {
      ...base,
      label: unfamiliar.status,
      tone: 'gray',
      detail: `Sponsor status: ${unfamiliar.status}. Refresh before continuing.`,
      canResume: false,
    };
  if (jobs.some((job) => job.status === 'confirmed'))
    return {
      ...base,
      label: 'Awaiting acceptance',
      tone: 'amber',
      detail: 'The sponsor reports confirmation; campaign acceptance is still pending.',
      canResume: true,
    };
  if (jobs.length)
    return {
      ...base,
      label: 'Pending',
      tone: 'amber',
      detail: 'Payment is being processed. Resume this saved bid to check its progress.',
      canResume: true,
    };
  return {
    ...base,
    label: 'Prepared',
    tone: 'gray',
    detail:
      'The bid is prepared; payment has not been confirmed. Resume to continue this increase.',
    canResume: true,
  };
}

export function newestBidOrders(intents: readonly JubjubBidIntent[]) {
  return [...intents].sort(
    (left, right) => right.createdAt - left.createdAt || right.version - left.version,
  );
}
