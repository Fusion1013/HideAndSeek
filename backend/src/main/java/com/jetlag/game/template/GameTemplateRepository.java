package com.jetlag.game.template;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface GameTemplateRepository extends JpaRepository<GameTemplateEntity, UUID> {
}
