-- Custom questions: the seekers write the question themselves (kept in params), and the hiders answer yes or no.
ALTER TABLE game_question DROP CONSTRAINT game_question_type_check;
ALTER TABLE game_question ADD CONSTRAINT game_question_type_check
  CHECK (type IN ('MATCHING', 'MEASURING', 'RADAR', 'THERMOMETER', 'TENTACLES', 'PHOTO', 'CUSTOM'));
