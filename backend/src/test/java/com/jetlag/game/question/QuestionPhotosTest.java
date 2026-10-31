package com.jetlag.game.question;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuestionPhotosTest {

  private static final String SECRET = "GPS 57.7000N 11.9700E";

  private static byte[] encoded(String format, int width, int height, int imageType) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(width, height, imageType), format, bytes);
    return bytes.toByteArray();
  }

  /** The JPEG with a metadata segment (APP1, where a phone puts its EXIF) right after its start. */
  private static byte[] withMetadata(byte[] jpeg, String metadata) {
    byte[] content = ("Exif\0\0" + metadata).getBytes(StandardCharsets.ISO_8859_1);
    int length = content.length + 2;
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    bytes.write(jpeg, 0, 2);
    bytes.write(new byte[]{(byte) 0xFF, (byte) 0xE1, (byte) (length >> 8), (byte) length}, 0, 4);
    bytes.write(content, 0, content.length);
    bytes.write(jpeg, 2, jpeg.length - 2);
    return bytes.toByteArray();
  }

  private static void assertRefused(byte[] upload) {
    assertThatThrownBy(() -> QuestionPhotos.withoutMetadata(upload))
      .isInstanceOfSatisfying(ResponseStatusException.class,
        refused -> assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
  }

  @Test
  void keepsThePixelsButNotWhereThePhotoWasTaken() throws IOException {
    byte[] upload = withMetadata(encoded("jpeg", 40, 30, BufferedImage.TYPE_INT_RGB), SECRET);
    assertThat(new String(upload, StandardCharsets.ISO_8859_1)).contains(SECRET);

    byte[] kept = QuestionPhotos.withoutMetadata(upload);

    assertThat(new String(kept, StandardCharsets.ISO_8859_1)).doesNotContain(SECRET).doesNotContain("Exif");
    BufferedImage image = ImageIO.read(new ByteArrayInputStream(kept));
    assertThat(image.getWidth()).isEqualTo(40);
    assertThat(image.getHeight()).isEqualTo(30);
  }

  @Test
  void makesAJpegOfOtherPictures() throws IOException {
    byte[] kept = QuestionPhotos.withoutMetadata(encoded("png", 20, 20, BufferedImage.TYPE_INT_ARGB));

    assertThat(kept).startsWith((byte) 0xFF, (byte) 0xD8);
    assertThat(ImageIO.read(new ByteArrayInputStream(kept)).getWidth()).isEqualTo(20);
  }

  @Test
  void refusesWhatIsNotAPicture() {
    assertRefused(new byte[0]);
    assertRefused("not a picture".getBytes(StandardCharsets.UTF_8));
    assertRefused(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0});
  }

  @Test
  void refusesPicturesTooLargeToDecode() throws IOException {
    assertRefused(encoded("png", QuestionPhotos.MAX_SIDE_PIXELS + 1, 1, BufferedImage.TYPE_BYTE_BINARY));
  }
}
