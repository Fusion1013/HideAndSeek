/** One server-sent event. */
export interface SseMessage {
  /** The event's "event:" field; "message" when it has none. */
  type: string;
  data: string;
  /** The event's "id:" field, if it had one. */
  id?: string;
}

/**
 * Reads the server-sent events format (https://html.spec.whatwg.org/multipage/server-sent-events.html) from text
 * as it arrives, in pieces that may split a line or event anywhere. What EventSource does, for streams read with
 * fetch, which unlike EventSource can send an Authorization header.
 */
export class SseParser {
  private buffer = '';
  private type = '';
  private data: string[] = [];
  private id: string | undefined;
  /** The last piece ended in \r: if the next starts with \n, that \n belongs to the same line end. */
  private endedInCr = false;

  /** The events completed by this piece of text. */
  feed(chunk: string): SseMessage[] {
    this.buffer += this.endedInCr && chunk.startsWith('\n') ? chunk.slice(1) : chunk;
    this.endedInCr = chunk.endsWith('\r');
    const messages: SseMessage[] = [];
    // A line ends at \n, \r\n or \r
    const lines = this.buffer.split(/\r\n|\n|\r/);
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line === '') {
        if (this.data.length > 0) {
          messages.push({ type: this.type || 'message', data: this.data.join('\n'), ...(this.id !== undefined ? { id: this.id } : {}) });
        }
        this.type = '';
        this.data = [];
        continue;
      }
      if (line.startsWith(':')) continue;

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') this.type = value;
      else if (field === 'data') this.data.push(value);
      else if (field === 'id' && !value.includes('\0')) this.id = value;
    }
    return messages;
  }
}
