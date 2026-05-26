export type NotificationChannel = 'email' | 'whatsapp';
export type TournamentRole = 'owner' | 'admin' | 'participant';
export type TournamentStatus = 'draft' | 'active' | 'completed' | 'archived';
export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type PollStatus = 'draft' | 'open' | 'locked' | 'settled' | 'cancelled';
export type LedgerReason = 'correct_pick' | 'manual_adjustment' | 'historical_import';

export type Profile = {
  id: string;
  display_name: string;
  email: string | null;
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

export type StandingRow = {
  user_id: string;
  display_name: string;
  role: TournamentRole;
  total_points: number;
  correct_picks: number;
  settled_votes: number;
  accuracy: number;
};
