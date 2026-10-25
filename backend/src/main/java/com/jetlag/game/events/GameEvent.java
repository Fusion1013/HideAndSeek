package com.jetlag.game.events;

import java.util.UUID;

/**
 * An event in a game's log. {@code payload} is the JSON sent to the players as the event's data.
 * Also published as an application event once recorded, and pushed to the players after the commit.
 */
public record GameEvent(long id, UUID gameId, String type, EventAudience audience, String payload) {
}
