-- Verifies the dynamic poll-option schema needed by the current app.

select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'poll_options'
  ) as has_poll_options_table,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'polls'
      and column_name = 'points_per_correct'
  ) as has_poll_points_column,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'polls'
      and column_name = 'result_option_id'
  ) as has_poll_result_option_id_column,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'votes'
      and column_name = 'selected_option_id'
  ) as has_vote_selected_option_id_column;
