package com.jetlag.transit.gtfs;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class GtfsUpdateJobTest {

  private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
    .withBean(GtfsImportService.class, () -> mock(GtfsImportService.class))
    .withUserConfiguration(GtfsUpdateJob.class);

  @Test
  void runsOnlyWhenEnabled() {
    contextRunner.withPropertyValues("gtfs.update.enabled=true").run(context -> assertThat(context).hasSingleBean(GtfsUpdateJob.class));
    contextRunner.withPropertyValues("gtfs.update.enabled=false").run(context -> assertThat(context).doesNotHaveBean(GtfsUpdateJob.class));
    contextRunner.run(context -> assertThat(context).doesNotHaveBean(GtfsUpdateJob.class));
  }
}
