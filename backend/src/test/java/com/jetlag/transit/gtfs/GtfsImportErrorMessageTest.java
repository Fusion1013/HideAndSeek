package com.jetlag.transit.gtfs;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

class GtfsImportErrorMessageTest {

  @TempDir
  Path directory;

  private Path write(byte[] bytes) throws IOException {
    return Files.write(directory.resolve("body"), bytes);
  }

  @Test
  void readsAGzippedErrorResponse() throws IOException {
    ByteArrayOutputStream compressed = new ByteArrayOutputStream();
    try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) {
      gzip.write("{\"message\":\"API key quota exceeded\"}".getBytes(StandardCharsets.UTF_8));
    }

    assertThat(GtfsImportService.errorMessage(write(compressed.toByteArray())))
      .isEqualTo("{\"message\":\"API key quota exceeded\"}");
  }

  @Test
  void readsPlainTextAndToleratesBytesThatAreNotText() throws IOException {
    assertThat(GtfsImportService.errorMessage(write("Unauthorized\n".getBytes(StandardCharsets.UTF_8))))
      .isEqualTo("Unauthorized");
    assertThat(GtfsImportService.errorMessage(write(new byte[] {'o', 'k', (byte) 0xff})))
      .startsWith("ok");
  }

  @Test
  void cutsLongBodiesShort() throws IOException {
    assertThat(GtfsImportService.errorMessage(write("x".repeat(2_000).getBytes(StandardCharsets.UTF_8))))
      .hasSize(503)
      .endsWith("...");
  }
}
