"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  History,
  LogOut,
  Mail,
  RefreshCcw,
  Settings,
  Share2,
  Shield,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { ensureProfile } from '@/lib/account';
import { getErrorMessage } from '@/lib/errors';
import { calculateStandings, formatDateTime, isPollLocked, optionLabel, sortPollsByGameOrder, sortedPollOptions } from '@/lib/fanverdict';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import PrivateLeaguesPanel from './private-leagues-panel';
import type {
  HistoricalEventSummary,
  HistoricalStanding,
  HistoricalTournament,
  PointsLedger,
  Poll,
  Profile,
  StandingRow,
  TournamentAnnouncement,
  Tournament,
  TournamentMember,
  Vote,
} from '@/lib/types';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type LiveDashboardSection = 'openPolls' | 'settledPolls' | 'resultComparison';
type PlayerMatrixCellStatus = 'correct' | 'incorrect' | 'missed';

type PlayerMatrixCell = {
  pollId: string;
  points: number;
  status: PlayerMatrixCellStatus;
  selectedLabel: string | null;
  resultLabel: string;
};

type PlayerMatrixColumn = {
  poll: Poll;
  label: string;
  title: string;
  resultLabel: string;
  winningVoters: number;
  groupRead: 'Majority Win' | 'Minority Win' | 'No Winner';
};

type PlayerMatrixRow = StandingRow & {
  cells: PlayerMatrixCell[];
  matrixPoints: number;
  adjustmentPoints: number;
  missedPicks: number;
};

const STANDINGS_SHARE_IMAGE_WIDTH = 1080;
const STANDINGS_SHARE_IMAGE_MAX_ROWS = 50;

const drawRoundedRectangle = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
};

