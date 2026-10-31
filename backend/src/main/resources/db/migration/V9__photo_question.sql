-- Photo questions: the hiders answer with a picture, kept apart so listing the questions does not load every image.
ALTER TABLE game_question DROP CONSTRAINT game_question_type_check;
ALTER TABLE game_question ADD CONSTRAINT game_question_type_check
  CHECK (type IN ('MATCHING', 'MEASURING', 'RADAR', 'THERMOMETER', 'TENTACLES', 'PHOTO'));

CREATE TABLE game_question_photo (
  question_id uuid PRIMARY KEY REFERENCES game_question ON DELETE CASCADE,
  -- A JPEG, without the metadata of the picture it was made from
  image       bytea NOT NULL
);
