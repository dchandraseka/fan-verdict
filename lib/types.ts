export type NotificationChannel = 'email' | 'none';
export type TournamentRole = 'owner' | 'admin' | 'participant';
export type TournamentStatus = 'draft' | 'active' | 'completed' | 'archived';
export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type PollStatus = 'draft' | 'open' | 'locked' | 'settled' | 'cancelled';
export type LedgerReason = 'correct_pick' | 'manual_adjustment' | 'historical_import';
export type PrivateLeagueVisibility = 'discoverable' | 'unlisted';
export type PrivateLeagueStatus = 'active' | 'archived';
export type PrivateLeagueRole = 'owner' | 'admin' | 'member';
export type PrivateLeagueMemberStatus = 'invited' | 'active' | 'removed' | 'declined';
export type PrivateLeagueJoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PrivateLeagueEmailInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type TournamentAnnouncementStatus = 'active' | 'removed';
export type HistoricalEventType = 'game' | 'playoff' | 'bonus';
export type HistoricalClaimStatus = 'unclaimed' | 'claimed' | 'blocked';
export type HistoricalClaimRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type Profile = {
  id: string;
  display_name: string;
  email: string | null;
  avatar_path: string | null;
  whatsapp_number: string | null;
  notification_channel: NotificationChannel;
  created_at: string;
  updated_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  season_year: number | null;
  sport: string;
  status: TournamentStatus;
  starts_on: string | null;
  ends_on: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TournamentMember = {
  id: string;
  tournament_id: string;
  user_id: string;
  role: TournamentRole;
  status: 'invited' | 'active' | 'removed';
  joined_at: string;
};

export type Match = {
  id: string;
  tournament_id: string;
  game_number: number | null;
  source_ref: string | null;
  team_a: string;
  team_b: string;
  starts_at: string;
  venue: string | null;
  status: MatchStatus;
  winner_team: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Poll = {
  id: string;
  tournament_id: string;
  match_id: string | null;
  question: string;
  opens_at: string;
  locks_at: string;
  status: PollStatus;
  result_option_id: string | null;
  points_per_correct: number;
  created_by: string | null;
  settled_by: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
  matches?: Match | null;
  poll_options?: PollOption[];
};

export type PollOption = {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Vote = {
  id: string;
  poll_id: string;
  user_id: string;
  selected_option_id: string;
  voted_at: string;
  updated_at: string;
};

export type PointsLedger = {
  id: string;
  tournament_id: string;
  poll_id: string | null;
  user_id: string;
  delta: number;
  reason: LedgerReason;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type TournamentAnnouncement = {
  id: string;
  tournament_id: string;
  title: string;
  body: string;
  status: TournamentAnnouncementStatus;
  created_by: string | null;
  removed_by: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivateLeague = {
  id: string;
  tournament_id: string;
  name: string;
  description: string | null;
  visibility: PrivateLeagueVisibility;
  status: PrivateLeagueStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PrivateLeagueMember = {
  id: string;
  league_id: string;
  profile_id: string;
  role: PrivateLeagueRole;
  status: PrivateLeagueMemberStatus;
  invited_by: string | null;
  joined_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivateLeagueJoinRequest = {
  id: string;
  league_id: string;
  requester_profile_id: string;
  status: PrivateLeagueJoinRequestStatus;
  attempt_number: number;
  request_note: string | null;
  review_note: string | null;
  reviewed_by_profile_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivateLeagueEmailInvite = {
  id: string;
  league_id: string;
  tournament_id: string;
  invited_email: string;
  token_hash: string;
  status: PrivateLeagueEmailInviteStatus;
  invited_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type StandingRow = {
  user_id: string;
  display_name: string;
  role: TournamentRole;
  total_points: number;
  correct_picks: number;
  settled_votes: number;
  accuracy: number;
};

export type HistoricalTournament = {
  id: string;
  name: string;
  season_year: number;
  sport: string;
  source_file: string | null;
  imported_at: string;
  created_at: string;
  updated_at: string;
};

export type HistoricalParticipant = {
  id: string;
  display_name: string;
  normalized_name: string;
  claimed_profile_id: string | null;
  claim_status: HistoricalClaimStatus;
  created_at: string;
  updated_at: string;
};

export type HistoricalStanding = {
  historical_tournament_id: string;
  tournament_name: string;
  season_year: number;
  historical_participant_id: string;
  display_name: string;
  claimed_profile_id: string | null;
  claim_status: HistoricalClaimStatus;
  total_points: number;
  bonus_points: number | null;
  correct_picks: number;
  incorrect_picks: number;
  missed_events: number;
  participated_events: number;
  total_events: number;
  regular_correct_picks: number;
  regular_incorrect_picks: number;
  regular_missed_events: number;
  regular_participated_events: number;
  accuracy_percent: number;
  regular_accuracy_percent: number;
};

export type HistoricalEventSummary = {
  historical_tournament_id: string;
  tournament_name: string;
  season_year: number;
  historical_event_id: string;
  event_key: string;
  label: string;
  event_type: HistoricalEventType;
  sort_order: number;
  points_available: number;
  submitted_vote_count: number;
  winning_vote_count: number;
  majority_threshold: number | null;
  majority_result: 'majority_correct' | 'minority_correct' | null;
  correct_option_label: string | null;
  correct_count: number;
  incorrect_count: number;
  missed_count: number;
};

export type HistoricalClaimRequest = {
  id: string;
  historical_participant_id: string;
  requester_profile_id: string;
  status: HistoricalClaimRequestStatus;
  request_note: string | null;
  review_note: string | null;
  reviewed_by_profile_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
