package com.jetlag.transit.model;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringReader;
import java.time.DayOfWeek;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CalendarEntityTest {

  @Test
  void parsesWeekdaysAndDates() throws IOException {
    CalendarEntity calendar = new CalendarEntity(record("""
      service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
      42,1,1,1,1,1,0,0,20261009,20261211
      """), "generation");

    assertThat(calendar.getServiceId()).isEqualTo("42");
    assertThat(calendar.isMonday()).isTrue();
    assertThat(calendar.isFriday()).isTrue();
    assertThat(calendar.isSaturday()).isFalse();
    assertThat(calendar.isSunday()).isFalse();
    assertThat(calendar.getStartDate()).isEqualTo(LocalDate.of(2026, 10, 9));
    assertThat(calendar.getEndDate()).isEqualTo(LocalDate.of(2026, 12, 11));
    assertThat(CalendarEntity.column(DayOfWeek.WEDNESDAY)).isEqualTo("wednesday");
  }

  @Test
  void parsesCalendarDates() throws IOException {
    CalendarDateEntity calendarDate = new CalendarDateEntity(record("""
      service_id,date,exception_type
      42,20261227,2
      """), "generation");

    assertThat(calendarDate.getServiceId()).isEqualTo("42");
    assertThat(calendarDate.getDate()).isEqualTo(LocalDate.of(2026, 12, 27));
    assertThat(calendarDate.getExceptionType()).isEqualTo(CalendarDateEntity.REMOVED);
  }

  @Test
  void rejectsMalformedDates() {
    assertThatThrownBy(() -> new CalendarDateEntity(record("""
      service_id,date,exception_type
      42,2026-12-27,1
      """), "generation")).isInstanceOf(RuntimeException.class);
  }

  private static CSVRecord record(String csv) throws IOException {
    return CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).get()
      .parse(new StringReader(csv)).getRecords().getFirst();
  }
}
