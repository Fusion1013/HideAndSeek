-- The seekers' questions and the hiders' answers. Seekers ask one at a time; the hiders answer before the deadline
-- or the question expires.
CREATE TABLE game_question (
  id          uuid PRIMARY KEY,
  game_id     uuid NOT NULL REFERENCES game ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('MATCHING', 'MEASURING', 'RADAR', 'THERMOMETER', 'TENTACLES')),
  -- What the question is about: a category of place, a distance, and where the asking seeker was
  params      jsonb NOT NULL,
  status      text NOT NULL CHECK (status IN ('PENDING', 'ANSWERED', 'EXPIRED')),
  asked_by    uuid NOT NULL REFERENCES game_player ON DELETE CASCADE,
  asked_at    timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  answer      jsonb,
  answered_by uuid REFERENCES game_player ON DELETE SET NULL,
  answered_at timestamptz,
  CHECK ((status = 'ANSWERED') = (answer IS NOT NULL))
);

CREATE INDEX ix_game_question_game ON game_question (game_id, asked_at);
-- One question waits for an answer at a time
CREATE UNIQUE INDEX ux_game_question_pending ON game_question (game_id) WHERE status = 'PENDING';
-- Finds the questions whose time is up
CREATE INDEX ix_game_question_deadline ON game_question (deadline_at) WHERE status = 'PENDING';
