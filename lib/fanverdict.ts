import type {
  Poll,
  PollOption,
  PointsLedger,
  Profile,
  StandingRow,
  TournamentMember,
  Vote,
} from './types';

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function sortedPollOptions(poll: Pick<Poll, 'poll_options'>): PollOption[] {
  return (poll.poll_options ?? []).slice().sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function optionLabel(poll: Pick<Poll, 'poll_options'>, optionId: string | null | undefined) {
  const option = sortedPollOptions(poll).find((item) => item.id === optionId);
  if (option) return option.label;
  return 'Pending';
}

export function isPollLocked(poll: Pick<Poll, 'status' | 'locks_at'>) {
  return poll.status !== 'open' || new Date(poll.locks_at).getTime() <= Date.now();
}

export function calculateStandings(
  members: TournamentMember[],
  profiles: Profile[],
  votes: Vote[],
  polls: Poll[],
  ledger: PointsLedger[],
): StandingRow[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const pollsById = new Map(polls.map((poll) => [poll.id, poll]));

  const pointsByUser = new Map<string, number>();
  for (const entry of ledger) {
    pointsByUser.set(entry.user_id, (pointsByUser.get(entry.user_id) ?? 0) + entry.delta);
  }

  const accuracyByUser = new Map<string, { correct: number; settled: number }>();
  for (const vote of votes) {
    const poll = pollsById.get(vote.poll_id);
    if (!poll?.result_option_id || poll.status !== 'settled') continue;

    const current = accuracyByUser.get(vote.user_id) ?? { correct: 0, settled: 0 };
    current.settled += 1;
    if (vote.selected_option_id === poll.result_option_id) current.correct += 1;
    accuracyByUser.set(vote.user_id, current);
  }

  return members
    .filter((member) => member.status === 'active')
    .map((member) => {
      const profile = profileById.get(member.user_id);
      const accuracy = accuracyByUser.get(member.user_id) ?? { correct: 0, settled: 0 };

      return {
        user_id: member.user_id,
        display_name: profile?.display_name ?? 'Unknown player',
        role: member.role,
        total_points: pointsByUser.get(member.user_id) ?? 0,
        correct_picks: accuracy.correct,
        settled_votes: accuracy.settled,
        accuracy: accuracy.settled ? Math.round((accuracy.correct / accuracy.settled) * 100) : 0,
      };
    })
    .sort((a, b) => b.total_points - a.total_points || b.accuracy - a.accuracy || a.display_name.localeCompare(b.display_name));
}
