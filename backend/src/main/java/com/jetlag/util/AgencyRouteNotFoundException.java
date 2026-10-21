package com.jetlag.util;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class AgencyRouteNotFoundException extends RuntimeException {

  public AgencyRouteNotFoundException(String routeId) {
    super("Agency route not found: " + routeId);
  }
}
