package com.jetlag.game.question;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;

/**
 * What is kept of a picture the hiders send: its pixels, as a new JPEG. A phone's photo says in its metadata where it
 * was taken, which the seekers must not get to read, so nothing of the original file is passed on.
 */
final class QuestionPhotos {

  /** Decoding takes memory by the pixel, whatever the size of the file; the app itself sends at most 2048. */
  static final int MAX_SIDE_PIXELS = 4096;
  private static final float JPEG_QUALITY = 0.85f;

  private QuestionPhotos() {
  }

  /** The picture as a JPEG with nothing but its pixels; a 400 if it is not one that can be read. */
  static byte[] withoutMetadata(byte[] upload) {
    try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(upload))) {
      Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw unreadable();
      ImageReader reader = readers.next();
      try {
        reader.setInput(input, true, true);
        if (reader.getWidth(0) > MAX_SIDE_PIXELS || reader.getHeight(0) > MAX_SIDE_PIXELS) {
          throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "The photo must be at most " + MAX_SIDE_PIXELS + " pixels on each side");
        }
        return jpeg(reader.read(0));
      } finally {
        reader.dispose();
      }
    } catch (IOException | IllegalArgumentException e) {
      throw unreadable();
    }
  }

  private static byte[] jpeg(BufferedImage image) throws IOException {
    // JPEG has no transparency: what shows through is drawn on white
    BufferedImage opaque = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
    Graphics2D graphics = opaque.createGraphics();
    graphics.drawImage(image, 0, 0, Color.WHITE, null);
    graphics.dispose();

    ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
    ImageWriteParam quality = writer.getDefaultWriteParam();
    quality.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
    quality.setCompressionQuality(JPEG_QUALITY);
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (ImageOutputStream output = new MemoryCacheImageOutputStream(bytes)) {
      writer.setOutput(output);
      writer.write(null, new IIOImage(opaque, null, null), quality);
    } finally {
      writer.dispose();
    }
    return bytes.toByteArray();
  }

  private static ResponseStatusException unreadable() {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, "That file could not be read as a photo");
  }
}
