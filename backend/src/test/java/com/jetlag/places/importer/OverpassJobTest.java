package com.jetlag.places.importer;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class OverpassJobTest {

  private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
    .withBean(OverpassImportService.class, () -> mock(OverpassImportService.class))
    .withUserConfiguration(OverpassJob.class);

  @Test
  void runsOnlyWhenEnabled() {
    contextRunner.withPropertyValues("overpass.update.enabled=true").run(context -> assertThat(context).hasSingleBean(OverpassJob.class));
    contextRunner.withPropertyValues("overpass.update.enabled=false").run(context -> assertThat(context).doesNotHaveBean(OverpassJob.class));
    contextRunner.run(context -> assertThat(context).doesNotHaveBean(OverpassJob.class));
  }
}
