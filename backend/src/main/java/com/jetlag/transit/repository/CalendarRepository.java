package com.jetlag.transit.repository;

import com.jetlag.transit.model.CalendarEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CalendarRepository extends GtfsRepository<CalendarEntity, String> {

  @Modifying
  @Query("""
        DELETE FROM CalendarEntity calendar
        WHERE calendar.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

}
