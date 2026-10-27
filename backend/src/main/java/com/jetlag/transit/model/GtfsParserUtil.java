package com.jetlag.transit.model;

import org.apache.commons.csv.CSVRecord;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

class GtfsParserUtil {
  public static String required(CSVRecord record, String column)
    throws IOException {
    String value = optional(record, column);

    if (value == null) {
      throw new IOException(
        "Missing required value '" + column
          + "' on GTFS row " + record.getRecordNumber());
    }

    return value;
  }

  public static String optional(CSVRecord record, String column) {
    // A UTF-8 BOM may appear at the start of the first header.
    String actualColumn = record.getParser()
      .getHeaderMap()
      .keySet()
      .stream()
      .filter(header ->
        header.replace("\uFEFF", "").equals(column))
      .findFirst()
      .orElse(column);

    if (!record.isMapped(actualColumn)) {
      return null;
    }

    String value = record.get(actualColumn);
    return value == null || value.isBlank() ? null : value;
  }

  public static Double decimal(CSVRecord record, String column)
    throws IOException {
    String value = optional(record, column);

    if (value == null) {
      return null;
    }

    try {
      double parsed = Double.parseDouble(value);

      if (!Double.isFinite(parsed)) {
        throw new NumberFormatException("Non-finite coordinate");
      }

      return parsed;
    } catch (NumberFormatException exception) {
      throw new IOException(
        "Invalid " + column + " on GTFS row "
          + record.getRecordNumber() + ": " + value,
        exception);
    }
  }

  /** A GTFS date, written YYYYMMDD. */
  public static LocalDate date(CSVRecord record, String column)
    throws IOException {
    String value = optional(record, column);

    if (value == null) {
      return null;
    }

    try {
      return LocalDate.parse(value.trim(), DateTimeFormatter.BASIC_ISO_DATE);
    } catch (DateTimeParseException exception) {
      throw new IOException(
        "Invalid " + column + " on GTFS row "
          + record.getRecordNumber() + ": " + value,
        exception);
    }
  }

  public static Integer integer(CSVRecord record, String column)
    throws IOException {
    String value = optional(record, column);

    if (value == null) {
      return null;
    }

    try {
      return Integer.valueOf(value);
    } catch (NumberFormatException exception) {
      throw new IOException(
        "Invalid " + column + " on GTFS row "
          + record.getRecordNumber() + ": " + value,
        exception);
    }
  }
}