const truncateCanvasText = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (context.measureText(text).width <= maxWidth) return text;

  const ellipsis = '...';
  let truncated = text;

  while (truncated.length > 0 && context.measureText(`${truncated}${ellipsis}`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated.trimEnd()}${ellipsis}`;
};

const drawCanvasText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    align?: CanvasTextAlign;
    color?: string;
    font?: string;
    maxWidth?: number;
  } = {},
) => {
  context.fillStyle = options.color ?? '#0f172a';
  context.font = options.font ?? '400 28px Arial, sans-serif';
  context.textAlign = options.align ?? 'left';
  context.textBaseline = 'middle';
  context.fillText(options.maxWidth ? truncateCanvasText(context, text, options.maxWidth) : text, x, y);
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Unable to create standings image.'));
    }, 'image/png');
  });

const slugifyFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'fanverdict';

const downloadBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

const createLiveStandingsShareUrl = (tournamentId: string | null) => {
  const url = new URL(window.location.href);

  if (tournamentId) url.searchParams.set('tournament', tournamentId);
  url.hash = 'live-standings';

  return url.toString();
};

const createStandingsShareImage = async (standings: StandingRow[], tournamentName: string, shareUrl: string) => {
  const rows = standings.slice(0, STANDINGS_SHARE_IMAGE_MAX_ROWS);
  const hiddenRowCount = Math.max(standings.length - rows.length, 0);
  const tableHeaderHeight = 54;
  const rowHeight = 68;
  const hiddenNoticeHeight = hiddenRowCount > 0 ? 48 : 0;
  const footerHeight = 146;
  const tableTop = 320;
  const cardMargin = 40;
  const imageHeight = Math.max(
    720,
    tableTop + tableHeaderHeight + rows.length * rowHeight + hiddenNoticeHeight + footerHeight + cardMargin,
  );
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) throw new Error('Unable to prepare standings image.');

  canvas.width = STANDINGS_SHARE_IMAGE_WIDTH;
  canvas.height = imageHeight;

  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#ffffff';
  drawRoundedRectangle(context, cardMargin, cardMargin, canvas.width - cardMargin * 2, canvas.height - cardMargin * 2, 28);

  context.fillStyle = '#2563eb';
  drawRoundedRectangle(context, cardMargin, cardMargin, canvas.width - cardMargin * 2, 18, 9);

  const contentLeft = 80;
  const contentRight = canvas.width - 80;
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  const leader = standings[0] ?? null;

  drawCanvasText(context, 'FanVerdict', contentLeft, 98, {
    color: '#2563eb',
    font: '800 30px Arial, sans-serif',
  });
  drawCanvasText(context, generatedAt, contentRight, 98, {
    align: 'right',
    color: '#64748b',
    font: '500 24px Arial, sans-serif',
  });
  drawCanvasText(context, tournamentName, contentLeft, 158, {
    font: '800 46px Arial, sans-serif',
    maxWidth: 760,
  });
  drawCanvasText(context, 'Player Standings', contentLeft, 212, {
    color: '#475569',
    font: '700 30px Arial, sans-serif',
  });

  context.fillStyle = '#eff6ff';
  drawRoundedRectangle(context, contentLeft, 244, 250, 48, 24);
  drawCanvasText(context, `${standings.length} player${standings.length === 1 ? '' : 's'}`, contentLeft + 22, 268, {
    color: '#1d4ed8',
    font: '700 23px Arial, sans-serif',
  });

  if (leader) {
    context.fillStyle = '#f1f5f9';
    drawRoundedRectangle(context, contentLeft + 270, 244, 560, 48, 24);
    drawCanvasText(context, `Leader: ${leader.display_name} (${leader.total_points} pts)`, contentLeft + 292, 268, {
      color: '#334155',
      font: '700 23px Arial, sans-serif',
      maxWidth: 510,
    });
  }

  const tableLeft = contentLeft;
  const tableRight = contentRight;
  const tableWidth = tableRight - tableLeft;

  context.fillStyle = '#f8fafc';
  drawRoundedRectangle(context, tableLeft, tableTop, tableWidth, tableHeaderHeight, 14);
  drawCanvasText(context, 'Rank', tableLeft + 24, tableTop + tableHeaderHeight / 2, {
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Participant', tableLeft + 150, tableTop + tableHeaderHeight / 2, {
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Points', tableLeft + 642, tableTop + tableHeaderHeight / 2, {
    align: 'right',
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Correct', tableLeft + 760, tableTop + tableHeaderHeight / 2, {
    align: 'right',
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Votes', tableLeft + 860, tableTop + tableHeaderHeight / 2, {
    align: 'right',
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });
  drawCanvasText(context, 'Accuracy', tableRight - 24, tableTop + tableHeaderHeight / 2, {
    align: 'right',
    color: '#64748b',
    font: '800 20px Arial, sans-serif',
  });

  rows.forEach((row, index) => {
    const y = tableTop + tableHeaderHeight + index * rowHeight;
    const midpoint = y + rowHeight / 2;

    context.fillStyle = index === 0 ? '#eff6ff' : index % 2 === 0 ? '#ffffff' : '#f8fafc';
    context.fillRect(tableLeft, y, tableWidth, rowHeight);

    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(tableLeft, y + rowHeight);
    context.lineTo(tableRight, y + rowHeight);
    context.stroke();

    drawCanvasText(context, `#${index + 1}`, tableLeft + 24, midpoint, {
      font: '800 24px Arial, sans-serif',
    });
    drawCanvasText(context, row.display_name, tableLeft + 150, midpoint, {
      font: '700 26px Arial, sans-serif',
      maxWidth: 390,
    });
    drawCanvasText(context, String(row.total_points), tableLeft + 642, midpoint, {
      align: 'right',
      color: '#1d4ed8',
      font: '900 30px Arial, sans-serif',
    });
    drawCanvasText(context, String(row.correct_picks), tableLeft + 760, midpoint, {
      align: 'right',
      color: '#334155',
      font: '700 24px Arial, sans-serif',
    });
    drawCanvasText(context, String(row.settled_votes), tableLeft + 860, midpoint, {
      align: 'right',
      color: '#334155',
      font: '700 24px Arial, sans-serif',
    });
    drawCanvasText(context, `${row.accuracy}%`, tableRight - 24, midpoint, {
      align: 'right',
      color: '#334155',
      font: '700 24px Arial, sans-serif',
    });
  });

  let footerTop = tableTop + tableHeaderHeight + rows.length * rowHeight;

  if (hiddenRowCount > 0) {
    drawCanvasText(context, `Top ${rows.length} shown. Open the dashboard for ${hiddenRowCount} more.`, tableLeft + 24, footerTop + 24, {
      color: '#64748b',
      font: '600 22px Arial, sans-serif',
    });
    footerTop += hiddenNoticeHeight;
  }

  context.strokeStyle = '#cbd5e1';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(tableLeft, footerTop + 34);
  context.lineTo(tableRight, footerTop + 34);
  context.stroke();

  drawCanvasText(context, 'Open full dashboard:', tableLeft, footerTop + 78, {
    color: '#475569',
    font: '700 22px Arial, sans-serif',
  });
  drawCanvasText(context, shareUrl, tableLeft, footerTop + 114, {
    color: '#2563eb',
    font: '600 22px Arial, sans-serif',
    maxWidth: tableWidth,
  });

  return canvasToPngBlob(canvas);
};

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [historicalTournaments, setHistoricalTournaments] = useState<HistoricalTournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [selectedHistoricalTournamentId, setSelectedHistoricalTournamentId] = useState('');
  const [selectedTournamentKey, setSelectedTournamentKey] = useState('');
  const [members, setMembers] = useState<TournamentMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [ledger, setLedger] = useState<PointsLedger[]>([]);
  const [announcements, setAnnouncements] = useState<TournamentAnnouncement[]>([]);
  const [historicalStandings, setHistoricalStandings] = useState<HistoricalStanding[]>([]);
  const [historicalEvents, setHistoricalEvents] = useState<HistoricalEventSummary[]>([]);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [message, setMessage] = useState('');
  const [isSharingStandingsImage, setIsSharingStandingsImage] = useState(false);
  const [liveDashboardSection, setLiveDashboardSection] = useState<LiveDashboardSection>('openPolls');
  const [expandedVotePollIds, setExpandedVotePollIds] = useState<Set<string>>(() => new Set());

  const currentTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null,
    [selectedTournamentId, tournaments],
  );

  const currentHistoricalTournament = useMemo(
    () => historicalTournaments.find((tournament) => tournament.id === selectedHistoricalTournamentId) ?? null,
    [historicalTournaments, selectedHistoricalTournamentId],
  );

  const selectedTournamentKind = selectedTournamentKey.startsWith('live:') ? 'live' : 'historical';

  const tournamentOptions = useMemo(() => {
    const historicalOptions = historicalTournaments.map((tournament) => ({
      id: tournament.id,
      key: `historical:${tournament.id}`,
      kind: 'historical' as const,
      name: tournament.name,
      seasonYear: tournament.season_year,
      createdAt: tournament.imported_at,
    }));
    const liveOptions = tournaments.map((tournament) => ({
      id: tournament.id,
      key: `live:${tournament.id}`,
      kind: 'live' as const,
      name: tournament.name,
      seasonYear: tournament.season_year ?? 0,
      createdAt: tournament.created_at,
    }));

    return [...historicalOptions, ...liveOptions].sort(
      (a, b) =>
        b.seasonYear - a.seasonYear ||
        (a.kind === b.kind ? 0 : a.kind === 'live' ? -1 : 1) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [historicalTournaments, tournaments]);

  const myMembership = useMemo(
    () => members.find((member) => member.user_id === session?.user.id && member.status === 'active') ?? null,
    [members, session?.user.id],
  );

  const canAdmin = isAppAdmin || myMembership?.role === 'owner' || myMembership?.role === 'admin';

  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const pollById = useMemo(() => new Map(polls.map((poll) => [poll.id, poll])), [polls]);
  const activeMembers = useMemo(
    () =>
      members
        .filter((member) => member.status === 'active')
        .slice()
        .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()),
    [members],
  );
  const activeMemberIds = useMemo(() => new Set(activeMembers.map((member) => member.user_id)), [activeMembers]);

  const myVotes = useMemo(() => {
    const voteMap = new Map<string, Vote>();
    for (const vote of votes) {
      if (vote.user_id === session?.user.id) voteMap.set(vote.poll_id, vote);
    }
    return voteMap;
  }, [session?.user.id, votes]);

  const standings = useMemo(
    () => calculateStandings(members, profiles, votes, polls, ledger),
    [ledger, members, polls, profiles, votes],
  );
  const votesByPollId = useMemo(() => {
    const voteMap = new Map<string, Vote[]>();

    for (const vote of votes) {
      const pollVotes = voteMap.get(vote.poll_id) ?? [];
      pollVotes.push(vote);
      voteMap.set(vote.poll_id, pollVotes);
    }

    return voteMap;
  }, [votes]);

  const openPolls = useMemo(
    () => sortPollsByGameOrder(polls.filter((poll) => poll.status === 'open' && !isPollLocked(poll))),
    [polls],
  );
  const settledPolls = useMemo(
    () => sortPollsByGameOrder(polls.filter((poll) => poll.status === 'settled'), 'desc'),
    [polls],
  );
  const resultComparisonRows = useMemo(
    () =>
      settledPolls.map((poll) => {
        const options = sortedPollOptions(poll);
        const votesForPoll = (votesByPollId.get(poll.id) ?? []).filter((vote) => activeMemberIds.has(vote.user_id));
        const totalVotes = votesForPoll.length;
        const majorityThreshold = activeMembers.length ? Math.ceil(activeMembers.length / 2) : 0;
        const optionCounts = options.map((option) => {
          const voteCount = votesForPoll.filter((vote) => vote.selected_option_id === option.id).length;

          return {
            option,
            voteCount,
          };
        });
        const leadingVoteCount = optionCounts.reduce((max, item) => Math.max(max, item.voteCount), 0);
        const leadingOptions = optionCounts.filter((item) => item.voteCount === leadingVoteCount && leadingVoteCount > 0);
        const resultOption = options.find((option) => option.id === poll.result_option_id) ?? null;
        const resultVoteCount = optionCounts.find((item) => item.option.id === poll.result_option_id)?.voteCount ?? 0;
        const resultVotePercent = totalVotes ? Math.round((resultVoteCount / totalVotes) * 100) : 0;
        const resultMatchedVoteLeader = Boolean(resultOption && leadingOptions.some((item) => item.option.id === resultOption.id));
        const majorityPickedResult = majorityThreshold > 0 && resultVoteCount >= majorityThreshold;

        return {
          poll,
          totalVotes,
          missedVotes: Math.max(activeMembers.length - totalVotes, 0),
          majorityThreshold,
          resultLabel: resultOption?.label ?? 'Result not set',
          resultVoteCount,
          resultVotePercent,
          leadingVoteCount,
          leadingLabels: leadingOptions.map((item) => item.option.label),
          resultMatchedVoteLeader,
          majorityPickedResult,
        };
      }),
    [activeMemberIds, activeMembers.length, settledPolls, votesByPollId],
  );
  const resultComparisonSummary = useMemo(
    () => ({
      compared: resultComparisonRows.length,
      majorityPickedResult: resultComparisonRows.filter((row) => row.majorityPickedResult).length,
      minorityPickedResult: resultComparisonRows.filter((row) => !row.majorityPickedResult && row.resultVoteCount > 0).length,
      nobodyPickedResult: resultComparisonRows.filter((row) => row.resultVoteCount === 0).length,
    }),
    [resultComparisonRows],
  );
  const playerMatrix = useMemo(() => {
    const matrixPolls = sortPollsByGameOrder(polls.filter((poll) => poll.status === 'settled' && Boolean(poll.result_option_id)));
    const voteByPollAndUser = new Map<string, Vote>();
    const pointsByPollAndUser = new Map<string, number>();

    for (const vote of votes) {
      if (!activeMemberIds.has(vote.user_id)) continue;
      voteByPollAndUser.set(`${vote.poll_id}:${vote.user_id}`, vote);
    }

    for (const entry of ledger) {
      if (!activeMemberIds.has(entry.user_id) || entry.reason !== 'correct_pick' || !entry.poll_id) continue;

      const key = `${entry.poll_id}:${entry.user_id}`;
      pointsByPollAndUser.set(key, (pointsByPollAndUser.get(key) ?? 0) + entry.delta);
    }

    const columns: PlayerMatrixColumn[] = matrixPolls.map((poll, index) => {
      const votesForPoll = (votesByPollId.get(poll.id) ?? []).filter((vote) => activeMemberIds.has(vote.user_id));
      const winningVoters = votesForPoll.filter((vote) => vote.selected_option_id === poll.result_option_id).length;
      const majorityThreshold = activeMembers.length ? Math.ceil(activeMembers.length / 2) : 0;
      const resultLabel = optionLabel(poll, poll.result_option_id);
      const groupRead =
        winningVoters === 0 ? 'No Winner' : majorityThreshold > 0 && winningVoters >= majorityThreshold ? 'Majority Win' : 'Minority Win';
      const gameNumber = poll.matches?.game_number;

      return {
        poll,
        label: gameNumber ? `G${gameNumber}` : `P${index + 1}`,
        title: gameNumber ? `Game ${gameNumber}: ${poll.question}` : poll.question,
        resultLabel,
        winningVoters,
        groupRead,
      };
    });

    const rows: PlayerMatrixRow[] = standings.map((standing) => {
      const cells = columns.map((column) => {
        const key = `${column.poll.id}:${standing.user_id}`;
        const vote = voteByPollAndUser.get(key);
        const selectedLabel = vote ? optionLabel(column.poll, vote.selected_option_id) : null;
        const points = pointsByPollAndUser.get(key) ?? 0;
        const status: PlayerMatrixCellStatus = !vote
          ? 'missed'
          : vote.selected_option_id === column.poll.result_option_id
            ? 'correct'
            : 'incorrect';

        return {
          pollId: column.poll.id,
          points,
          status,
          selectedLabel,
          resultLabel: column.resultLabel,
        };
      });
      const matrixPoints = cells.reduce((total, cell) => total + cell.points, 0);

      return {
        ...standing,
        cells,
        matrixPoints,
        adjustmentPoints: standing.total_points - matrixPoints,
        missedPicks: cells.filter((cell) => cell.status === 'missed').length,
      };
    });

    return {
      columns,
      rows,
      hasAdjustments: rows.some((row) => row.adjustmentPoints !== 0),
    };
  }, [activeMemberIds, activeMembers.length, ledger, polls, standings, votes, votesByPollId]);
  const visibleLivePolls = liveDashboardSection === 'settledPolls' ? settledPolls : openPolls;
  const liveDetailHeading =
    liveDashboardSection === 'resultComparison'
      ? 'Results vs Voting'
      : liveDashboardSection === 'settledPolls'
        ? 'Settled Polls'
        : 'Open Polls';
  const liveDetailDescription =
    liveDashboardSection === 'resultComparison'
      ? 'Compares final results with vote leaders and group majority.'
      : liveDashboardSection === 'settledPolls'
        ? 'Completed poll results, newest game first.'
        : 'Available polls, sorted by game number ascending.';

  const recentVotes = useMemo(
    () =>
      votes
        .slice()
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 25),
    [votes],
  );

  const historicalClaimedCount = useMemo(
    () => historicalStandings.filter((row) => row.claimed_profile_id).length,
    [historicalStandings],
  );

  const historicalBonusEvent = useMemo(
    () => historicalEvents.find((event) => event.event_type === 'bonus') ?? null,
    [historicalEvents],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));

    return () => subscription.unsubscribe();
  }, []);

  const loadTournaments = useCallback(
    async (activeSession: Session) => {
      setLoadState('loading');
      setMessage('');

      try {
        const [loadedProfile, tournamentResult, historicalTournamentResult, appAdminResult] = await Promise.all([
          ensureProfile(activeSession),
          supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
          supabase.from('historical_tournaments').select('*').order('season_year', { ascending: false }),
          supabase.from('app_admins').select('profile_id').eq('profile_id', activeSession.user.id).maybeSingle(),
        ]);

        if (tournamentResult.error) throw tournamentResult.error;
        if (historicalTournamentResult.error) throw historicalTournamentResult.error;
        if (appAdminResult.error) throw appAdminResult.error;

        const loadedTournaments = (tournamentResult.data ?? []) as Tournament[];
        const loadedHistoricalTournaments = (historicalTournamentResult.data ?? []) as HistoricalTournament[];
        setProfile(loadedProfile);
        setTournaments(loadedTournaments);
        setHistoricalTournaments(loadedHistoricalTournaments);
        setIsAppAdmin(Boolean(appAdminResult.data));

        if (!selectedTournamentKey) {
          const options = [
            ...loadedHistoricalTournaments.map((tournament) => ({
              key: `historical:${tournament.id}`,
              kind: 'historical' as const,
              id: tournament.id,
              seasonYear: tournament.season_year,
              createdAt: tournament.imported_at,
            })),
            ...loadedTournaments.map((tournament) => ({
              key: `live:${tournament.id}`,
              kind: 'live' as const,
              id: tournament.id,
              seasonYear: tournament.season_year ?? 0,
              createdAt: tournament.created_at,
            })),
          ].sort(
            (a, b) =>
              b.seasonYear - a.seasonYear ||
              (a.kind === b.kind ? 0 : a.kind === 'live' ? -1 : 1) ||
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

          const requestedTournamentId =
            typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tournament') : null;
          const requestedLiveTournament = requestedTournamentId
            ? loadedTournaments.find((tournament) => tournament.id === requestedTournamentId)
            : null;
          const defaultOption = requestedLiveTournament
            ? {
                key: `live:${requestedLiveTournament.id}`,
                kind: 'live' as const,
                id: requestedLiveTournament.id,
              }
            : options[0];

          if (defaultOption?.kind === 'historical') {
            setSelectedTournamentKey(defaultOption.key);
            setSelectedHistoricalTournamentId(defaultOption.id);
            setSelectedTournamentId('');
          } else if (defaultOption?.kind === 'live') {
            setSelectedTournamentKey(defaultOption.key);
            setSelectedTournamentId(defaultOption.id);
            setSelectedHistoricalTournamentId('');
          }
        }

        setLoadState('ready');
      } catch (error) {
        setLoadState('error');
        setMessage(getErrorMessage(error, 'Unable to load tournaments.'));
      }
    },
    [selectedTournamentKey],
  );

  const loadTournamentData = useCallback(async (tournamentId: string) => {
    if (!tournamentId) return;

    setLoadState('loading');
    setMessage('');

    try {
      const [membersResult, pollsResult, ledgerResult, announcementsResult] = await Promise.all([
        supabase.from('tournament_members').select('*').eq('tournament_id', tournamentId),
        supabase
          .from('polls')
          .select('*, matches(*), poll_options(*)')
          .eq('tournament_id', tournamentId)
          .order('locks_at', { ascending: true }),
        supabase.from('points_ledger').select('*').eq('tournament_id', tournamentId),
        supabase
          .from('tournament_announcements')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (pollsResult.error) throw pollsResult.error;
      if (ledgerResult.error) throw ledgerResult.error;
      if (announcementsResult.error) throw announcementsResult.error;

      const loadedMembers = (membersResult.data ?? []) as TournamentMember[];
      const loadedPolls = sortPollsByGameOrder((pollsResult.data ?? []) as Poll[]);
      const loadedLedger = (ledgerResult.data ?? []) as PointsLedger[];
      const loadedAnnouncements = (announcementsResult.data ?? []) as TournamentAnnouncement[];
      const userIds = Array.from(new Set(loadedMembers.map((member) => member.user_id)));
      const pollIds = loadedPolls.map((poll) => poll.id);

      let loadedProfiles: Profile[] = [];
      let loadedVotes: Vote[] = [];

      if (userIds.length > 0) {
        const profilesResult = await supabase.from('profiles').select('*').in('id', userIds);
        if (profilesResult.error) throw profilesResult.error;
        loadedProfiles = (profilesResult.data ?? []) as Profile[];
      }

      if (pollIds.length > 0) {
        const votesResult = await supabase.from('votes').select('*').in('poll_id', pollIds).order('updated_at', { ascending: false });
        if (votesResult.error) throw votesResult.error;
        loadedVotes = (votesResult.data ?? []) as Vote[];
      }

      setMembers(loadedMembers);
      setPolls(loadedPolls);
      setLedger(loadedLedger);
      setAnnouncements(loadedAnnouncements);
      setProfiles(loadedProfiles);
      setVotes(loadedVotes);
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      setMessage(getErrorMessage(error, 'Unable to load tournament data.'));
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setTournaments([]);
      setHistoricalTournaments([]);
      setSelectedTournamentId('');
      setSelectedHistoricalTournamentId('');
      setSelectedTournamentKey('');
      setMembers([]);
      setProfiles([]);
      setPolls([]);
      setVotes([]);
      setLedger([]);
      setAnnouncements([]);
      setHistoricalStandings([]);
      setHistoricalEvents([]);
      setIsAppAdmin(false);
      setLoadState('ready');
      return;
    }

    loadTournaments(session);
  }, [loadTournaments, session]);

  const loadHistoricalTournamentData = useCallback(async (tournamentId: string) => {
    if (!tournamentId) return;

    setLoadState('loading');
    setMessage('');

    try {
      const [standingsResult, eventsResult] = await Promise.all([
        supabase
          .from('historical_standings')
          .select('*')
          .eq('historical_tournament_id', tournamentId)
          .order('total_points', { ascending: false })
          .order('accuracy_percent', { ascending: false })
          .order('display_name', { ascending: true }),
        supabase
          .from('historical_event_summary')
          .select('*')
          .eq('historical_tournament_id', tournamentId)
          .order('sort_order', { ascending: true }),
      ]);

      if (standingsResult.error) throw standingsResult.error;
      if (eventsResult.error) throw eventsResult.error;

      setHistoricalStandings((standingsResult.data ?? []) as HistoricalStanding[]);
      setHistoricalEvents((eventsResult.data ?? []) as HistoricalEventSummary[]);
      setMembers([]);
      setProfiles([]);
      setPolls([]);
      setVotes([]);
      setLedger([]);
      setAnnouncements([]);
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      setMessage(getErrorMessage(error, 'Unable to load historical tournament data.'));
    }
  }, []);

  useEffect(() => {
    setExpandedVotePollIds(new Set());

    if (selectedTournamentKind === 'live' && selectedTournamentId) {
      setHistoricalStandings([]);
      setHistoricalEvents([]);
      loadTournamentData(selectedTournamentId);
    }
    if (selectedTournamentKind === 'historical' && selectedHistoricalTournamentId) {
      loadHistoricalTournamentData(selectedHistoricalTournamentId);
    }
  }, [
    loadHistoricalTournamentData,
    loadTournamentData,
    selectedHistoricalTournamentId,
    selectedTournamentId,
    selectedTournamentKind,
  ]);

  const handleJoinTournament = async () => {
    if (!session || !currentTournament) return;

    setMessage('');
    const { error } = await supabase.from('tournament_members').insert({
      tournament_id: currentTournament.id,
      user_id: session.user.id,
      role: 'participant',
      status: 'active',
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTournamentData(currentTournament.id);
    setMessage(`Joined ${currentTournament.name}.`);
  };

  const handleVote = async (poll: Poll, selectedOptionId: string) => {
    if (!session) {
      setMessage('Please sign in before voting.');
      return;
    }

    if (isPollLocked(poll)) {
      setMessage('This poll is locked. Votes can only be changed before the match begins.');
      return;
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from('votes').upsert(
      {
        poll_id: poll.id,
        user_id: session.user.id,
        selected_option_id: selectedOptionId,
        voted_at: now,
        updated_at: now,
      },
      { onConflict: 'poll_id,user_id' },
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTournamentData(poll.tournament_id);
    setMessage(`Vote saved for ${optionLabel(poll, selectedOptionId)}.`);
  };

  const handleShare = async () => {
    const shareUrl = createLiveStandingsShareUrl(currentTournament?.id ?? null);
    const shareText = `FanVerdict standings for ${currentTournament?.name ?? 'our tournament'}: ${shareUrl}`;

    if (navigator.share) {
      await navigator.share({ title: 'FanVerdict', text: shareText, url: shareUrl });
      return;
    }

    await navigator.clipboard?.writeText(shareText);
    setMessage('Dashboard link copied.');
  };

  const handleShareStandingsImage = async () => {
    if (!currentTournament) return;

    if (standings.length === 0) {
      setMessage('No player standings are available to share yet.');
      return;
    }

    setIsSharingStandingsImage(true);
    setMessage('');

    try {
      const shareUrl = createLiveStandingsShareUrl(currentTournament.id);
      const shareText = `FanVerdict Player Standings for ${currentTournament.name}\n${shareUrl}`;
      const imageBlob = await createStandingsShareImage(standings, currentTournament.name, shareUrl);
      const fileName = `${slugifyFileName(currentTournament.name)}-standings.png`;
      const imageFile = new File([imageBlob], fileName, { type: 'image/png' });
      const canShareImage =
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [imageFile] });

      if (canShareImage) {
        await navigator.share({
          title: `${currentTournament.name} standings`,
          text: shareText,
          url: shareUrl,
          files: [imageFile],
        } as ShareData & { files: File[] });
        setMessage('Standings image shared.');
        return;
      }

      downloadBlob(imageBlob, fileName);

      try {
        await navigator.clipboard?.writeText(shareText);
        setMessage('Standings image downloaded and dashboard link copied.');
      } catch {
        setMessage('Standings image downloaded. Copy the dashboard link from the share card if needed.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(getErrorMessage(error, 'Unable to share standings image.'));
    } finally {
      setIsSharingStandingsImage(false);
    }
  };

  const handleLiveDashboardSection = (section: LiveDashboardSection) => {
    setLiveDashboardSection(section);
    window.requestAnimationFrame(() => {
      document.getElementById('live-dashboard-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleScrollToStandings = () => {
    document.getElementById('live-standings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleScrollToPlayerMatrix = () => {
    document.getElementById('player-matrix')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleScrollToPrivateLeagues = () => {
    document.getElementById('private-leagues')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleScrollToInviteFriends = () => {
    const target = document.getElementById('invite-friends') ?? document.getElementById('private-leagues');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleVoteDetails = (pollId: string) => {
    setExpandedVotePollIds((current) => {
      const next = new Set(current);
      if (next.has(pollId)) {
        next.delete(pollId);
      } else {
        next.add(pollId);
      }
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMessage('');
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your local environment before running
            the app.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <a href="/" className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="text-blue-600" size={24} />
            FanVerdict
          </a>

          <div className="flex flex-wrap items-center gap-2">
            {tournamentOptions.length > 0 && (
              <select
                value={selectedTournamentKey}
                onChange={(event) => {
                  const key = event.target.value;
                  const [kind, id] = key.split(':');
                  setSelectedTournamentKey(key);
                  if (kind === 'live') {
                    setSelectedTournamentId(id);
                    setSelectedHistoricalTournamentId('');
                  } else {
                    setSelectedHistoricalTournamentId(id);
                    setSelectedTournamentId('');
                  }
                }}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {tournamentOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.name}
                    {option.seasonYear ? ` (${option.seasonYear})` : ''} - {option.kind === 'historical' ? 'historical' : 'live'}
                  </option>
                ))}
              </select>
            )}

            {canAdmin && (
              <a
                href="/admin"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
              >
                <Shield size={16} />
                Admin
              </a>
            )}

            {session && (
              <a
                href="/claim"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
              >
                <UserCheck size={16} />
                Claim profile
              </a>
            )}

            {session && (
              <a
                href="/account"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
              >
                <Settings size={16} />
                Account
              </a>
            )}

            {session ? (
              <button
                onClick={handleLogout}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <LogOut size={16} />
                Sign out
              </button>
            ) : (
              <a
                href="/login"
                className="inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {message && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            {message}
          </div>
        )}

        {session && announcements.length > 0 && (
          <div className="mb-4 grid gap-3">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-start"
              >
                <Mail className="mt-0.5 shrink-0 text-amber-700" size={18} />
                <div>
                  <p className="font-bold">{announcement.title}</p>
                  <p className="mt-1 whitespace-pre-line">{announcement.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!session ? (
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">FIFA World Cup 2026 Prediction League is LIVE!</h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                Join the league, vote on open polls and track your standings.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <a
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
              >
                Create account or sign in
              </a>
              <span className="text-xs text-slate-500">Sign up with email and password. Phone is optional for alerts.</span>
            </div>
          </section>
        ) : tournamentOptions.length === 0 && loadState !== 'loading' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold">Create your first tournament</h1>
            <p className="mt-2 text-slate-600">
              No tournaments exist yet. Use the admin console to create a live tournament, or import historical standings.
            </p>
            <a
              href="/admin"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            >
              Open admin console
            </a>
          </section>
        ) : selectedTournamentKind === 'historical' && currentHistoricalTournament ? (
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold uppercase text-blue-600">
                      <History size={16} />
                      Historical Tournament
                    </p>
                    <h1 className="mt-1 text-2xl font-bold">{currentHistoricalTournament.name}</h1>
                    <p className="mt-2 text-sm text-slate-600">
                      Imported from {currentHistoricalTournament.source_file ?? 'historical scorebook'}. Signed in as{' '}
                      {profile?.display_name ?? session.user.email}.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/claim"
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      <UserCheck size={16} />
                      Claim profile
                    </a>
                    <button
                      onClick={() => loadHistoricalTournamentData(currentHistoricalTournament.id)}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                    >
                      <RefreshCcw size={16} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Participants</p>
                    <p className="mt-1 text-2xl font-bold">{historicalStandings.length}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Events</p>
                    <p className="mt-1 text-2xl font-bold">{historicalEvents.length}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Claimed</p>
                    <p className="mt-1 text-2xl font-bold">{historicalClaimedCount}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Bonus Winner</p>
                    <p className="mt-1 text-2xl font-bold">{historicalBonusEvent?.correct_option_label ?? 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 font-bold">
                  <CheckCircle2 size={18} />
                  Claim status
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Claimed rows are linked to signed-in FanVerdict accounts. Unclaimed rows are historical names waiting for owner approval.
                </p>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">
                    <span>Claimed profiles</span>
                    <strong>{historicalClaimedCount}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    <span>Unclaimed profiles</span>
                    <strong>{Math.max(historicalStandings.length - historicalClaimedCount, 0)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <BarChart3 size={18} />
                  Historical Standings
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Rank</th>
                      <th className="px-5 py-3">Participant</th>
                      <th className="px-5 py-3">Claim</th>
                      <th className="px-5 py-3">Points</th>
                      <th className="px-5 py-3">Correct</th>
                      <th className="px-5 py-3">Incorrect</th>
                      <th className="px-5 py-3">Missed</th>
                      <th className="px-5 py-3">Accuracy</th>
                      <th className="px-5 py-3">Game Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historicalStandings.map((row, index) => {
                      const claimedByMe = row.claimed_profile_id === session.user.id;
                      const claimed = Boolean(row.claimed_profile_id);
                      const blocked = row.claim_status === 'blocked';

                      return (
                        <tr key={row.historical_participant_id} className={claimedByMe ? 'bg-blue-50/50' : undefined}>
                          <td className="px-5 py-3 font-bold">#{index + 1}</td>
                          <td className="px-5 py-3 font-semibold">{row.display_name}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                                claimedByMe
                                  ? 'bg-blue-100 text-blue-700'
                                  : claimed
                                    ? 'bg-green-100 text-green-700'
                                    : blocked
                                      ? 'bg-red-100 text-red-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {claimedByMe ? 'Your profile' : claimed ? 'Claimed' : blocked ? 'Blocked' : 'Unclaimed'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-lg font-black text-blue-700">{row.total_points}</td>
                          <td className="px-5 py-3">{row.correct_picks}</td>
                          <td className="px-5 py-3">{row.incorrect_picks}</td>
                          <td className="px-5 py-3">{row.missed_events}</td>
                          <td className="px-5 py-3">{row.accuracy_percent}%</td>
                          <td className="px-5 py-3">{row.regular_accuracy_percent}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-bold">Event Summary</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Event</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Correct</th>
                      <th className="px-5 py-3">Incorrect</th>
                      <th className="px-5 py-3">Missed</th>
                      <th className="px-5 py-3">Majority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historicalEvents.slice().reverse().slice(0, 12).map((event) => (
                      <tr key={event.historical_event_id}>
                        <td className="px-5 py-3 font-semibold">{event.label}</td>
                        <td className="px-5 py-3 capitalize">{event.event_type}</td>
                        <td className="px-5 py-3">{event.correct_count}</td>
                        <td className="px-5 py-3">{event.incorrect_count}</td>
                        <td className="px-5 py-3">{event.missed_count}</td>
                        <td className="px-5 py-3 capitalize">
                          {event.majority_result ? event.majority_result.replace('_', ' ') : event.correct_option_label ?? 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="order-1 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-blue-600">Current Tournament</p>
                    <h1 className="mt-1 text-2xl font-bold">{currentTournament?.name ?? 'Select a tournament'}</h1>
                    <p className="mt-2 text-sm text-slate-600">
                      Signed in as {profile?.display_name ?? session.user.email}.{' '}
                      {myMembership ? `Role: ${myMembership.role}.` : 'You have not joined this tournament.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!myMembership && currentTournament && (
                      <button
                        onClick={handleJoinTournament}
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        <Users size={16} />
                        Join tournament
                      </button>
                    )}
                    <button
                      onClick={() => currentTournament && loadTournamentData(currentTournament.id)}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                    >
                      <RefreshCcw size={16} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    onClick={handleScrollToStandings}
                    className="rounded-md border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <p className="text-xs font-semibold uppercase text-slate-500">Player Standings</p>
                    <p className="mt-1 text-2xl font-bold">{standings.length}</p>
                  </button>
                  <button
                    onClick={handleScrollToPlayerMatrix}
                    className="rounded-md border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <p className="text-xs font-semibold uppercase text-slate-500">Player Matrix</p>
                    <p className="mt-1 text-2xl font-bold">{playerMatrix.columns.length}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">settled poll columns</p>
                  </button>
                  <button
                    onClick={() => handleLiveDashboardSection('openPolls')}
                    className={`rounded-md border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${
                      liveDashboardSection === 'openPolls' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase text-slate-500">Open Polls</p>
                    <p className="mt-1 text-2xl font-bold">{openPolls.length}</p>
                  </button>
                  <button
                    onClick={() => handleLiveDashboardSection('settledPolls')}
                    className={`rounded-md border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${
                      liveDashboardSection === 'settledPolls' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase text-slate-500">Settled Polls</p>
                    <p className="mt-1 text-2xl font-bold">{settledPolls.length}</p>
                  </button>
                  <button
                    onClick={() => handleLiveDashboardSection('resultComparison')}
                    className={`rounded-md border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${
                      liveDashboardSection === 'resultComparison' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase text-slate-500">Results vs Voting</p>
                    <div className="mt-2 grid gap-1 text-sm font-bold text-slate-800">
                      <p>Majority {resultComparisonSummary.majorityPickedResult} correct</p>
                      <p>Minority {resultComparisonSummary.minorityPickedResult} correct</p>
                      {resultComparisonSummary.nobodyPickedResult > 0 && (
                        <p>Nobody {resultComparisonSummary.nobodyPickedResult} winners</p>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {resultComparisonSummary.compared} settled poll{resultComparisonSummary.compared === 1 ? '' : 's'}
                    </p>
                  </button>
                  <button
                    onClick={handleScrollToInviteFriends}
                    className="rounded-md border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                      <UserPlus size={14} />
                      Invite Friends
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-700">Send invite</p>
                  </button>
                  <button
                    onClick={handleScrollToPrivateLeagues}
                    className="rounded-md border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <p className="text-xs font-semibold uppercase text-slate-500">Private Leagues</p>
                    <p className="mt-1 text-sm font-bold text-slate-700">Manage</p>
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 font-bold">
                  <Share2 size={18} />
                  Share dashboard
                </h2>
                <p className="mt-2 text-sm text-slate-600">Send the standings link, or share a standings image with the link included.</p>
                <div className="mt-4 grid gap-2">
                  <button
                    onClick={handleShare}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    <Share2 size={16} />
                    Share or copy link
                  </button>
                  <button
                    onClick={handleShareStandingsImage}
                    disabled={isSharingStandingsImage || standings.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <BarChart3 size={16} />
                    {isSharingStandingsImage ? 'Preparing image...' : 'Share standings image'}
                  </button>
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                    href={`https://wa.me/?text=${encodeURIComponent(`FanVerdict standings: ${typeof window !== 'undefined' ? window.location.href : ''}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                    href={`mailto:?subject=${encodeURIComponent('FanVerdict standings')}&body=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                  >
                    <Mail size={16} />
                    Email
                  </a>
                </div>
              </div>
            </section>

            <section id="live-dashboard-detail" className="order-4 scroll-mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-bold">
                  {liveDashboardSection === 'resultComparison' ? <CheckCircle2 size={18} /> : <CalendarClock size={18} />}
                  {liveDetailHeading}
                </h2>
                <span className="text-sm text-slate-500">{liveDetailDescription}</span>
              </div>

              {liveDashboardSection === 'resultComparison' ? (
                <div className="p-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">Compared Polls</p>
                      <p className="mt-1 text-2xl font-bold">{resultComparisonSummary.compared}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">Majority Picked Winner</p>
                      <p className="mt-1 text-2xl font-bold">
                        {resultComparisonSummary.majorityPickedResult}/{resultComparisonSummary.compared}
                      </p>
                    </div>
                    <div className="rounded-md border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">Minority Picked Winner</p>
                      <p className="mt-1 text-2xl font-bold">
                        {resultComparisonSummary.minorityPickedResult}/{resultComparisonSummary.compared}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[940px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Poll</th>
                          <th className="px-5 py-3">Actual Result</th>
                          <th className="px-5 py-3">Vote Leader</th>
                          <th className="px-5 py-3">Result Votes</th>
                          <th className="px-5 py-3">Group Read</th>
                          <th className="px-5 py-3">Participation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resultComparisonRows.length === 0 ? (
                          <tr>
                            <td className="px-5 py-4 text-slate-500" colSpan={6}>
                              No settled polls are available for comparison yet.
                            </td>
                          </tr>
                        ) : (
                          resultComparisonRows.map((row) => {
                            const pollLabel = row.poll.matches?.game_number ? `Game ${row.poll.matches.game_number}` : 'Manual Poll';
                            const leaderLabel =
                              row.leadingLabels.length === 0
                                ? 'No votes'
                                : row.leadingLabels.length === 1
                                  ? row.leadingLabels[0]
                                  : `Tie: ${row.leadingLabels.join(', ')}`;
                            const groupReadLabel =
                              row.totalVotes === 0
                                ? 'No votes'
                                : row.majorityPickedResult
                                  ? 'Majority correct'
                                  : row.resultVoteCount > 0
                                    ? 'Minority correct'
                                    : 'Nobody correct';

                            return (
                              <tr key={row.poll.id}>
                                <td className="px-5 py-3">
                                  <p className="text-xs font-bold uppercase text-slate-500">{pollLabel}</p>
                                  <p className="mt-1 font-semibold">{row.poll.question}</p>
                                </td>
                                <td className="px-5 py-3 font-semibold text-green-700">{row.resultLabel}</td>
                                <td className="px-5 py-3">
                                  <p className="font-semibold">{leaderLabel}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {row.leadingVoteCount} vote{row.leadingVoteCount === 1 ? '' : 's'}
                                    {row.resultMatchedVoteLeader ? ' - matched result' : ''}
                                  </p>
                                </td>
                                <td className="px-5 py-3">
                                  <p className="font-semibold">
                                    {row.resultVoteCount} of {activeMembers.length}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {row.resultVotePercent}% of votes cast. Threshold: {row.majorityThreshold || 'N/A'}
                                  </p>
                                </td>
                                <td className="px-5 py-3">
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                                      row.majorityPickedResult
                                        ? 'bg-green-100 text-green-700'
                                        : row.resultVoteCount > 0
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {groupReadLabel}
                                  </span>
                                </td>
                                <td className="px-5 py-3">
                                  <p className="font-semibold">
                                    {row.totalVotes} voted, {row.missedVotes} missed
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {activeMembers.length} active member{activeMembers.length === 1 ? '' : 's'}
                                  </p>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 p-5 lg:grid-cols-2">
                  {visibleLivePolls.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {liveDashboardSection === 'settledPolls' ? 'No settled polls yet.' : 'No open polls are available right now.'}
                    </p>
                  ) : (
                    visibleLivePolls.map((poll) => {
                      const settled = poll.status === 'settled';
                      const locked = settled || isPollLocked(poll);
                      const currentVote = myVotes.get(poll.id);
                      const options = sortedPollOptions(poll);
                      const votesForPoll = (votesByPollId.get(poll.id) ?? []).filter((vote) => activeMemberIds.has(vote.user_id));
                      const totalVotes = votesForPoll.length;
                      const votedMemberIds = new Set(votesForPoll.map((vote) => vote.user_id));
                      const notVotedMembers = activeMembers.filter((member) => !votedMemberIds.has(member.user_id));
                      const voteDetailsExpanded = expandedVotePollIds.has(poll.id);
                      const canVote = !locked && Boolean(myMembership);

                      return (
                        <article key={poll.id} className="rounded-lg border border-slate-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-500">
                                {poll.matches?.game_number ? `Game ${poll.matches.game_number}` : 'Manual Poll'}
                              </p>
                              <h3 className="mt-1 text-lg font-bold">{poll.question}</h3>
                              <p className="mt-1 text-sm text-slate-600">Locks: {formatDateTime(poll.locks_at)}</p>
                              {settled && (
                                <p className="mt-1 text-sm font-semibold text-green-700">
                                  Result: {optionLabel(poll, poll.result_option_id)}
                                </p>
                              )}
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                Worth {poll.points_per_correct || 1} point{(poll.points_per_correct || 1) === 1 ? '' : 's'}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                                settled ? 'bg-green-100 text-green-700' : locked ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {settled ? 'settled' : locked ? poll.status : 'open'}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-2">
                            {options.map((option) => {
                              const optionVotes = votesForPoll.filter((vote) => vote.selected_option_id === option.id);
                              const votePercent = totalVotes ? Math.round((optionVotes.length / totalVotes) * 100) : 0;
                              const isWinningOption = poll.result_option_id === option.id;
                              const isMyVote = currentVote?.selected_option_id === option.id;

                              return (
                                <button
                                  key={option.id}
                                  disabled={!canVote}
                                  onClick={() => handleVote(poll, option.id)}
                                  className={`relative min-h-14 overflow-hidden rounded-md border px-3 py-2 text-left text-sm font-bold transition ${
                                    isWinningOption
                                      ? 'border-green-600 text-green-800'
                                      : isMyVote
                                        ? 'border-blue-600 text-blue-800'
                                        : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                                  } disabled:cursor-not-allowed`}
                                >
                                  <span
                                    className={`absolute inset-y-0 left-0 ${
                                      isWinningOption ? 'bg-green-100' : isMyVote ? 'bg-blue-100' : 'bg-slate-100'
                                    }`}
                                    style={{ width: `${votePercent}%` }}
                                  />
                                  <span className="relative flex items-center justify-between gap-3">
                                    <span>{option.label}</span>
                                    <span className="shrink-0 text-xs font-semibold text-slate-600">
                                      {optionVotes.length} vote{optionVotes.length === 1 ? '' : 's'} - {votePercent}%
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                            <p>
                              Your vote:{' '}
                              {currentVote
                                ? `${optionLabel(poll, currentVote.selected_option_id)} at ${formatDateTime(currentVote.updated_at)}`
                                : 'Not cast'}
                            </p>
                            <button
                              onClick={() => toggleVoteDetails(poll.id)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              {voteDetailsExpanded ? 'Hide votes' : 'View votes'}
                            </button>
                          </div>

                          {voteDetailsExpanded && (
                            <div className="mt-4 border-t border-slate-200 pt-4 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-bold text-slate-900">Vote breakdown</p>
                                <p className="text-xs font-semibold text-slate-500">
                                  {totalVotes} of {activeMembers.length} participant{activeMembers.length === 1 ? '' : 's'} voted
                                </p>
                              </div>

                              <div className="mt-3 grid gap-4 md:grid-cols-2">
                                {options.map((option) => {
                                  const optionVoters = activeMembers.filter((member) =>
                                    votesForPoll.some((vote) => vote.user_id === member.user_id && vote.selected_option_id === option.id),
                                  );

                                  return (
                                    <div key={`votes-${poll.id}-${option.id}`} className="min-w-0">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="truncate font-semibold">{option.label}</p>
                                        <span className="text-xs font-bold text-slate-500">{optionVoters.length}</span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {optionVoters.length === 0 ? (
                                          <span className="text-xs text-slate-500">No votes</span>
                                        ) : (
                                          optionVoters.map((member) => (
                                            <span key={`${option.id}-${member.user_id}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                              {profileById.get(member.user_id)?.display_name ?? 'Unknown player'}
                                            </span>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                <div className="min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate font-semibold">Not voted</p>
                                    <span className="text-xs font-bold text-slate-500">{notVotedMembers.length}</span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {notVotedMembers.length === 0 ? (
                                      <span className="text-xs text-slate-500">Everyone has voted</span>
                                    ) : (
                                      notVotedMembers.map((member) => (
                                        <span key={`not-voted-${poll.id}-${member.user_id}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                          {profileById.get(member.user_id)?.display_name ?? 'Unknown player'}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              )}
            </section>

            {currentTournament && (
              <div className="order-5">
                <PrivateLeaguesPanel
                  session={session}
                  tournament={currentTournament}
                  activeMembers={activeMembers}
                  profiles={profiles}
                  standings={standings}
                  canTournamentAdmin={canAdmin}
                  onTournamentRefresh={() => loadTournamentData(currentTournament.id)}
                />
              </div>
            )}

            <section id="live-standings" className="order-2 scroll-mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <BarChart3 size={18} />
                  Player Standings
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Rank</th>
                      <th className="px-5 py-3">Participant</th>
                      <th className="px-5 py-3">Points</th>
                      <th className="px-5 py-3">Correct</th>
                      <th className="px-5 py-3">Settled Votes</th>
                      <th className="px-5 py-3">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {standings.map((row, index) => (
                      <tr key={row.user_id}>
                        <td className="px-5 py-3 font-bold">#{index + 1}</td>
                        <td className="px-5 py-3 font-semibold">
                          {currentTournament ? (
                            <a
                              href={`/players/${row.user_id}?tournament=${currentTournament.id}`}
                              className="text-blue-700 hover:text-blue-900 hover:underline"
                            >
                              {row.display_name}
                            </a>
                          ) : (
                            row.display_name
                          )}
                        </td>
                        <td className="px-5 py-3 text-lg font-black text-blue-700">{row.total_points}</td>
                        <td className="px-5 py-3">{row.correct_picks}</td>
                        <td className="px-5 py-3">{row.settled_votes}</td>
                        <td className="px-5 py-3">{row.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="player-matrix" className="order-3 scroll-mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="flex items-center gap-2 font-bold">
                    <BarChart3 size={18} />
                    Player Matrix
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {playerMatrix.columns.length} settled poll{playerMatrix.columns.length === 1 ? '' : 's'} compared across{' '}
                    {playerMatrix.rows.length} player{playerMatrix.rows.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800">Points won</span>
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-800">Wrong pick</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Missed</span>
                </div>
              </div>

              {playerMatrix.columns.length === 0 ? (
                <div className="px-5 py-5 text-sm text-slate-500">No settled polls are available for the player matrix yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="text-left text-sm"
                    style={{ minWidth: `${Math.max(900, playerMatrix.columns.length * 72 + 520)}px` }}
                  >
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="sticky left-0 z-20 min-w-[180px] bg-slate-50 px-5 py-3">Player</th>
                        {playerMatrix.columns.map((column) => (
                          <th key={column.poll.id} className="w-[72px] px-2 py-3 text-center" title={column.title}>
                            <span className="block font-black text-slate-700">{column.label}</span>
                            <span className="mt-1 block truncate text-[10px] normal-case text-slate-500">{column.resultLabel}</span>
                          </th>
                        ))}
                        {playerMatrix.hasAdjustments && <th className="w-[88px] px-3 py-3 text-right">Adjust</th>}
                        <th className="w-[88px] px-3 py-3 text-right">Total</th>
                        <th className="w-[92px] px-3 py-3 text-right">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {playerMatrix.rows.map((row) => (
                        <tr key={`matrix-${row.user_id}`}>
                          <td className="sticky left-0 z-10 bg-white px-5 py-3">
                            <p className="font-bold text-slate-900">{row.display_name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {row.correct_picks} correct, {row.missedPicks} missed
                            </p>
                          </td>
                          {row.cells.map((cell, index) => {
                            const column = playerMatrix.columns[index];
                            const cellLabel = cell.status === 'missed' ? '-' : cell.points;
                            const title =
                              cell.status === 'missed'
                                ? `${row.display_name} did not vote on ${column.title}. Result: ${cell.resultLabel}.`
                                : `${row.display_name} picked ${cell.selectedLabel}. Result: ${cell.resultLabel}. Points: ${cell.points}.`;

                            return (
                              <td key={`${row.user_id}-${cell.pollId}`} className="px-2 py-2 text-center" title={title}>
                                <span
                                  className={`inline-flex h-8 w-10 items-center justify-center rounded-md text-xs font-black ${
                                    cell.status === 'correct'
                                      ? 'bg-green-100 text-green-800 ring-1 ring-green-200'
                                      : cell.status === 'incorrect'
                                        ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
                                        : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                                  }`}
                                >
                                  {cellLabel}
                                </span>
                              </td>
                            );
                          })}
                          {playerMatrix.hasAdjustments && (
                            <td className="px-3 py-3 text-right font-semibold text-slate-700">
                              {row.adjustmentPoints > 0 ? `+${row.adjustmentPoints}` : row.adjustmentPoints}
                            </td>
                          )}
                          <td className="px-3 py-3 text-right text-lg font-black text-blue-700">{row.total_points}</td>
                          <td className="px-3 py-3 text-right font-semibold">{row.accuracy}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <tr>
                        <td className="sticky left-0 z-10 bg-slate-50 px-5 py-3 font-bold uppercase text-slate-500">Result</td>
                        {playerMatrix.columns.map((column) => (
                          <td key={`result-${column.poll.id}`} className="px-2 py-3 text-center" title={column.resultLabel}>
                            <span className="block truncate text-slate-700">{column.resultLabel}</span>
                          </td>
                        ))}
                        {playerMatrix.hasAdjustments && <td className="px-3 py-3" />}
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3" />
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-10 bg-slate-50 px-5 py-3 font-bold uppercase text-slate-500">
                          Winning voters
                        </td>
                        {playerMatrix.columns.map((column) => (
                          <td key={`winning-voters-${column.poll.id}`} className="px-2 py-3 text-center">
                            {column.winningVoters}
                          </td>
                        ))}
                        {playerMatrix.hasAdjustments && <td className="px-3 py-3" />}
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3" />
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-10 bg-slate-50 px-5 py-3 font-bold uppercase text-slate-500">Group read</td>
                        {playerMatrix.columns.map((column) => (
                          <td key={`group-read-${column.poll.id}`} className="px-2 py-3 text-center" title={column.groupRead}>
                            <span
                              className={`inline-flex min-w-10 justify-center rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                                column.groupRead === 'Majority Win'
                                  ? 'bg-green-100 text-green-800'
                                  : column.groupRead === 'Minority Win'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {column.groupRead === 'Majority Win' ? 'Maj' : column.groupRead === 'Minority Win' ? 'Min' : 'None'}
                            </span>
                          </td>
                        ))}
                        {playerMatrix.hasAdjustments && <td className="px-3 py-3" />}
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            <section className="order-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-bold">Vote Audit Log</h2>
                <p className="mt-1 text-sm text-slate-500">Every visible vote includes the participant and latest vote time.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Participant</th>
                      <th className="px-5 py-3">Poll</th>
                      <th className="px-5 py-3">Vote</th>
                      <th className="px-5 py-3">Voted At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentVotes.length === 0 ? (
                      <tr>
                        <td className="px-5 py-4 text-slate-500" colSpan={4}>
                          No votes have been cast yet.
                        </td>
                      </tr>
                    ) : (
                      recentVotes.map((vote) => {
                        const poll = pollById.get(vote.poll_id);

                        return (
                          <tr key={vote.id}>
                            <td className="px-5 py-3 font-semibold">{profileById.get(vote.user_id)?.display_name ?? 'Unknown player'}</td>
                            <td className="px-5 py-3">{poll?.question ?? 'Poll removed'}</td>
                            <td className="px-5 py-3">{poll ? optionLabel(poll, vote.selected_option_id) : 'Unknown option'}</td>
                            <td className="px-5 py-3">{formatDateTime(vote.updated_at)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {loadState === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading latest FanVerdict data...</p>}
      </main>
    </div>
  );
}
