import type {
  Poll,
  PollOption,
  PointsLedger,
  PrivateLeagueMember,
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

export function sortPollsByGameOrder<T extends Pick<Poll, 'locks_at' | 'created_at' | 'matches'>>(
  polls: T[],
  direction: 'asc' | 'desc' = 'asc',
): T[] {
  const multiplier = direction === 'asc' ? 1 : -1;

  return polls.slice().sort((a, b) => {
    const gameA = a.matches?.game_number ?? (direction === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
    const gameB = b.matches?.game_number ?? (direction === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);

    return (
      (gameA - gameB) * multiplier ||
      (new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime()) * multiplier ||
      (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * multiplier
    );
  });
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
  const activeMembers = members
    .filter((member) => member.status === 'active')
    .slice()
    .sort(
      (a, b) =>
        new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime() ||
        (profileById.get(a.user_id)?.display_name ?? '').localeCompare(profileById.get(b.user_id)?.display_name ?? ''),
    );
  const activeMemberIds = new Set(activeMembers.map((member) => member.user_id));

  const pointsByUser = new Map(activeMembers.map((member) => [member.user_id, 0]));
  const orderedUserIds = activeMembers.map((member) => member.user_id);
  const scoreEvents = new Map<
    string,
    {
      deltasByUser: Map<string, number>;
      sortTime: number;
      sortNumber: number;
      createdTime: number;
    }
  >();

  const accuracyByUser = new Map<string, { correct: number; settled: number }>();
  for (const vote of votes) {
    const poll = pollsById.get(vote.poll_id);
    if (!activeMemberIds.has(vote.user_id) || !poll?.result_option_id || poll.status !== 'settled') continue;

    const current = accuracyByUser.get(vote.user_id) ?? { correct: 0, settled: 0 };
    current.settled += 1;
    if (vote.selected_option_id === poll.result_option_id) current.correct += 1;
    accuracyByUser.set(vote.user_id, current);
  }

  for (const entry of ledger) {
    if (!activeMemberIds.has(entry.user_id)) continue;

    const poll = entry.poll_id ? pollsById.get(entry.poll_id) : null;
    const sortTime = new Date(poll?.locks_at ?? entry.created_at).getTime();
    const createdTime = new Date(entry.created_at).getTime();
    const sortNumber = poll?.matches?.game_number ?? Number.MAX_SAFE_INTEGER;
    const eventKey = entry.reason === 'correct_pick' && entry.poll_id ? `poll:${entry.poll_id}` : `ledger:${entry.id}`;
    const event =
      scoreEvents.get(eventKey) ??
      {
        deltasByUser: new Map<string, number>(),
        sortTime,
        sortNumber,
        createdTime,
      };

    event.sortTime = Math.min(event.sortTime, sortTime);
    event.sortNumber = Math.min(event.sortNumber, sortNumber);
    event.createdTime = Math.min(event.createdTime, createdTime);
    event.deltasByUser.set(entry.user_id, (event.deltasByUser.get(entry.user_id) ?? 0) + entry.delta);
    scoreEvents.set(eventKey, event);
  }

  const orderedEvents = Array.from(scoreEvents.entries()).sort(
    ([keyA, eventA], [keyB, eventB]) =>
      eventA.sortTime - eventB.sortTime ||
      eventA.sortNumber - eventB.sortNumber ||
      eventA.createdTime - eventB.createdTime ||
      keyA.localeCompare(keyB),
  );

  for (const [, event] of orderedEvents) {
    for (const [userId, delta] of Array.from(event.deltasByUser.entries())) {
      pointsByUser.set(userId, (pointsByUser.get(userId) ?? 0) + delta);
    }

    const previousOrder = new Map(orderedUserIds.map((userId, index) => [userId, index]));
    orderedUserIds.sort(
      (a, b) =>
        (pointsByUser.get(b) ?? 0) - (pointsByUser.get(a) ?? 0) ||
        (previousOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (previousOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  const memberByUserId = new Map(activeMembers.map((member) => [member.user_id, member]));

  return orderedUserIds.map((userId) => {
    const member = memberByUserId.get(userId);
    const profile = profileById.get(userId);
    const accuracy = accuracyByUser.get(userId) ?? { correct: 0, settled: 0 };

    return {
      user_id: userId,
      display_name: profile?.display_name ?? 'Unknown player',
      role: member?.role ?? 'participant',
      total_points: pointsByUser.get(userId) ?? 0,
      correct_picks: accuracy.correct,
      settled_votes: accuracy.settled,
      accuracy: accuracy.settled ? Math.round((accuracy.correct / accuracy.settled) * 100) : 0,
    };
  });
}

export function calculatePrivateLeagueStandings(
  standings: StandingRow[],
  members: PrivateLeagueMember[],
  leagueId: string,
): StandingRow[] {
  const activeMemberIds = new Set(
    members
      .filter((member) => member.league_id === leagueId && member.status === 'active')
      .map((member) => member.profile_id),
  );

  return standings.filter((row) => activeMemberIds.has(row.user_id));
}
