package com.jetlag;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Hello")
public class HelloController {
    @GetMapping(value = "/api/hello", produces = "text/plain")
    @Operation(operationId = "getHello", summary = "Get a greeting from the backend")
    public String getHello() {
        return "Hello, world!";
    }
}