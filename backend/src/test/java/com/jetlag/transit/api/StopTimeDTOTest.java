package com.jetlag.transit.api;

import com.jetlag.transit.model.StopTimeEntity;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StopTimeDTOTest {

  @Test
  void carriesPickupAndDropOffTypes() {
    StopTimeEntity entity = new StopTimeEntity();
    entity.setPickupType(1);
    entity.setDropOffType(3);

    StopTimeDTO dto = StopTimeDTO.from(entity);

    assertThat(dto.pickupType()).isEqualTo(1);
    assertThat(dto.dropOffType()).isEqualTo(3);
  }

  @Test
  void leavesEmptyPickupAndDropOffTypesEmpty() {
    StopTimeDTO dto = StopTimeDTO.from(new StopTimeEntity());

    assertThat(dto.pickupType()).isNull();
    assertThat(dto.dropOffType()).isNull();
  }
}
