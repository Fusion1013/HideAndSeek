package com.jetlag.transit.repository;

import com.jetlag.transit.model.CalendarDateEntity;
import com.jetlag.transit.model.CalendarDateId;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CalendarDateRepository extends GtfsRepository<CalendarDateEntity, CalendarDateId> {

  @Modifying
  @Query("""
        DELETE FROM CalendarDateEntity calendarDate
        WHERE calendarDate.importGeneration <> :generation
        """)
  int deleteNotInGeneration(
    @Param("generation") String generation);

}
